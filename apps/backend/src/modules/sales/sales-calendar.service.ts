import { randomUUID } from 'node:crypto';
import { Types, type ClientSession } from 'mongoose';
import { env } from '../../config/env.js';
import { calendarTimeZone } from '../../config/sales-calendar.config.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import { AppError } from '../../core/errors/AppError.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { SalesMeeting } from '../../database/models/SalesMeeting.js';
import { SalesLead } from '../../database/models/SalesLead.js';
import { SalesActivity } from '../../database/models/SalesActivity.js';
import { Organization } from '../../database/models/Organization.js';
import { Job } from '../../database/models/Job.js';
import { PlatformSwitch } from '../../database/models/PlatformSwitch.js';
import { SalesAgentApproval, SalesAgentRun } from '../../database/models/SalesAgent.js';
import { AuditService } from '../audit/audit.service.js';
import { assertFreshAdmin } from '../auth/admin-security.js';
import { assertSwitchEnabled } from '../platform-control/platform-control.guard.js';
import { salesCalendarProvider, type CalendarEvent } from '../../integrations/calendar/sales-calendar.provider.js';
import { SalesAgentRepository, salesTransaction } from './sales-agent.repository.js';
import { SuccessRepository, assertSuccessPermission, lockSalesRepresentative, salesMeetingConflict } from './sales-success.repository.js';
import { calendarAvailabilitySchema, calendarCommandSchema } from './sales-calendar.schemas.js';
import { z } from 'zod';
import { payloadHash, authorizeTask } from './sales-agent.service.js';
import { agentOutputSchema } from './sales-agent.schemas.js';
import { opaqueHash } from './sales-outreach.policy.js';

async function approvedMeetingOrigin(id: string, leadId: string, start: Date, end: Date) {
  const proposal = await SalesAgentApproval.findOne({ _id: id, leadId, tool: 'MEETING_PROPOSAL', status: { $in: ['APPROVED', 'COMPLETED'] }, decisionAt: { $gte: new Date(Date.now() - 7 * 86400000) } });
  if (!proposal || payloadHash(proposal.payload) !== proposal.payloadHash) throw new AppError(409, 'CALENDAR_PROPOSAL_CHANGED', 'Select a recently approved meeting proposal for this customer');
  const run = await SalesAgentRun.findOne({ _id: proposal.runId, agent: 'MEETING_COORDINATOR' });
  if (!run) throw new AppError(409, 'CALENDAR_PROPOSAL_CHANGED', 'Origin coordinator run is unavailable');
  await authorizeTask(await SalesAgentRepository.principal(run.requestedBy), leadId, 'MEETING_COORDINATOR');
  await assertSwitchEnabled('SALES_AI_RUNTIME'); await assertSwitchEnabled('SALES_AGENT_MEETING_COORDINATOR');
  const config = await SalesAgentRepository.config('MEETING_COORDINATOR');
  if (!config?.enabled || config.paused) throw new AppError(409, 'AGENT_PAUSED', 'Origin coordinator is paused');
  const action = agentOutputSchema.shape.action.parse(proposal.payload);
  const times = (action.text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})/g) ?? []).map(Date.parse);
  if (!times.some((value, n) => n % 2 === 0 && value === start.getTime() && times[n + 1] === end.getTime())) throw new AppError(409, 'CALENDAR_PROPOSAL_SLOT_MISMATCH', 'The selected meeting interval is not a start/end pair in the approved proposal');
}
function windowPolicy(start: Date, end: Date) { if (start <= new Date() || start.getTime() > Date.now() + 180 * 86400000 || end <= start || end.getTime() - start.getTime() > 86400000) throw new AppError(400, 'CALENDAR_SLOT_INVALID', 'Select a future meeting of at most 24 hours within 180 days'); }
async function readyIndexes() {
  if (env.NODE_ENV !== 'production') return;
  const indexes = await SalesMeeting.collection.indexes().catch(() => []), jobs = await Job.collection.indexes().catch(() => []);
  if (!indexes.some(item => item.name === 'sales_calendar_creation_unique' && item.unique && item.key['calendar.creationKey'] === 1 && item.partialFilterExpression?.['calendar.creationKey']?.$type === 'string') || !jobs.some(item => item.name === 'dedupeKey_1' && item.unique && item.key.dedupeKey === 1)) throw new AppError(503, 'SALES_INDEXES_REQUIRED', 'Install the additive sales calendar and Job indexes before booking');
}
export class SalesCalendarService {
  static async readiness() { await readyIndexes(); }
  static async startMonitor(session: ClientSession, actor?: Types.ObjectId) {
    const cycleKey = String(Math.floor(Date.now() / 900000));
    await Job.updateOne({ dedupeKey: 'sales-calendar-scan:' + cycleKey + ':activation:' + randomUUID() }, { $setOnInsert: { type: 'sales.calendar.scan', payload: { cycleKey }, availableAt: new Date(), maxAttempts: 5, createdBy: actor } }, { session, upsert: true });
  }
  static async scan(raw: unknown) {
    const input = z.object({ cycleKey: z.string().regex(/^\d{1,10}$/), afterMeetingId: z.string().regex(/^[a-f\d]{24}$/i).optional() }).strict().parse(raw);
    if (!await PlatformSwitch.exists({ key: 'SALES_CALENDAR', enabled: true, mode: 'ON' })) return { skipped: 'DISABLED' };
    const records = await SalesMeeting.find({ 'calendar.status': 'CONFIRMED', endsAt: { $gte: new Date(Date.now() - 7 * 86400000) }, startsAt: { $lte: new Date(Date.now() + 180 * 86400000) }, ...(input.afterMeetingId ? { _id: { $gt: new Types.ObjectId(input.afterMeetingId) } } : {}) }).select('_id').sort({ _id: 1 }).limit(50).lean();
    await salesTransaction(async session => {
      for (const meeting of records) await Job.updateOne({ dedupeKey: 'sales-calendar-poll:' + input.cycleKey + ':' + meeting._id }, { $setOnInsert: { type: 'sales.calendar.reconcile', payload: { meetingId: String(meeting._id) }, availableAt: new Date(), maxAttempts: 3 } }, { session, upsert: true });
      const last = records.at(-1), more = records.length === 50 && last, cycleKey = more ? input.cycleKey : String(Math.floor(Date.now() / 900000) + 1);
      await Job.updateOne({ dedupeKey: 'sales-calendar-scan:' + cycleKey + ':' + (more ? last._id : 'start') }, { $setOnInsert: { type: 'sales.calendar.scan', payload: { cycleKey, ...(more ? { afterMeetingId: String(last._id) } : {}) }, availableAt: more ? new Date() : new Date(Number(cycleKey) * 900000), maxAttempts: 5 } }, { session, upsert: true });
    });
    return { scanned: records.length };
  }
  static async reconcile(meetingId: string) {
    const meeting = await SalesMeeting.findById(meetingId);
    if (meeting?.calendar?.status !== 'CONFIRMED') return { skipped: true };
    const principal = await SalesAgentRepository.principal(meeting.calendar.requestedBy), commandId = randomUUID();
    await this.command(principal, String(meeting.leadId), meetingId, { revision: meeting.revision, commandId, action: 'SYNC', evidence: 'Scheduled read-only reconciliation of an existing reviewed external calendar event.' });
    return { queued: true };
  }
  static async availability(auth: AuthenticatedUser, leadId: string, raw: unknown) {
    const input = calendarAvailabilitySchema.parse(raw);
    await SuccessRepository.load(auth, leadId, 'sales.meetings.read');
    assertSuccessPermission(auth, 'sales.meetings.create');
    if (!auth.isPlatformAdmin && input.representativeId !== String(auth.userId)) throw new AppError(403, 'FORBIDDEN', 'Delegates may inspect only their configured sales calendar');
    await assertSwitchEnabled('SALES_CALENDAR');
    const provider = salesCalendarProvider(input.representativeId);
    if (!provider) throw new AppError(503, 'CALENDAR_NOT_CONNECTED', 'This representative has no authorized calendar connection');
    const startsAt = new Date(input.startsAt), endsAt = new Date(input.endsAt);
    const busy = await provider.availability({ startsAt, endsAt });
    const current = await SalesAgentRepository.principal(auth.userId);
    await SuccessRepository.load(current, leadId, 'sales.meetings.read'); assertSuccessPermission(current, 'sales.meetings.create');
    if (!current.isPlatformAdmin && input.representativeId !== String(current.userId)) throw new AppError(403, 'FORBIDDEN', 'Calendar permission changed during lookup');
    const local = await SalesMeeting.find({ representativeId: input.representativeId, $or: [{ status: 'SCHEDULED', startsAt: { $lt: endsAt }, endsAt: { $gt: startsAt } }, { 'calendar.status': 'PENDING', 'calendar.targetStart': { $lt: endsAt }, 'calendar.targetEnd': { $gt: startsAt } }] }).select('startsAt endsAt calendar.status calendar.operation calendar.targetStart calendar.targetEnd').limit(101).lean();
    if (local.length > 100) throw new AppError(503, 'CALENDAR_AVAILABILITY_INCOMPLETE', 'Choose a shorter calendar interval');
    await AuditService.record({ actorUserId: auth.userId, action: 'sales.calendar.availability.checked', resourceType: 'SalesLead', resourceId: new Types.ObjectId(leadId), metadata: { representativeId: input.representativeId, provider: provider.key, startsAt: input.startsAt, endsAt: input.endsAt } });
    return { provider: provider.key, checkedAt: new Date(), busy: [...busy, ...local.flatMap(item => [{ startsAt: item.startsAt, endsAt: item.endsAt }, ...(item.calendar?.status === 'PENDING' && ['CREATE', 'RESCHEDULE'].includes(item.calendar.operation) ? [{ startsAt: item.calendar.targetStart, endsAt: item.calendar.targetEnd }] : [])])], availabilityOnly: true, reservationCreated: false };
  }
  static async command(auth: AuthenticatedUser, leadId: string, meetingId: string, raw: unknown) {
    const input = calendarCommandSchema.parse(raw), hash = payloadHash(input);
    if (input.action !== 'SYNC') assertFreshAdmin(auth);
    await readyIndexes();
    const lead = await SuccessRepository.load(auth, leadId, 'sales.meetings.update');
    const initial = await SalesMeeting.findOne({ _id: meetingId, leadId: lead._id });
    if (!initial) throw new AppError(404, 'MEETING_NOT_FOUND', 'Meeting not found');
    if (!auth.isPlatformAdmin && String(initial.representativeId) !== String(auth.userId)) throw new AppError(403, 'FORBIDDEN', 'Delegates may synchronize only their own meetings');
    if (initial.calendar?.commandId === input.commandId) {
      if (initial.calendar.commandHash !== hash) throw new AppError(409, 'COMMAND_REUSED', 'Calendar command ID belongs to different content');
      return { status: initial.calendar.status, queued: initial.calendar.status === 'PENDING' };
    }
    if (initial.revision !== input.revision || (initial.calendar?.status === 'PENDING' && (input.action !== 'SYNC' || (initial.calendar.leaseUntil && initial.calendar.leaseUntil > new Date()))) || (initial.calendar?.status === 'UNCERTAIN' && input.action !== 'SYNC')) throw new AppError(409, 'CALENDAR_MEETING_CHANGED', 'Refresh the meeting or reconcile its uncertain provider outcome first');
    if (input.action !== 'SYNC') await assertSwitchEnabled('SALES_CALENDAR');
    const provider = salesCalendarProvider(String(initial.representativeId));
    if (!provider) throw new AppError(503, 'CALENDAR_NOT_CONNECTED', 'Representative calendar is unavailable');
    if (initial.calendar && initial.calendar.fingerprint !== provider.fingerprint) throw new AppError(409, 'CALENDAR_CONNECTION_CHANGED', 'Original calendar connection changed; reconcile with the original provider before further commands');
    if (input.action === 'CREATE' && (initial.status !== 'SCHEDULED' || initial.calendar?.attemptedAt || initial.calendar?.eventId)) throw new AppError(409, 'CALENDAR_CREATE_NOT_ALLOWED', 'Only a scheduled meeting without a prior provider attempt can be booked');
    if (input.action !== 'CREATE' && !initial.calendar) throw new AppError(409, 'CALENDAR_EVENT_REQUIRED', 'This meeting has no external calendar operation');
    if (input.action === 'RESCHEDULE' && initial.status !== 'SCHEDULED') throw new AppError(409, 'CALENDAR_RESCHEDULE_NOT_ALLOWED', 'Only a scheduled meeting can be rescheduled');
    if ((input.action === 'RESCHEDULE') !== !!(input.startsAt && input.endsAt) || (input.startsAt && !input.endsAt) || (!input.startsAt && input.endsAt)) throw new AppError(400, 'CALENDAR_SLOT_REQUIRED', 'Supply both new times only when rescheduling');
    const startsAt = input.startsAt ? new Date(input.startsAt) : input.action === 'SYNC' ? initial.calendar?.targetStart ?? initial.startsAt : initial.startsAt, endsAt = input.endsAt ? new Date(input.endsAt) : input.action === 'SYNC' ? initial.calendar?.targetEnd ?? initial.endsAt : initial.endsAt;
    if (['CREATE', 'RESCHEDULE'].includes(input.action)) windowPolicy(startsAt, endsAt);
    if (input.originApprovalId) {
      assertSuccessPermission(auth, 'sales.agents.read'); assertSuccessPermission(auth, 'sales.notes.read');
      if (!['CREATE', 'RESCHEDULE'].includes(input.action)) throw new AppError(400, 'CALENDAR_PROPOSAL_ACTION_INVALID', 'A meeting proposal can authorize only a reviewed booking or reschedule');
      await approvedMeetingOrigin(input.originApprovalId, leadId, startsAt, endsAt);
    }
    const organization = lead.organizationId ? await Organization.findById(lead.organizationId).select('regionalProfile.timeZone').lean() : null;
    const timezone = input.timezone ?? organization?.regionalProfile?.timeZone ?? initial.timezone ?? 'Africa/Nairobi';
    calendarTimeZone.parse(timezone);
    if (['CREATE', 'RESCHEDULE'].includes(input.action) && !lead.email) throw new AppError(409, 'CALENDAR_ATTENDEE_REQUIRED', 'Record the primary email and evidence of the customer-selected meeting before inviting');
    return salesTransaction(async session => {
      const principal = await SalesAgentRepository.principal(auth.userId);
      await SuccessRepository.load(principal, leadId, 'sales.meetings.update', session);
      if (input.action !== 'SYNC') AuthorizationService.assertPlatformAdmin(principal);
      await lockSalesRepresentative(String(initial.representativeId), session);
      if (['CREATE', 'RESCHEDULE'].includes(input.action) && await salesMeetingConflict(String(initial.representativeId), startsAt, endsAt, session, meetingId)) throw new AppError(409, 'MEETING_CONFLICT', 'Representative already has a local meeting or pending hold');
      const meeting = await SalesMeeting.findOne({ _id: meetingId, leadId: lead._id, revision: input.revision }).select('+calendar.attendee').session(session);
      if (!meeting) throw new AppError(409, 'CALENDAR_MEETING_CHANGED', 'Meeting changed while preparing the calendar command');
      if (meeting.calendar?.leaseUntil && meeting.calendar.leaseUntil > new Date()) throw new AppError(409, 'CALENDAR_COMMAND_BUSY', 'An existing worker owns this calendar operation');
      const previous = meeting.toObject().calendar;
      const contentExpiresAt = ['CREATE', 'RESCHEDULE'].includes(input.action) ? new Date(Math.max(endsAt.getTime(), Date.now()) + env.SALES_OUTREACH_CONTENT_RETENTION_DAYS * 86400000) : previous?.contentExpiresAt ?? new Date(Date.now() + env.SALES_OUTREACH_CONTENT_RETENTION_DAYS * 86400000);
      meeting.timezone = timezone;
      meeting.calendar = { ...previous, provider: provider.key, fingerprint: provider.fingerprint, status: 'PENDING', operation: input.action, commandId: input.commandId, commandHash: hash, originApprovalId: input.originApprovalId ? new Types.ObjectId(input.originApprovalId) : undefined, creationKey: previous?.creationKey ?? input.commandId.toLowerCase(), requestedBy: auth.userId, requestedAt: new Date(), targetStart: startsAt, targetEnd: endsAt, evidence: contentExpiresAt > new Date() ? input.evidence : undefined, contentExpiresAt, contentRedactedAt: ['CREATE', 'RESCHEDULE'].includes(input.action) ? undefined : previous?.contentRedactedAt, attendee: ['CREATE', 'RESCHEDULE'].includes(input.action) ? lead.email : contentExpiresAt > new Date() ? previous?.attendee : undefined, attendeeHash: ['CREATE', 'RESCHEDULE'].includes(input.action) ? opaqueHash(lead.email ?? '') : previous?.attendeeHash, attempt: 0, attemptedAt: input.action === 'SYNC' ? previous?.attemptedAt : undefined, leaseOwner: undefined, leaseUntil: undefined, errorCode: undefined };
      meeting.revision += 1; await meeting.save({ session });
      await Job.create([{ type: 'sales.calendar.execute', payload: { meetingId, commandId: input.commandId }, dedupeKey: 'sales-calendar:' + meetingId + ':' + input.commandId, maxAttempts: 5, availableAt: new Date(), createdBy: auth.userId }], { session });
      await Job.updateOne({ dedupeKey: 'sales-calendar-retention:' + meetingId + ':' + input.commandId }, { $setOnInsert: { type: 'sales.calendar.expire', payload: { meetingId }, availableAt: contentExpiresAt, maxAttempts: 5 } }, { session, upsert: true });
      await AuditService.record({ actorUserId: auth.userId, action: 'sales.calendar.command.reviewed', resourceType: 'SalesMeeting', resourceId: meeting._id, metadata: { action: input.action, commandId: input.commandId, commandHash: hash, originApprovalId: input.originApprovalId, evidenceHash: opaqueHash(input.evidence), startsAt, endsAt, timezone, provider: provider.key } }, session);
      return { status: 'PENDING', queued: true };
    }).catch((error: unknown) => {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) throw new AppError(409, 'CALENDAR_COMMAND_REUSED', 'This creation command already belongs to a recorded calendar operation');
      throw error;
    });
  }
  static async execute(meetingId: string, commandId: string) {
    const owner = randomUUID(), now = new Date();
    const meeting = await SalesMeeting.findOneAndUpdate({ _id: meetingId, 'calendar.commandId': commandId, 'calendar.status': { $in: ['PENDING', 'UNCERTAIN'] }, $or: [{ 'calendar.leaseUntil': { $exists: false } }, { 'calendar.leaseUntil': { $lte: now } }] }, { $set: { 'calendar.leaseOwner': owner, 'calendar.leaseUntil': new Date(now.getTime() + 300000) } }, { returnDocument: 'after' }).select('+calendar.attendee');
    if (!meeting?.calendar) return { skipped: true };
    const state = meeting.calendar, provider = salesCalendarProvider(String(meeting.representativeId));
    try {
      if (!provider || provider.fingerprint !== state.fingerprint) throw new AppError(409, 'CALENDAR_CONNECTION_CHANGED', 'Reviewed calendar connection changed');
      const principal = await SalesAgentRepository.principal(state.requestedBy);
      const lead = await SuccessRepository.load(principal, String(meeting.leadId), 'sales.meetings.update');
      if (state.operation !== 'SYNC') AuthorizationService.assertPlatformAdmin(principal);
      if (state.originApprovalId && ['CREATE', 'RESCHEDULE'].includes(state.operation) && !state.attemptedAt) await approvedMeetingOrigin(String(state.originApprovalId), String(meeting.leadId), state.targetStart, state.targetEnd);
      if (['CREATE', 'RESCHEDULE'].includes(state.operation) && meeting.status !== 'SCHEDULED') throw new AppError(409, 'CALENDAR_MEETING_CHANGED', 'Meeting outcome changed after review');
      const window = { startsAt: state.targetStart, endsAt: state.targetEnd };
      const finishObserved = async (event: CalendarEvent, status: 'CONFIRMED' | 'CONFLICT', code?: string) => {
        // Keep a known provider reference even if the subsequent conflict read fails.
        const recorded = await SalesMeeting.updateOne({ _id: meetingId, 'calendar.commandId': commandId, 'calendar.leaseOwner': owner }, { $set: { 'calendar.eventId': event.id, 'calendar.etag': event.etag, 'calendar.invitationRequested': event.invitationRequested, 'calendar.eventRecordedAt': new Date() } });
        if (!recorded.matchedCount) return { skipped: true };
        if (status === 'CONFIRMED') {
          const busy = await provider.availability({ startsAt: event.startsAt, endsAt: event.endsAt }, event.id);
          if (busy.some(item => item.startsAt < event.endsAt && item.endsAt > event.startsAt)) { status = 'CONFLICT'; code = 'CALENDAR_EXTERNAL_CONFLICT'; }
        }
        return await this.finish(meetingId, commandId, owner, event, status, code);
      };
      let event = state.eventId ? await provider.get(state.eventId) : await provider.find(state.creationKey, window);
      if (event?.cancelled) return await this.finish(meetingId, commandId, owner, null, 'CANCELLED');
      if (event && !('startsAt' in event)) throw new AppError(503, 'CALENDAR_PROVIDER_UNAVAILABLE', 'Calendar returned an unsupported event state');
      if (state.operation === 'CANCEL' && !event && state.eventId) return await this.finish(meetingId, commandId, owner, null, 'CANCELLED');
      const matches = (value: CalendarEvent) => !value.cancelled && value.startsAt.getTime() === state.targetStart.getTime() && value.endsAt.getTime() === state.targetEnd.getTime() && !!state.attendeeHash && value.attendees.some(email => opaqueHash(email) === state.attendeeHash);
      if (state.operation === 'SYNC' || state.attemptedAt) {
        if (!event && state.eventId) return await this.finish(meetingId, commandId, owner, null, 'CONFLICT', 'CALENDAR_EVENT_MISSING');
        if (!event) return await this.finish(meetingId, commandId, owner, null, state.attemptedAt ? 'UNCERTAIN' : 'FAILED', state.attemptedAt ? 'CALENDAR_OUTCOME_UNKNOWN' : 'CALENDAR_NO_PROVIDER_ATTEMPT');
        const valid = state.operation === 'SYNC' ? !event.cancelled && !!state.attendeeHash && event.attendees.some(email => opaqueHash(email) === state.attendeeHash) : matches(event);
        return await finishObserved(event, valid ? 'CONFIRMED' : 'CONFLICT', valid ? undefined : 'CALENDAR_EXTERNAL_CHANGE');
      }
      await assertSwitchEnabled('SALES_CALENDAR');
      if (state.requestedAt.getTime() + 86400000 <= Date.now()) throw new AppError(409, 'CALENDAR_APPROVAL_EXPIRED', 'Calendar approval expired');
      if (['CREATE', 'RESCHEDULE'].includes(state.operation)) {
        windowPolicy(window.startsAt, window.endsAt);
        if (!lead.email || opaqueHash(lead.email) !== state.attendeeHash) throw new AppError(409, 'CALENDAR_ATTENDEE_CHANGED', 'Primary customer email changed after review');
        if (state.operation === 'CREATE' && event) return await finishObserved(event, matches(event) ? 'CONFIRMED' : 'CONFLICT', matches(event) ? undefined : 'CALENDAR_EXTERNAL_CHANGE');
        const busy = await provider.availability(window, state.operation === 'RESCHEDULE' ? event?.id : undefined);
        if (busy.some(item => item.startsAt < window.endsAt && item.endsAt > window.startsAt)) throw new AppError(409, 'CALENDAR_SLOT_BUSY', 'Provider calendar is no longer available');
      }
      if (state.operation !== 'CREATE' && (!event || !event.etag || event.cancelled)) throw new AppError(409, 'CALENDAR_EVENT_CHANGED', 'The original external event changed or disappeared');
      if (state.operation !== 'CREATE' && state.etag !== event?.etag) throw new AppError(409, 'CALENDAR_EVENT_CHANGED', 'External event changed after the reviewed snapshot; synchronize and review again');
      await salesTransaction(async session => {
        await lockSalesRepresentative(String(meeting.representativeId), session);
        if (['CREATE', 'RESCHEDULE'].includes(state.operation) && await salesMeetingConflict(String(meeting.representativeId), state.targetStart, state.targetEnd, session, meetingId)) throw new AppError(409, 'MEETING_CONFLICT', 'A local meeting conflicts with this reservation');
        const current = await SalesMeeting.findOne({ _id: meetingId, 'calendar.commandId': commandId, 'calendar.leaseOwner': owner, 'calendar.status': 'PENDING' }).session(session);
        if (!current?.calendar) throw new AppError(409, 'CALENDAR_COMMAND_CHANGED', 'Calendar command no longer owns its reservation');
        if (['CREATE', 'RESCHEDULE'].includes(state.operation) && current.status !== 'SCHEDULED') throw new AppError(409, 'CALENDAR_MEETING_CHANGED', 'Meeting outcome changed before provider dispatch');
        current.calendar.attemptedAt = new Date(); current.calendar.attempt += 1; await current.save({ session });
        await Job.updateOne({ dedupeKey: 'sales-calendar-recovery:' + meetingId + ':' + commandId }, { $setOnInsert: { type: 'sales.calendar.execute', payload: { meetingId, commandId }, availableAt: current.calendar.leaseUntil, maxAttempts: 5 } }, { session, upsert: true });
      });
      state.attemptedAt = new Date();
      await assertSwitchEnabled('SALES_CALENDAR');
      const finalActor = await SalesAgentRepository.principal(state.requestedBy);
      AuthorizationService.assertPlatformAdmin(finalActor);
      const finalLead = await SuccessRepository.load(finalActor, String(meeting.leadId), 'sales.meetings.update');
      if (['CREATE', 'RESCHEDULE'].includes(state.operation)) {
        windowPolicy(state.targetStart, state.targetEnd);
        if (!finalLead.email || opaqueHash(finalLead.email) !== state.attendeeHash) throw new AppError(409, 'CALENDAR_ATTENDEE_CHANGED', 'Primary contact changed immediately before dispatch');
        if (state.originApprovalId) await approvedMeetingOrigin(String(state.originApprovalId), String(meeting.leadId), state.targetStart, state.targetEnd);
      }
      if (state.operation === 'CANCEL') { await provider.cancel(event!.id, event!.etag!); return await this.finish(meetingId, commandId, owner, null, 'CANCELLED'); }
      const booking = { ...window, key: state.creationKey, title: 'Dapinni ' + meeting.type.toLowerCase(), attendee: state.attendee!, timezone: meeting.timezone };
      event = state.operation === 'CREATE' ? await provider.create(booking) : await provider.update(event!.id, event!.etag!, booking);
      if (state.operation === 'RESCHEDULE' && event.id !== state.eventId) throw new AppError(409, 'CALENDAR_PROVIDER_REFERENCE_CHANGED', 'Provider returned a different event reference during rescheduling');
      return await finishObserved(event, matches(event) ? 'CONFIRMED' : 'CONFLICT', matches(event) ? undefined : 'CALENDAR_PROVIDER_RESULT_MISMATCH');
    } catch (error) {
      const code = error instanceof AppError ? error.code : 'CALENDAR_PROVIDER_UNAVAILABLE';
      const uncertain = !!state.attemptedAt;
      await SalesMeeting.updateOne({ _id: meetingId, 'calendar.commandId': commandId, 'calendar.leaseOwner': owner }, { $set: { 'calendar.status': uncertain ? 'UNCERTAIN' : error instanceof AppError && error.statusCode < 500 ? 'FAILED' : 'PENDING', 'calendar.errorCode': code }, $unset: { 'calendar.leaseOwner': 1, 'calendar.leaseUntil': 1 } });
      await AuditService.record({ action: 'sales.calendar.operation.unconfirmed', resourceType: 'SalesMeeting', resourceId: meeting._id, metadata: { commandId, code, attempted: uncertain, automaticResend: false } });
      if (!uncertain && (!(error instanceof AppError) || error.statusCode >= 500)) throw new AppError(503, code, 'Calendar unavailable; durable retry retains the reservation');
      return { status: uncertain ? 'UNCERTAIN' : 'FAILED', code };
    }
  }
  static async expire(meetingId: string) {
    return salesTransaction(async session => {
      const meeting = await SalesMeeting.findOneAndUpdate({ _id: meetingId, 'calendar.contentExpiresAt': { $lte: new Date() }, 'calendar.contentRedactedAt': { $exists: false } }, { $set: { 'calendar.contentRedactedAt': new Date() }, $unset: { 'calendar.attendee': 1, 'calendar.evidence': 1 } }, { session, returnDocument: 'after' });
      if (meeting) await AuditService.record({ action: 'sales.calendar.content.redacted', resourceType: 'SalesMeeting', resourceId: meeting._id, metadata: { minimalProviderAndDecisionEvidenceRetained: true } }, session);
      return { redacted: !!meeting };
    });
  }
  private static async finish(meetingId: string, commandId: string, owner: string, event: CalendarEvent | null, status: 'CONFIRMED' | 'CANCELLED' | 'UNCERTAIN' | 'CONFLICT' | 'FAILED', code?: string) {
    return salesTransaction(async session => {
      const meeting = await SalesMeeting.findOne({ _id: meetingId, 'calendar.commandId': commandId, 'calendar.leaseOwner': owner }).session(session);
      if (!meeting?.calendar) return { skipped: true };
      await lockSalesRepresentative(String(meeting.representativeId), session);
      if (event && status === 'CONFIRMED' && await salesMeetingConflict(String(meeting.representativeId), event.startsAt, event.endsAt, session, meetingId)) { status = 'CONFLICT'; code = 'CALENDAR_EXTERNAL_LOCAL_CONFLICT'; }
      const before = { startsAt: meeting.startsAt, endsAt: meeting.endsAt, status: meeting.status };
      const state = meeting.calendar;
      state.status = status; state.syncedAt = new Date(); state.errorCode = code; state.leaseOwner = undefined; state.leaseUntil = undefined;
      if (event) { state.eventId = event.id; state.etag = event.etag; state.invitationRequested = event.invitationRequested; }
      if (status === 'CONFIRMED' && event) { state.confirmedAt = new Date(); if (meeting.status === 'SCHEDULED') { meeting.startsAt = event.startsAt; meeting.endsAt = event.endsAt; } }
      if (status === 'CANCELLED' && meeting.status === 'SCHEDULED') meeting.status = 'CANCELLED';
      meeting.revision += 1; await meeting.save({ session });
      await SalesActivity.create([{ leadId: meeting.leadId, actorKind: 'SYSTEM', kind: 'sales.calendar.' + status.toLowerCase(), text: 'External calendar operation: ' + status + '. Invitation submission is not recipient delivery or attendance evidence.', resourceId: meeting._id, sourceKey: 'calendar-result:' + commandId + ':' + status }], { session });
      await AuditService.record({ action: 'sales.calendar.reconciled', resourceType: 'SalesMeeting', resourceId: meeting._id, metadata: { commandId, provider: state.provider, eventId: event?.id, status, before, startsAt: meeting.startsAt, endsAt: meeting.endsAt, invitationRequested: state.invitationRequested, code } }, session);
      return { status, externalEventId: state.eventId, invitationRequested: state.invitationRequested ?? false, confirmationDelivered: false };
    });
  }
}
