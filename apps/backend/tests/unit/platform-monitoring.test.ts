import mongoose, { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env.js';
import { PlatformMonitorAlert, PlatformMonitorHistory, PlatformHeartbeat, PlatformMonitorSignal, PlatformMaintenanceWindow } from '../../src/database/models/PlatformMonitoring.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { PlatformMonitoringService, deduplicate, fingerprint } from '../../src/modules/platform-control/platform-monitoring.service.js';
import { alertReviewSchema, maintenanceWindowSchema, monitoringQuery, alertStatus, suppressed } from '../../src/modules/platform-control/platform-monitoring.schemas.js';
import { area, metric, type MonitorCondition } from '../../src/modules/platform-control/platform-monitoring.types.js';
import { signalKinds, recordSignal, heartbeat } from '../../src/core/observability/platform-telemetry.js';
import * as snapshots from '../../src/modules/platform-control/platform-monitoring.snapshot.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';
const auth: AuthenticatedUser = { userId: new Types.ObjectId(), isPlatformAdmin: true, memberships: [] };
const condition: MonitorCondition = { area: 'queues', scope: 'PLATFORM', code: 'FAILED', title: 'Failed work', severity: 'HIGH', value: 2, firstAt: new Date('2026-10-01T12:00:00Z'), lastAt: new Date('2026-10-01T12:05:00Z') };
const review = { expectedRevision: 3, owner: 'Operations owner', action: 'ACKNOWLEDGE' as const, note: 'Investigating failed delivery' };
afterEach(() => vi.restoreAllMocks());
function indexes() {
  for (const [model, key] of [[PlatformMonitorAlert, { environment: 1, fingerprint: 1 }], [PlatformHeartbeat, { environment: 1, instance: 1 }], [PlatformMonitorSignal, { environment: 1, bucket: 1, kind: 1, scope: 1, subject: 1 }]] as const) vi.spyOn(model.collection, 'indexes').mockResolvedValue([{ key, unique: true }] as never);
}
function transaction(status = 'OPEN') {
  indexes();
  const session = { withTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()), endSession: vi.fn() };
  vi.spyOn(mongoose, 'startSession').mockResolvedValue(session as never);
  const item = { _id: new Types.ObjectId(), environment: env.LAUNCH_READINESS_ENV ?? env.NODE_ENV, status, revision: 3, owner: '', firstAt: condition.firstAt, lastAt: condition.lastAt, save: vi.fn() };
  const find = vi.spyOn(PlatformMonitorAlert, 'findOne').mockReturnValue({ session: async () => item } as never);
  const history = vi.spyOn(PlatformMonitorHistory, 'create').mockResolvedValue([] as never);
  const audit = vi.spyOn(AuditService, 'record').mockResolvedValue(undefined as never);
  return { session, item, find, history, audit };
}
describe('monitoring truth and alert semantics', () => {
  it('keeps observed zero distinct from unavailable data and refuses a healthy label for missing metrics', () => {
    expect(area('queues', 'Queues', [metric('count', 'Count', 0, 'Job')]).status).toBe('HEALTHY');
    expect(area('queues', 'Queues', [metric('count', 'Count', null, 'Unavailable')]).status).toBe('NOT_CONFIGURED');
    expect(area('queues', 'Queues', [metric('count', 'Count', null, 'Unavailable')], [{ ...condition, severity: 'CRITICAL' }]).status).toBe('BLOCKED');
  });
  it('deduplicates by area and scope without merging different organizations', () => {
    const values = deduplicate([condition, { ...condition, value: 3 }, { ...condition, scope: new Types.ObjectId().toString() }]);
    expect(values).toHaveLength(2); expect(values[0]?.value).toBe(5);
    expect(fingerprint(values[0]!)).not.toBe(fingerprint(values[1]!));
    expect(condition.value).toBe(2);
  });
  it('validates ownership, secret-free notes, bounded pagination and maintenance dates', () => {
    expect(alertReviewSchema.safeParse(review).success).toBe(true);
    expect(alertReviewSchema.safeParse({ ...review, owner: '' }).success).toBe(false);
    expect(alertReviewSchema.safeParse({ ...review, note: 'token=private' }).success).toBe(false);
    expect(alertReviewSchema.safeParse({ ...review, status: 'RESOLVED' }).success).toBe(false);
    expect(monitoringQuery.safeParse({ pageSize: 101 }).success).toBe(false);
    const window = { area: 'queues', scope: 'PLATFORM', startsAt: '2026-10-01T12:00:00Z', endsAt: '2026-10-01T13:00:00Z', reason: 'Planned maintenance', owner: 'Ops' };
    expect(maintenanceWindowSchema.safeParse(window).success).toBe(true);
    expect(maintenanceWindowSchema.safeParse({ ...window, endsAt: window.startsAt }).success).toBe(false);
    expect(maintenanceWindowSchema.safeParse({ ...window, endsAt: '2026-10-10T12:00:00Z' }).success).toBe(false);
  });
  it('suppresses only matching areas/scopes during an active window', () => {
    const window = { area: 'queues', scope: 'org-a', startsAt: new Date('2026-10-01T12:00:00Z'), endsAt: new Date('2026-10-01T13:00:00Z') }, now = new Date('2026-10-01T12:30:00Z');
    expect(suppressed('queues', 'org-a', [window], now)).toBe(true);
    expect(suppressed('queues', 'org-b', [window], now)).toBe(false);
    expect(suppressed('security', 'org-a', [window], now)).toBe(false);
    expect(suppressed('queues', 'org-b', [{ ...window, scope: 'PLATFORM' }], now)).toBe(true);
    expect(suppressed('queues', 'org-a', [window], window.endsAt)).toBe(false);
  });
  it('enforces acknowledgement and resolution transitions', () => {
    expect(alertStatus('OPEN', 'ACKNOWLEDGE')).toBe('ACKNOWLEDGED');
    expect(alertStatus('ACKNOWLEDGED', 'ACKNOWLEDGE')).toBeNull();
    expect(alertStatus('RESOLVED', 'RESOLVE')).toBeNull();
    expect(alertStatus('OPEN', 'REOPEN')).toBeNull();
    expect(alertStatus('RESOLVED', 'REOPEN')).toBe('OPEN');
  });
});
describe('safe telemetry', () => {
  it('classifies outcomes without requiring bodies, OTPs, tokens or recipient data', () => {
    expect(signalKinds('/api/v1/auth/otp/verify', 200)).toEqual(['OTP_VERIFIED']);
    expect(signalKinds('/api/v1/auth/otp/verify', 429, 'OTP_LOCKED')).toEqual(['OTP_LOCKED', 'OTP_FAILURE']);
    expect(signalKinds('/api/v1/organizations/id', 403, 'CROSS_ORGANIZATION_ACCESS_DENIED')).toEqual(['AUTHORIZATION_DENIAL', 'CROSS_ORGANIZATION_DENIAL']);
    expect(signalKinds('/api/v1/integrations/id', 503, 'SERVICE_DISABLED')).toEqual([]);
  });
  it('writes minute counters and expiry only, scoped to the configured deployment', async () => {
    vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(1);
    const write = vi.spyOn(PlatformMonitorSignal, 'updateOne').mockResolvedValue({} as never);
    const now = new Date('2026-10-01T12:00:30Z');
    await recordSignal('SWITCH_DENIED', 'PLATFORM', now, 'CCTV_GATEWAY');
    expect(write).toHaveBeenCalledWith({ environment: env.LAUNCH_READINESS_ENV ?? env.NODE_ENV, bucket: new Date('2026-10-01T12:00:00Z'), kind: 'SWITCH_DENIED', scope: 'PLATFORM', subject: 'CCTV_GATEWAY' }, expect.objectContaining({ $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(now.getTime() + 7 * 86400_000) } }), { upsert: true });
    expect(JSON.stringify(write.mock.calls)).not.toMatch(/phone|codeHash|password|body|authorization/);
  });
  it('skips disconnected writes and isolates recorder failures from business requests', async () => {
    vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(0);
    const write = vi.spyOn(PlatformMonitorSignal, 'updateOne');
    await recordSignal('AUTH_FAILURE'); expect(write).not.toHaveBeenCalled();
    vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(1);
    write.mockRejectedValue(new Error('database unavailable'));
    await expect(recordSignal('AUTH_FAILURE')).resolves.toBeUndefined();
  });
  it('records actual heartbeat and graceful stop without a fabricated healthy timestamp', async () => {
    const write = vi.spyOn(PlatformHeartbeat, 'updateOne').mockResolvedValue({} as never);
    await heartbeat('WORKER', true);
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ environment: env.LAUNCH_READINESS_ENV ?? env.NODE_ENV }), expect.objectContaining({ $set: expect.objectContaining({ kind: 'WORKER', stoppedAt: expect.any(Date) }) }), { upsert: true });
  });
});
describe('platform monitoring authorization and audit', () => {
  it('denies organization callers before querying or parsing payloads', async () => {
    const denied = { ...auth, isPlatformAdmin: false }, query = vi.spyOn(PlatformMonitorAlert, 'find'), start = vi.spyOn(mongoose, 'startSession');
    for (const call of [() => PlatformMonitoringService.overview(denied), () => PlatformMonitoringService.listAlerts(denied, {}), () => PlatformMonitoringService.history(denied, 'invalid', {}), () => PlatformMonitoringService.review(denied, 'invalid', {}), () => PlatformMonitoringService.windows(denied), () => PlatformMonitoringService.createWindow(denied, {}), () => PlatformMonitoringService.endWindow(denied, 'invalid')]) await expect(call()).rejects.toMatchObject({ code: 'PLATFORM_ADMIN_REQUIRED' });
    expect(query).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled();
  });
  it('writes acknowledgement, history and audit using the same session', async () => {
    const { session, item, history, audit, find } = transaction();
    await PlatformMonitoringService.review(auth, String(item._id), review);
    expect(find).toHaveBeenCalledWith({ _id: item._id, environment: env.LAUNCH_READINESS_ENV ?? env.NODE_ENV });
    expect(item.status).toBe('ACKNOWLEDGED');
    expect(item.save).toHaveBeenCalledWith({ session });
    expect(history).toHaveBeenCalledWith([expect.objectContaining({ actor: auth.userId, note: review.note, owner: review.owner, before: 'OPEN', after: 'ACKNOWLEDGED' })], { session });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'platform.monitoring.acknowledge' }), session);
    expect(JSON.stringify(audit.mock.calls)).not.toContain(review.note);
    expect(session.endSession).toHaveBeenCalledOnce();
  });
  it('refuses stale or invalid transitions without saving', async () => {
    const { item, history } = transaction('RESOLVED');
    await expect(PlatformMonitoringService.review(auth, String(item._id), review)).rejects.toMatchObject({ code: 'MONITOR_ALERT_TRANSITION' });
    await expect(PlatformMonitoringService.review(auth, String(item._id), { ...review, expectedRevision: 2 })).rejects.toMatchObject({ code: 'MONITOR_ALERT_CONFLICT' });
    expect(item.save).not.toHaveBeenCalled(); expect(history).not.toHaveBeenCalled();
  });
  it('propagates audit failure and closes the transaction', async () => {
    const { session, item, audit } = transaction();
    audit.mockRejectedValue(new Error('audit unavailable'));
    await expect(PlatformMonitoringService.review(auth, String(item._id), review)).rejects.toThrow('audit unavailable');
    expect(session.endSession).toHaveBeenCalledOnce();
  });
  it('updates an ongoing alert without creating another history event or losing acknowledgement', async () => {
    const { item, history, session } = transaction('ACKNOWLEDGED');
    await PlatformMonitoringService.observe(condition);
    expect(item.status).toBe('ACKNOWLEDGED'); expect(item.firstAt).toBe(condition.firstAt);
    expect(item.save).toHaveBeenCalledWith({ session }); expect(history).not.toHaveBeenCalled();
  });
  it('reopens a measured recurrence and preserves prior resolution history', async () => {
    const { item, history } = transaction('RESOLVED');
    await PlatformMonitoringService.observe(condition);
    expect(item.status).toBe('OPEN');
    expect(history).toHaveBeenCalledWith([expect.objectContaining({ action: 'REOPENED' })], expect.anything());
  });
  it('does not auto-resolve unavailable or truncated sources and does not create suppressed alerts', async () => {
    indexes();
    vi.spyOn(PlatformHeartbeat, 'findOneAndUpdate').mockResolvedValue({} as never);
    vi.spyOn(PlatformHeartbeat, 'updateOne').mockResolvedValue({ matchedCount: 1 } as never);
    vi.spyOn(snapshots, 'monitoringSnapshot').mockResolvedValue({ environment: 'test', generatedAt: '', areas: [
      { ...area('queues', 'Queues', [metric('count', 'Count', null, 'Unavailable')]), sourceAvailable: false },
      { ...area('security', 'Security', [], [condition]), key: 'security', truncated: true },
      area('launch', 'Launch', [], [{ ...condition, area: 'launch' }]),
    ] } as never);
    vi.spyOn(PlatformMaintenanceWindow, 'find').mockReturnValue({ limit: () => ({ lean: async () => [{ area: 'launch', scope: 'PLATFORM', startsAt: new Date(0), endsAt: new Date('2099-01-01') }] }) } as never);
    const find = vi.spyOn(PlatformMonitorAlert, 'find').mockReturnValue({ limit: async () => [] } as never);
    const observe = vi.spyOn(PlatformMonitoringService, 'observe').mockResolvedValue();
    await PlatformMonitoringService.collect();
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ area: { $in: ['launch'] } }));
    expect(observe).toHaveBeenCalledTimes(1);
  });
});
