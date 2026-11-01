import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { User } from '../../src/database/models/User.js';
import { SalesLead } from '../../src/database/models/SalesLead.js';
import { SalesMeeting } from '../../src/database/models/SalesMeeting.js';
import { SalesActivity } from '../../src/database/models/SalesActivity.js';
import { PlatformSwitch } from '../../src/database/models/PlatformSwitch.js';
import { Job } from '../../src/database/models/Job.js';
import { SalesAgent, SalesAgentRun, SalesAgentApproval } from '../../src/database/models/SalesAgent.js';
import { payloadHash } from '../../src/modules/sales/sales-agent.service.js';
import { SalesCalendarService as calendar } from '../../src/modules/sales/sales-calendar.service.js';
import { SalesSuccessService as success } from '../../src/modules/sales/sales-success.service.js';
import { setSalesCalendarTestProvider, type CalendarEvent, type CalendarBooking } from '../../src/integrations/calendar/sales-calendar.provider.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

describe.skipIf(!process.env.RUN_E2E)('Authorized durable sales calendar', () => {
  let mongo: MongoMemoryReplSet, admin: AuthenticatedUser, leadId: string, meetingId: string, external: CalendarEvent | null;
  const startsAt = '2026-11-03T10:00:00+03:00', endsAt = '2026-11-03T10:30:00+03:00';
  const busy = vi.fn(async () => [] as { startsAt: Date; endsAt: Date }[]);
  const make = (input: CalendarBooking): CalendarEvent => ({ id: 'provider-event-one', etag: 'version-one', startsAt: input.startsAt, endsAt: input.endsAt, attendees: [input.attendee], invitationRequested: true, cancelled: false });
  const create = vi.fn(async (input: CalendarBooking) => { external = make(input); return external; });
  const get = vi.fn(async () => external), find = vi.fn(async () => external);
  const update = vi.fn(async (_id: string, _etag: string, input: CalendarBooking) => { external = { ...make(input), etag: 'version-two' }; return external; });
  const cancel = vi.fn(async () => { external = null; });
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : {} }); await mongoose.connect(mongo.getUri());
    for (const model of [User, SalesLead, SalesMeeting, SalesActivity, PlatformSwitch, Job, SalesAgent, SalesAgentRun, SalesAgentApproval]) await model.init();
  }, 180000);
  afterAll(async () => { vi.useRealTimers(); setSalesCalendarTestProvider(String(admin.userId)); await mongoose.disconnect(); await mongo?.stop(); });
  beforeEach(async () => {
    vi.useRealTimers(); vi.setSystemTime(new Date('2026-11-02T07:00:00Z'));
    for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
    if (admin) setSalesCalendarTestProvider(String(admin.userId));
    external = null; busy.mockReset(); busy.mockResolvedValue([]); get.mockClear(); find.mockClear(); cancel.mockClear(); update.mockClear(); create.mockReset(); create.mockImplementation(async input => { external = make(input); return external; });
    const user = await User.create({ phone: '+254700004099', email: 'calendar-admin@example.test', firstName: 'Calendar', lastName: 'Admin', isPlatformAdmin: true });
    admin = { userId: user._id, isPlatformAdmin: true, sessionId: new Types.ObjectId(), mfaVerifiedAt: new Date(), adminDualChannel: true, memberships: [] };
    leadId = String((await SalesLead.create({ reference: 'CALENDAR-OWNER', name: 'Calendar Owner', email: 'calendar-owner@example.test', properties: 1, units: '40', challenge: 'Requested a demonstration', source: 'Manual', consent: 'UNKNOWN' }))._id);
    await PlatformSwitch.create({ key: 'SALES_CALENDAR', kind: 'FEATURE', name: 'Calendar', description: 'Controlled calendar', enabled: true, mode: 'ON' });
    setSalesCalendarTestProvider(String(admin.userId), { key: 'GOOGLE', fingerprint: 'authorized-test-calendar', availability: busy, create, get, find, update, cancel });
    meetingId = (await success.meeting(admin, leadId, { representativeId: String(admin.userId), startsAt, endsAt, type: 'DEMO', description: 'Original meeting notes must survive synchronization.' })).id;
  });
  async function command(action = 'CREATE', extra: Record<string, unknown> = {}) {
    const meeting = (await SalesMeeting.findById(meetingId))!;
    const input = { revision: meeting.revision, commandId: randomUUID(), action, evidence: 'Customer explicitly selected this demonstration and requested an email invitation.', ...extra };
    await calendar.command(admin, leadId, meetingId, input); return input;
  }
  async function book() { const input = await command(); await calendar.execute(meetingId, input.commandId); return input; }
  it('does not invent availability or reserve during an availability query', async () => {
    busy.mockResolvedValue([{ startsAt: new Date(startsAt), endsAt: new Date(endsAt) }]);
    const result = await calendar.availability(admin, leadId, { representativeId: String(admin.userId), startsAt, endsAt });
    expect(result.busy).toHaveLength(2); expect(result.reservationCreated).toBe(false); expect(create).not.toHaveBeenCalled();
  });
  it('requires fresh human approval and assigned customer scope', async () => {
    const input = { revision: 0, commandId: randomUUID(), action: 'CREATE', evidence: 'Requested explicit calendar invitation for this selected slot.' };
    await expect(calendar.command({ ...admin, adminDualChannel: false }, leadId, meetingId, input)).rejects.toMatchObject({ statusCode: 403 });
    await expect(calendar.availability({ ...admin, isPlatformAdmin: false, memberships: [] }, leadId, { representativeId: String(admin.userId), startsAt, endsAt })).rejects.toMatchObject({ statusCode: 403 });
    expect(create).not.toHaveBeenCalled();
  });
  it('queues once under concurrent exact commands and confirms only the actual provider result', async () => {
    const input = await command(); await calendar.command(admin, leadId, meetingId, input);
    await Promise.all([calendar.execute(meetingId, input.commandId), calendar.execute(meetingId, input.commandId)]);
    expect(create).toHaveBeenCalledTimes(1); const meeting = (await SalesMeeting.findById(meetingId))!;
    expect(meeting.calendar?.status).toBe('CONFIRMED'); expect(meeting.calendar?.eventId).toBe('provider-event-one'); expect(meeting.description).toContain('Original meeting notes');
    expect(await Job.countDocuments({ type: 'sales.calendar.execute', dedupeKey: 'sales-calendar:' + meetingId + ':' + input.commandId })).toBe(1);
  });
  it('rejects reuse of a creation command on another meeting without partial jobs or state', async () => {
    const input = await command(); const second = await success.meeting(admin, leadId, { representativeId: String(admin.userId), startsAt: '2026-11-05T10:00:00+03:00', endsAt: '2026-11-05T10:30:00+03:00', type: 'CALL' });
    await expect(calendar.command(admin, leadId, second.id, input)).rejects.toMatchObject({ code: 'CALENDAR_COMMAND_REUSED' });
    expect((await SalesMeeting.findById(second.id))?.calendar).toBeUndefined(); expect(await Job.countDocuments({ type: 'sales.calendar.execute' })).toBe(1); expect(create).not.toHaveBeenCalled();
  });
  it('rechecks provider conflicts before creating an invitation', async () => {
    const input = await command(); busy.mockResolvedValue([{ startsAt: new Date(startsAt), endsAt: new Date(endsAt) }]); await calendar.execute(meetingId, input.commandId);
    expect(create).not.toHaveBeenCalled(); expect((await SalesMeeting.findById(meetingId))?.calendar?.errorCode).toBe('CALENDAR_SLOT_BUSY');
  });
  it('detects an external race after creation and preserves the event for reviewed resolution', async () => {
    const input = await command(); busy.mockResolvedValueOnce([]).mockResolvedValue([{ startsAt: new Date(startsAt), endsAt: new Date(endsAt) }]); await calendar.execute(meetingId, input.commandId);
    const meeting = (await SalesMeeting.findById(meetingId))!; expect(meeting.calendar?.status).toBe('CONFLICT'); expect(meeting.calendar?.eventId).toBe('provider-event-one'); expect(create).toHaveBeenCalledTimes(1); expect(cancel).not.toHaveBeenCalled();
  });
  it('retains provider acceptance evidence if post-create availability is unavailable', async () => {
    const input = await command(); busy.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Availability response unavailable')); await calendar.execute(meetingId, input.commandId);
    const meeting = (await SalesMeeting.findById(meetingId))!; expect(meeting.calendar?.status).toBe('UNCERTAIN'); expect(meeting.calendar?.eventId).toBe('provider-event-one');
    busy.mockResolvedValue([]); await calendar.execute(meetingId, input.commandId); expect((await SalesMeeting.findById(meetingId))?.calendar?.status).toBe('CONFIRMED'); expect(create).toHaveBeenCalledTimes(1);
  });
  it('keeps failed creation uncertain and reconciles without another invitation', async () => {
    const input = await command(); create.mockImplementationOnce(async value => { external = make(value); throw new Error('Provider response lost'); });
    await calendar.execute(meetingId, input.commandId); expect((await SalesMeeting.findById(meetingId))?.calendar?.status).toBe('UNCERTAIN');
    await calendar.execute(meetingId, input.commandId); expect(create).toHaveBeenCalledTimes(1); expect((await SalesMeeting.findById(meetingId))?.calendar?.status).toBe('CONFIRMED');
  });
  it('does not resend when no provider evidence resolves an uncertain attempt', async () => {
    const input = await command(); create.mockRejectedValueOnce(new Error('Unknown network outcome')); await calendar.execute(meetingId, input.commandId); await calendar.execute(meetingId, input.commandId);
    expect(create).toHaveBeenCalledTimes(1); expect((await SalesMeeting.findById(meetingId))?.calendar?.status).toBe('UNCERTAIN');
    await expect(command('CREATE')).rejects.toMatchObject({ code: 'CALENDAR_MEETING_CHANGED' });
  });
  it('reschedules the same external event with an optimistic provider version', async () => {
    await book(); const nextStart = '2026-11-04T12:00:00+03:00', nextEnd = '2026-11-04T12:30:00+03:00';
    const input = await command('RESCHEDULE', { startsAt: nextStart, endsAt: nextEnd }); await calendar.execute(meetingId, input.commandId);
    expect(update).toHaveBeenCalledTimes(1); expect(update.mock.calls[0]?.slice(0, 2)).toEqual(['provider-event-one', 'version-one']); expect((await SalesMeeting.findById(meetingId))?.startsAt.toISOString()).toBe(new Date(nextStart).toISOString());
  });
  it('blocks an externally edited event until synchronization and preserves notes', async () => {
    await book(); external = { ...external!, etag: 'externally-edited' };
    const input = await command('CANCEL'); await calendar.execute(meetingId, input.commandId); expect(cancel).not.toHaveBeenCalled(); expect((await SalesMeeting.findById(meetingId))?.calendar?.errorCode).toBe('CALENDAR_EVENT_CHANGED');
    const sync = await command('SYNC'); await calendar.execute(meetingId, sync.commandId); expect((await SalesMeeting.findById(meetingId))?.description).toContain('Original meeting notes');
  });
  it('cancels externally before recording local cancellation and preserves manual-only outcomes', async () => {
    await book(); const current = (await SalesMeeting.findById(meetingId))!;
    await expect(success.outcome(admin, leadId, meetingId, { revision: current.revision, status: 'CANCELLED', outcome: 'Requested cancellation' })).rejects.toMatchObject({ code: 'CALENDAR_RECONCILIATION_REQUIRED' });
    const input = await command('CANCEL'); await calendar.execute(meetingId, input.commandId); expect(cancel).toHaveBeenCalledTimes(1); expect((await SalesMeeting.findById(meetingId))?.status).toBe('CANCELLED');
    const cancelled = (await SalesMeeting.findById(meetingId))!; await success.outcome(admin, leadId, meetingId, { revision: cancelled.revision, status: 'CANCELLED', outcome: 'Customer cancelled because of travel; requested a later briefing.' });
    expect((await SalesMeeting.findById(meetingId))?.outcome).toContain('because of travel');
  });
  it('blocks primary-contact changes and revoked reviewers before provider mutation', async () => {
    const input = await command(); await SalesLead.updateOne({ _id: leadId }, { $set: { email: 'changed@example.test' } }); await calendar.execute(meetingId, input.commandId);
    expect(create).not.toHaveBeenCalled(); expect((await SalesMeeting.findById(meetingId))?.calendar?.errorCode).toBe('CALENDAR_ATTENDEE_CHANGED');
  });
  it('keeps local holds from racing manual meeting reservations', async () => {
    await book(); const input = await command('RESCHEDULE', { startsAt: '2026-11-04T12:00:00+03:00', endsAt: '2026-11-04T12:30:00+03:00' });
    await expect(success.meeting(admin, leadId, { representativeId: String(admin.userId), startsAt: '2026-11-04T12:00:00+03:00', endsAt: '2026-11-04T12:30:00+03:00', type: 'CALL' })).rejects.toMatchObject({ code: 'MEETING_CONFLICT' });
    expect(input.commandId).toBeTruthy();
  });
  it('requires authentication at both calendar HTTP boundaries', async () => {
    const app = createApp(); await request(app).get('/api/v1/sales/success/customers/' + leadId + '/calendar/availability').expect(401);
    await request(app).post('/api/v1/sales/success/customers/' + leadId + '/meetings/' + meetingId + '/calendar').send({}).expect(401);
  });
  it('rejects cross-customer assigned scope even with constituent permissions', async () => {
    const actor: AuthenticatedUser = { ...admin, isPlatformAdmin: false, userId: new Types.ObjectId(), memberships: [{ organizationId: new Types.ObjectId(), roleIds: [], roles: ['PROPERTY_MANAGER'], permissions: ['sales.meetings.read', 'sales.meetings.create'], scope: { allProperties: true, propertyIds: [], buildingIds: [], unitIds: [] } }] };
    await expect(calendar.availability(actor, leadId, { representativeId: String(actor.userId), startsAt, endsAt })).rejects.toMatchObject({ statusCode: 404 }); expect(busy).not.toHaveBeenCalled();
  });
  it('blocks revoked reviewers before dispatch', async () => {
    const input = await command(); await User.updateOne({ _id: admin.userId }, { $set: { status: 'DEACTIVATED' } }); await calendar.execute(meetingId, input.commandId); expect(create).not.toHaveBeenCalled();
  });
  it('polls external changes using existing Jobs without creating another invitation', async () => {
    await book(); const cycleKey = String(Math.floor(Date.now()/900000)); await calendar.scan({ cycleKey }); await calendar.scan({ cycleKey });
    expect(await Job.countDocuments({ type: 'sales.calendar.reconcile' })).toBe(1);
    external = { ...external!, startsAt: new Date('2026-11-04T09:00:00Z'), endsAt: new Date('2026-11-04T09:30:00Z'), etag: 'external-version' };
    await calendar.reconcile(meetingId); const current = (await SalesMeeting.findById(meetingId))!; await calendar.execute(meetingId, current.calendar!.commandId);
    expect((await SalesMeeting.findById(meetingId))?.startsAt.toISOString()).toBe(external.startsAt.toISOString()); expect(create).toHaveBeenCalledTimes(1);
  });
  it('requires review for a missing external event rather than inventing a cancellation', async () => {
    await book(); external = null; const sync = await command('SYNC'); await calendar.execute(meetingId, sync.commandId);
    let meeting = (await SalesMeeting.findById(meetingId))!; expect(meeting.calendar?.status).toBe('CONFLICT'); expect(meeting.calendar?.errorCode).toBe('CALENDAR_EVENT_MISSING'); expect(meeting.status).toBe('SCHEDULED');
    const cancelRequest = await command('CANCEL'); await calendar.execute(meetingId, cancelRequest.commandId); meeting = (await SalesMeeting.findById(meetingId))!; expect(meeting.status).toBe('CANCELLED'); expect(cancel).not.toHaveBeenCalled();
  });
  it('records an explicit external cancellation without overwriting original notes', async () => {
    await book(); external = { ...external!, cancelled: true }; const sync = await command('SYNC'); await calendar.execute(meetingId, sync.commandId);
    const meeting = (await SalesMeeting.findById(meetingId))!; expect(meeting.calendar?.status).toBe('CANCELLED'); expect(meeting.description).toContain('Original meeting notes');
  });
  it('reconciles a dead-lettered pre-attempt command without sending and allows fresh review', async () => {
    await command(); const sync = await command('SYNC'); await calendar.execute(meetingId, sync.commandId);
    expect((await SalesMeeting.findById(meetingId))?.calendar?.status).toBe('FAILED'); expect(create).not.toHaveBeenCalled();
    await book(); expect(create).toHaveBeenCalledTimes(1);
  });
  it('binds an approved coordinator proposal to the exact selected interval', async () => {
    for (const key of ['SALES_AI_RUNTIME', 'SALES_AGENT_MEETING_COORDINATOR']) await PlatformSwitch.create({ key, kind: 'FEATURE', name: key, description: 'Controlled origin', enabled: true, mode: 'ON' });
    await SalesAgent.create({ key: 'MEETING_COORDINATOR', enabled: true, paused: false });
    const run = await SalesAgentRun.create({ agent: 'MEETING_COORDINATOR', leadId, requestedBy: admin.userId, serviceIdentity: 'sales:MEETING_COORDINATOR', objective: 'Propose a requested briefing', commandId: randomUUID(), commandHash: 'controlled-origin-hash', instructionVersion: 1, status: 'COMPLETED' });
    const payload = { tool: 'MEETING_PROPOSAL', reason: 'Selected actual window', text: startsAt + ' / ' + endsAt, subject: null, sourceUrls: [] };
    const proposal = await SalesAgentApproval.create({ runId: run._id, generation: 1, leadId, requestedBy: admin.userId, tool: 'MEETING_PROPOSAL', payload, payloadHash: payloadHash(payload), status: 'APPROVED', requiredPermission: 'sales.meetings.create', expiresAt: new Date(Date.now()+86400000), decisionAt: new Date(), decisionBy: admin.userId });
    const input = await command('CREATE', { originApprovalId: String(proposal._id) }); await calendar.execute(meetingId, input.commandId); expect(create).toHaveBeenCalledTimes(1);
    await expect(command('RESCHEDULE', { startsAt: '2026-11-04T10:00:00+03:00', endsAt: '2026-11-04T10:30:00+03:00', originApprovalId: String(proposal._id) })).rejects.toMatchObject({ code: 'CALENDAR_PROPOSAL_SLOT_MISMATCH' });
  });
  it('masks expired calendar content immediately and durably redacts without losing provider evidence', async () => {
    await book(); await SalesMeeting.updateOne({ _id: meetingId }, { $set: { 'calendar.contentExpiresAt': new Date(Date.now()-1000) } });
    const view = await success.view(admin, leadId); expect(view.meetings[0]?.calendar?.evidence).toBeUndefined();
    await calendar.expire(meetingId); const meeting = (await SalesMeeting.findById(meetingId).select('+calendar.attendee'))!;
    expect(meeting.calendar?.attendee).toBeUndefined(); expect(meeting.calendar?.evidence).toBeUndefined(); expect(meeting.calendar?.eventId).toBe('provider-event-one');
    const sync = await command('SYNC'); await calendar.execute(meetingId, sync.commandId); expect((await SalesMeeting.findById(meetingId))?.calendar?.status).toBe('CONFIRMED'); expect(create).toHaveBeenCalledTimes(1);
    expect((await SalesMeeting.findById(meetingId).select('+calendar.attendee'))?.calendar?.attendee).toBeUndefined(); expect((await SalesMeeting.findById(meetingId))?.calendar?.evidence).toBeUndefined();
  });
});
