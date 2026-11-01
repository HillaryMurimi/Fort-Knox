import { afterEach, describe, expect, it, vi } from 'vitest';
import { salesCalendarConnections, type SalesCalendarConnection } from '../../src/config/sales-calendar.config.js';
import { AuthorizedSalesCalendar, calendarConfigurationHash } from '../../src/integrations/calendar/sales-calendar.provider.js';
import { validateCalendarProposal } from '../../src/modules/sales/sales-calendar.policy.js';
const connection: SalesCalendarConnection = { representativeId: 'a'.repeat(24), provider: 'GOOGLE', calendarId: 'owner@example.test', accountEmail: 'owner@example.test', timezone: 'Africa/Nairobi', clientId: 'controlled-client', clientSecret: 'controlled-client-secret', refreshToken: 'controlled-refresh' };
const window = { startsAt: new Date('2026-11-03T07:00:00Z'), endsAt: new Date('2026-11-03T08:00:00Z') };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
describe('Authorized calendar HTTP contracts', () => {
  it('centrally rejects duplicate representatives, malformed secrets input and invalid timezones', () => {
    expect(salesCalendarConnections.parse('[]')).toEqual([]);
    expect(salesCalendarConnections.safeParse(JSON.stringify([connection, connection])).success).toBe(false);
    expect(salesCalendarConnections.safeParse(JSON.stringify([{ ...connection, timezone: 'Invalid/Zone' }])).success).toBe(false);
    expect(salesCalendarConnections.safeParse('private malformed input').success).toBe(false);
    expect(salesCalendarConnections.safeParse(JSON.stringify([{ ...connection, provider: 'MICROSOFT' }])).success).toBe(false);
  });
  it('keeps recorded calendar identity stable across credential rotation but separates other calendars', () => {
    expect(calendarConfigurationHash(connection)).toBe(calendarConfigurationHash({ ...connection, clientSecret: 'rotated-secret', refreshToken: 'rotated-refresh' }));
    expect(calendarConfigurationHash(connection)).not.toBe(calendarConfigurationHash({ ...connection, calendarId: 'another-calendar' }));
  });
  it('queries Google actual free/busy on fixed hosts with authorized writer metadata', async () => {
    const http = vi.fn().mockImplementation(async (url: string) => {
      if (url === 'https://oauth2.googleapis.com/token') return response({ access_token: 'controlled-access', token_type: 'Bearer' });
      if (url.includes('/users/me/calendarList/')) return response({ id: connection.calendarId, accessRole: 'writer' });
      if (url === 'https://www.googleapis.com/calendar/v3/freeBusy') return response({ calendars: { [connection.calendarId]: { busy: [{ start: window.startsAt.toISOString(), end: window.endsAt.toISOString() }] } } });
      throw new Error('Unexpected external destination');
    }); vi.stubGlobal('fetch', http);
    expect(await new AuthorizedSalesCalendar(connection).availability(window)).toEqual([window]);
    for (const [url, options] of http.mock.calls as [string, RequestInit][]) { expect(['oauth2.googleapis.com', 'www.googleapis.com']).toContain(new URL(url).hostname); expect(options.redirect).toBe('error'); }
    const request = http.mock.calls.find(call => call[0].endsWith('/freeBusy'))![1] as RequestInit;
    expect(JSON.parse(String(request.body)).items).toEqual([{ id: connection.calendarId }]); expect(String(request.body)).not.toContain(connection.refreshToken);
  });
  it('creates one Google event with the deterministic key and actual invitation request', async () => {
    const http = vi.fn().mockImplementation(async (url: string) => url.includes('oauth2') ? response({ access_token: 'controlled-access', token_type: 'Bearer' }) : response({ id: 'a'.repeat(32), etag: 'provider-version', status: 'confirmed', start: { dateTime: window.startsAt.toISOString() }, end: { dateTime: window.endsAt.toISOString() }, attendees: [{ email: 'customer@example.test' }] })); vi.stubGlobal('fetch', http);
    const event = await new AuthorizedSalesCalendar(connection).create({ ...window, key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'Dapinni demo', attendee: 'customer@example.test', timezone: 'Africa/Nairobi' });
    expect(event.invitationRequested).toBe(true); expect(event.attendees).toEqual(['customer@example.test']);
    const [url, options] = http.mock.calls[1] as [string, RequestInit]; expect(url).toContain('?sendUpdates=all'); const body = JSON.parse(String(options.body)); expect(body.id).toBe('aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa'); expect(body.attendees).toEqual([{ email: 'customer@example.test' }]);
  });
  it('fails closed on provider errors without exposing credential-bearing payloads', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ error: 'private token ' + connection.refreshToken }, 401)));
    await expect(new AuthorizedSalesCalendar(connection).create({ ...window, key: 'a'.repeat(32), title: 'Dapinni demo', attendee: 'customer@example.test', timezone: 'Africa/Nairobi' })).rejects.toMatchObject({ code: 'CALENDAR_AUTH_UNAVAILABLE' });
  });
  it('sends conditional versions for updates/cancellations and preserves provider conflict errors', async () => {
    const http = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
      if (url.includes('oauth2')) return response({ access_token: 'controlled-access', token_type: 'Bearer' });
      if (options.method === 'DELETE') return new Response(null, { status: 204 });
      return response({ error: 'private provider response' }, 412);
    }); vi.stubGlobal('fetch', http);
    const provider = new AuthorizedSalesCalendar(connection);
    await expect(provider.update('known-event', 'reviewed-version', { ...window, key: 'a'.repeat(32), title: 'Dapinni demo', attendee: 'customer@example.test', timezone: 'Africa/Nairobi' })).rejects.toMatchObject({ code: 'CALENDAR_EVENT_CHANGED' });
    await provider.cancel('known-event', 'reviewed-version');
    const writes = http.mock.calls.filter(call => !call[0].includes('oauth2')) as [string, RequestInit][];
    expect(writes).toHaveLength(2); for (const [url, options] of writes) { expect(url).toContain('/events/known-event?sendUpdates=all'); expect(options.headers).toMatchObject({ 'If-Match': 'reviewed-version' }); }
  });
  it('uses tenant-bound Microsoft refresh and UTC immutable event IDs with transaction correlation', async () => {
    const c = { ...connection, provider: 'MICROSOFT' as const, tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', calendarId: 'calendar/id' };
    const http = vi.fn().mockImplementation(async (url: string) => url.includes('login.microsoftonline.com') ? response({ access_token: 'controlled-access', token_type: 'Bearer' }) : response({ id: 'immutable-event', '@odata.etag': 'version', start: { dateTime: '2026-11-03T07:00:00.0000000', timeZone: 'UTC' }, end: { dateTime: '2026-11-03T08:00:00.0000000', timeZone: 'UTC' }, attendees: [{ emailAddress: { address: 'customer@example.test' } }] })); vi.stubGlobal('fetch', http);
    const event = await new AuthorizedSalesCalendar(c).create({ ...window, key: c.tenantId, title: 'Dapinni demo', attendee: 'customer@example.test', timezone: 'Africa/Nairobi' }); expect(event.startsAt.toISOString()).toBe(window.startsAt.toISOString());
    const [url, options] = http.mock.calls[1] as [string, RequestInit]; expect(url).toBe('https://graph.microsoft.com/v1.0/me/calendars/calendar%2Fid/events'); expect(options.headers).toMatchObject({ Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"' }); expect(JSON.parse(String(options.body)).transactionId).toBe(c.tenantId);
  });
  it('does not interpret inaccessible calendar metadata as a missing or cancelled event', async () => {
    let accessible = false;
    const http = vi.fn().mockImplementation(async (url: string) => url.includes('oauth2') ? response({ access_token: 'controlled-access', token_type: 'Bearer' }) : url.includes('/calendarList/') ? accessible ? response({ id: connection.calendarId, accessRole: 'writer' }) : response({}, 404) : response({}, 404)); vi.stubGlobal('fetch', http);
    const provider = new AuthorizedSalesCalendar(connection);
    await expect(provider.get('known-event')).rejects.toMatchObject({ code: 'CALENDAR_PROVIDER_UNAVAILABLE' });
    accessible = true; expect(await provider.get('known-event')).toBeNull();
  });
  it('retains an explicit provider cancellation tombstone without inventing event times', async () => {
    const http = vi.fn().mockImplementation(async (url: string) => url.includes('oauth2') ? response({ access_token: 'controlled-access', token_type: 'Bearer' }) : url.includes('/calendarList/') ? response({ id: connection.calendarId, accessRole: 'writer' }) : response({ id: 'known-event', status: 'cancelled', etag: 'cancelled-version' })); vi.stubGlobal('fetch', http);
    expect(await new AuthorizedSalesCalendar(connection).get('known-event')).toEqual({ id: 'known-event', cancelled: true, etag: 'cancelled-version' });
  });
  it('rejects incomplete Microsoft availability instead of inventing a free window', async () => {
    const http = vi.fn().mockImplementation(async (url: string) => url.includes('login.microsoftonline.com') ? response({ access_token: 'controlled-access', token_type: 'Bearer' }) : url.includes('/calendarView?') ? response({ value: [], '@odata.nextLink': 'https://untrusted.test/next' }) : response({ id: connection.calendarId, canEdit: true })); vi.stubGlobal('fetch', http);
    await expect(new AuthorizedSalesCalendar({ ...connection, provider: 'MICROSOFT', tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }).availability(window)).rejects.toMatchObject({ code: 'CALENDAR_AVAILABILITY_INCOMPLETE' });
    expect(http.mock.calls.some(call => call[0].includes('untrusted.test'))).toBe(false);
  });
  it('validates generated meeting slots against actual checked availability', () => {
    vi.setSystemTime(new Date('2026-11-02T07:00:00Z'));
    const range = { startsAt: window.startsAt.toISOString(), endsAt: window.endsAt.toISOString() }, text = '2026-11-03T07:00:00Z / 2026-11-03T07:30:00Z';
    expect(() => validateCalendarProposal(text, range, [])).not.toThrow();
    expect(() => validateCalendarProposal(text, range, [window])).toThrow('actual checked availability');
    expect(() => validateCalendarProposal('Tomorrow at lunch', range, [])).toThrow('explicit ISO');
    expect(() => validateCalendarProposal('2026-11-04T07:00:00Z / 2026-11-04T07:30:00Z', range, [])).toThrow('actual checked availability');
    expect(() => validateCalendarProposal('2026-02-30T07:00:00Z / 2026-02-30T07:30:00Z', range, [])).toThrow('valid ISO dates');
  });
});
