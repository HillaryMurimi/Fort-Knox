import { z } from 'zod';
import { env } from '../../config/env.js';
import type { SalesCalendarConnection } from '../../config/sales-calendar.config.js';
import { AppError } from '../../core/errors/AppError.js';
import { readBoundedJson } from '../../core/integrations/http.js';
import { hashPayload } from '../../core/integrations/webhook.security.js';

export interface CalendarInterval { startsAt: Date; endsAt: Date }
export interface CalendarEvent extends CalendarInterval { id: string; etag?: string; cancelled: boolean; invitationRequested: boolean; attendees: string[] }
export interface CalendarCancellation { id: string; etag?: string; cancelled: true }
export type CalendarSnapshot = CalendarEvent | CalendarCancellation;
export interface CalendarBooking extends CalendarInterval { key: string; title: string; attendee: string; timezone: string }
export interface SalesCalendarProvider {
  readonly key: 'GOOGLE' | 'MICROSOFT'; readonly fingerprint: string;
  availability(window: CalendarInterval, excludeEventId?: string): Promise<CalendarInterval[]>;
  find(key: string, window: CalendarInterval): Promise<CalendarSnapshot | null>;
  create(input: CalendarBooking): Promise<CalendarEvent>;
  get(id: string): Promise<CalendarSnapshot | null>;
  update(id: string, etag: string, input: CalendarBooking): Promise<CalendarEvent>;
  cancel(id: string, etag: string): Promise<void>;
}
const eventId = z.string().min(1).max(1024), instant = z.iso.datetime({ offset: true });
const token = z.object({ access_token: z.string().min(1).max(16384), token_type: z.string().refine(value => value.toLowerCase() === 'bearer') });
export function calendarConfigurationHash(connection: SalesCalendarConnection) {
  // Credential rotation must not orphan a recorded event on the same authorized calendar.
  return hashPayload(Buffer.from(JSON.stringify({ representativeId: connection.representativeId, provider: connection.provider, calendarId: connection.calendarId, accountEmail: connection.accountEmail, clientId: connection.clientId, tenantId: connection.tenantId })));
}
export function assertCalendarWindow(window: CalendarInterval) {
  if (!Number.isFinite(window.startsAt.getTime()) || !Number.isFinite(window.endsAt.getTime()) || window.endsAt <= window.startsAt || window.endsAt.getTime() - window.startsAt.getTime() > 7 * 86400000) throw new AppError(400, 'CALENDAR_WINDOW_INVALID', 'Use a valid calendar interval of at most seven days');
}
function googleEvent(raw: unknown): CalendarEvent {
  const value = z.object({ id: eventId, etag: z.string().max(1024).optional(), status: z.string(), start: z.object({ dateTime: instant }), end: z.object({ dateTime: instant }), attendees: z.array(z.object({ email: z.string() })).max(200).optional() }).parse(raw);
  return { id: value.id, etag: value.etag, startsAt: new Date(value.start.dateTime), endsAt: new Date(value.end.dateTime), cancelled: value.status === 'cancelled', invitationRequested: !!value.attendees?.length, attendees: value.attendees?.map(item => item.email.toLowerCase()) ?? [] };
}
function microsoftEvent(raw: unknown): CalendarEvent {
  const date = z.object({ dateTime: z.string().min(10).max(80), timeZone: z.literal('UTC') });
  const value = z.object({ id: eventId, '@odata.etag': z.string().max(1024).optional(), isCancelled: z.boolean().optional(), start: date, end: date, attendees: z.array(z.object({ emailAddress: z.object({ address: z.string() }) })).max(200).optional() }).parse(raw);
  const parse = (value: string) => new Date(instant.parse(value.endsWith('Z') ? value : value + 'Z'));
  return { id: value.id, etag: value['@odata.etag'], startsAt: parse(value.start.dateTime), endsAt: parse(value.end.dateTime), cancelled: value.isCancelled ?? false, invitationRequested: !!value.attendees?.length, attendees: value.attendees?.map(item => item.emailAddress.address.toLowerCase()) ?? [] };
}
export class AuthorizedSalesCalendar implements SalesCalendarProvider {
  readonly key; readonly fingerprint;
  constructor(private readonly connection: SalesCalendarConnection) { this.key = connection.provider; this.fingerprint = calendarConfigurationHash(connection); }
  private async accessToken() {
    const c = this.connection, google = c.provider === 'GOOGLE';
    const endpoint = google ? 'https://oauth2.googleapis.com/token' : 'https://login.microsoftonline.com/' + c.tenantId + '/oauth2/v2.0/token';
    const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken, ...(!google ? { scope: 'https://graph.microsoft.com/Calendars.ReadWrite offline_access' } : {}) }) });
    if (!response.ok) throw new AppError(503, 'CALENDAR_AUTH_UNAVAILABLE', 'Calendar authorization could not be refreshed');
    return token.parse(await readBoundedJson(response)).access_token;
  }
  private base() { return this.key === 'GOOGLE' ? 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(this.connection.calendarId) : 'https://graph.microsoft.com/v1.0/me/calendars/' + encodeURIComponent(this.connection.calendarId); }
  private async request(path: string, init: RequestInit = {}, allowMissing = false, googleMembership = false): Promise<unknown> {
    try {
      const bearer = await this.accessToken();
      const endpoint = googleMembership ? 'https://www.googleapis.com/calendar/v3/users/me/calendarList/' + encodeURIComponent(this.connection.calendarId) : this.base() + path;
      const response = await fetch(endpoint, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000), headers: { authorization: 'Bearer ' + bearer, 'content-type': 'application/json', ...(this.key === 'MICROSOFT' ? { Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"' } : {}), ...init.headers } });
      if (allowMissing && [404, 410].includes(response.status)) return null;
      if (!response.ok) throw new AppError(response.status === 412 || response.status === 409 ? 409 : 503, response.status === 412 ? 'CALENDAR_EVENT_CHANGED' : response.status === 409 ? 'CALENDAR_CREATE_CONFLICT' : 'CALENDAR_PROVIDER_UNAVAILABLE', 'Calendar operation was rejected or unavailable');
      return response.status === 204 ? null : await readBoundedJson(response);
    } catch (error) { if (error instanceof AppError) throw error; throw new AppError(503, 'CALENDAR_PROVIDER_UNAVAILABLE', 'Calendar operation could not be confirmed'); }
  }
  async availability(window: CalendarInterval, excludeEventId?: string) {
    try { return await this.queryAvailability(window, excludeEventId); }
    catch (error) { if (error instanceof AppError) throw error; throw new AppError(503, 'CALENDAR_AVAILABILITY_UNAVAILABLE', 'Actual calendar availability could not be verified'); }
  }
  private async queryAvailability(window: CalendarInterval, excludeEventId?: string) {
    assertCalendarWindow(window);
    if (this.key === 'GOOGLE') {
      const access = z.object({ id: z.string(), accessRole: z.enum(['writer', 'owner']) }).parse(await this.request('', {}, false, true));
      if (access.id !== this.connection.calendarId && this.connection.calendarId !== 'primary') throw new AppError(409, 'CALENDAR_IDENTITY_MISMATCH', 'Configured calendar does not match provider metadata');
      if (excludeEventId) {
        const query = new URLSearchParams({ timeMin: window.startsAt.toISOString(), timeMax: window.endsAt.toISOString(), singleEvents: 'true', maxResults: '100' });
        const events = z.object({ items: z.array(z.object({ id: eventId, status: z.string(), transparency: z.string().optional(), start: z.object({ dateTime: instant.optional(), date: z.string().optional() }), end: z.object({ dateTime: instant.optional(), date: z.string().optional() }) })).max(100), nextPageToken: z.string().optional() }).parse(await this.request('/events?' + query));
        if (events.nextPageToken) throw new AppError(503, 'CALENDAR_AVAILABILITY_INCOMPLETE', 'Choose a shorter interval; calendar availability exceeded the bounded page');
        return events.items.filter(item => item.id !== excludeEventId && item.status !== 'cancelled' && item.transparency !== 'transparent').map(item => item.start.dateTime && item.end.dateTime ? { startsAt: new Date(item.start.dateTime), endsAt: new Date(item.end.dateTime) } : window);
      }
      const bearer = await this.accessToken();
      const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { authorization: 'Bearer ' + bearer, 'content-type': 'application/json' }, body: JSON.stringify({ timeMin: window.startsAt.toISOString(), timeMax: window.endsAt.toISOString(), timeZone: this.connection.timezone, items: [{ id: access.id }] }) });
      if (!response.ok) throw new AppError(503, 'CALENDAR_AVAILABILITY_UNAVAILABLE', 'Actual calendar availability is unavailable');
      const value = z.object({ calendars: z.record(z.string(), z.object({ busy: z.array(z.object({ start: instant, end: instant })).max(1000), errors: z.array(z.unknown()).optional() })) }).parse(await readBoundedJson(response));
      const calendar = value.calendars[access.id]; if (!calendar || calendar.errors?.length) throw new AppError(503, 'CALENDAR_AVAILABILITY_UNAVAILABLE', 'Calendar returned incomplete availability');
      return calendar.busy.map(item => ({ startsAt: new Date(item.start), endsAt: new Date(item.end) }));
    }
    const metadata = z.object({ id: z.string(), canEdit: z.literal(true) }).parse(await this.request('?$select=id,canEdit'));
    if (metadata.id !== this.connection.calendarId) throw new AppError(409, 'CALENDAR_IDENTITY_MISMATCH', 'Configured calendar does not match provider metadata');
    const query = new URLSearchParams({ startDateTime: window.startsAt.toISOString(), endDateTime: window.endsAt.toISOString(), '$top': '100', '$select': 'id,start,end,isCancelled,showAs' });
    const page = z.object({ value: z.array(z.object({ id: eventId, isCancelled: z.boolean().optional(), showAs: z.string(), start: z.object({ dateTime: z.string(), timeZone: z.literal('UTC') }), end: z.object({ dateTime: z.string(), timeZone: z.literal('UTC') }) })).max(100), '@odata.nextLink': z.string().optional() }).parse(await this.request('/calendarView?' + query));
    // Incomplete availability must never be represented as a free slot.
    if (page['@odata.nextLink']) throw new AppError(503, 'CALENDAR_AVAILABILITY_INCOMPLETE', 'Choose a shorter interval; calendar availability exceeded the bounded page');
    return page.value.filter(item => item.id !== excludeEventId && !item.isCancelled && item.showAs !== 'free').map(item => { const parsed = microsoftEvent(item); return { startsAt: parsed.startsAt, endsAt: parsed.endsAt }; });
  }
  private payload(input: CalendarBooking) {
    assertCalendarWindow(input);
    if (this.key === 'GOOGLE') return { id: input.key.replace(/-/g, '').toLowerCase(), summary: input.title, description: 'Requested Dapinni customer briefing.', start: { dateTime: input.startsAt.toISOString(), timeZone: input.timezone }, end: { dateTime: input.endsAt.toISOString(), timeZone: input.timezone }, attendees: [{ email: input.attendee }], extendedProperties: { private: { dapinniMeeting: input.key } } };
    return { transactionId: input.key, subject: input.title, body: { contentType: 'text', content: 'Requested Dapinni customer briefing.' }, start: { dateTime: input.startsAt.toISOString().replace(/Z$/, ''), timeZone: 'UTC' }, end: { dateTime: input.endsAt.toISOString().replace(/Z$/, ''), timeZone: 'UTC' }, attendees: [{ emailAddress: { address: input.attendee }, type: 'required' }], allowNewTimeProposals: false };
  }
  async create(input: CalendarBooking) {
    const raw = await this.request('/events' + (this.key === 'GOOGLE' ? '?sendUpdates=all' : ''), { method: 'POST', body: JSON.stringify(this.payload(input)) });
    return this.key === 'GOOGLE' ? googleEvent(raw) : microsoftEvent(raw);
  }
  async get(id: string) {
    // An inaccessible calendar must not turn an event 404 into a cancellation claim.
    if (this.key === 'GOOGLE') {
      const access = z.object({ id: z.string(), accessRole: z.enum(['writer', 'owner']) }).parse(await this.request('', {}, false, true));
      if (this.connection.calendarId !== 'primary' && access.id !== this.connection.calendarId) throw new AppError(409, 'CALENDAR_IDENTITY_MISMATCH', 'Calendar identity changed during reconciliation');
    }
    else z.object({ id: z.literal(this.connection.calendarId), canEdit: z.literal(true) }).parse(await this.request('?$select=id,canEdit'));
    const raw = await this.request('/events/' + encodeURIComponent(eventId.parse(id)), {}, true);
    if (!raw) return null;
    if (z.object({ id: eventId }).parse(raw).id !== id) throw new AppError(409, 'CALENDAR_PROVIDER_REFERENCE_CHANGED', 'Provider returned a different event reference');
    if (this.key === 'GOOGLE' && z.object({ status: z.string() }).parse(raw).status === 'cancelled') { const value = z.object({ id: eventId, etag: z.string().max(1024).optional() }).parse(raw); return { ...value, cancelled: true as const }; }
    if (this.key === 'MICROSOFT' && z.object({ isCancelled: z.boolean().optional() }).parse(raw).isCancelled) { const value = z.object({ id: eventId, '@odata.etag': z.string().max(1024).optional() }).parse(raw); return { id: value.id, etag: value['@odata.etag'], cancelled: true as const }; }
    return this.key === 'GOOGLE' ? googleEvent(raw) : microsoftEvent(raw);
  }
  async find(key: string, window: CalendarInterval) {
    if (this.key === 'GOOGLE') return this.get(key.replace(/-/g, '').toLowerCase());
    const query = new URLSearchParams({ startDateTime: window.startsAt.toISOString(), endDateTime: window.endsAt.toISOString(), '$top': '100', '$select': 'id,start,end,isCancelled,attendees,transactionId' });
    const page = z.object({ value: z.array(z.object({ transactionId: z.string().optional() }).passthrough()).max(100), '@odata.nextLink': z.string().optional() }).parse(await this.request('/calendarView?' + query));
    if (page['@odata.nextLink']) throw new AppError(503, 'CALENDAR_RECONCILIATION_INCOMPLETE', 'Provider event lookup exceeded the bounded page');
    const matches = page.value.filter(item => item.transactionId === key);
    if (matches.length > 1) throw new AppError(409, 'CALENDAR_EVENT_AMBIGUOUS', 'Multiple provider events match the command; manual reconciliation required');
    return matches[0] ? microsoftEvent(matches[0]) : null;
  }
  async update(id: string, etag: string, input: CalendarBooking) {
    const payload = this.payload(input); delete (payload as { id?: string }).id; delete (payload as { transactionId?: string }).transactionId;
    const raw = await this.request('/events/' + encodeURIComponent(eventId.parse(id)) + (this.key === 'GOOGLE' ? '?sendUpdates=all' : ''), { method: 'PATCH', headers: { 'If-Match': etag }, body: JSON.stringify(payload) });
    return this.key === 'GOOGLE' ? googleEvent(raw) : microsoftEvent(raw);
  }
  async cancel(id: string, etag: string) { await this.request('/events/' + encodeURIComponent(eventId.parse(id)) + (this.key === 'GOOGLE' ? '?sendUpdates=all' : ''), { method: 'DELETE', headers: { 'If-Match': etag } }); }
}
const testProviders = new Map<string, SalesCalendarProvider>();
export function setSalesCalendarTestProvider(representativeId: string, provider?: SalesCalendarProvider) { if (env.NODE_ENV !== 'test') throw new Error('TEST_PROVIDER_FORBIDDEN'); if (provider) testProviders.set(representativeId, provider); else testProviders.delete(representativeId); }
export function salesCalendarProvider(representativeId: string): SalesCalendarProvider | undefined {
  if (env.NODE_ENV === 'test') return testProviders.get(representativeId);
  const connection = env.SALES_CALENDAR_CONNECTIONS_JSON.find(item => item.representativeId === representativeId);
  return connection ? new AuthorizedSalesCalendar(connection) : undefined;
}
