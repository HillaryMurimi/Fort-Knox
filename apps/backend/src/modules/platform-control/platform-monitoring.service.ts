import mongoose, { Types } from 'mongoose';
import { randomUUID } from 'node:crypto';

import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { AppError } from '../../core/errors/AppError.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import { monitoringEnvironment } from '../../core/observability/platform-telemetry.js';
import { PlatformMonitorAlert, PlatformMonitorHistory, PlatformMaintenanceWindow, PlatformHeartbeat, PlatformMonitorSignal } from '../../database/models/PlatformMonitoring.js';
import { Organization } from '../../database/models/Organization.js';
import { PlatformSwitch } from '../../database/models/PlatformSwitch.js';
import { AuditService } from '../audit/audit.service.js';
import { monitoringSnapshot } from './platform-monitoring.snapshot.js';
import { platformSwitchCatalog } from './platform-control.service.js';
import { switchCoverage, type MonitorCondition } from './platform-monitoring.types.js';
import { alertReviewSchema, maintenanceWindowSchema, monitoringQuery, alertStatus, suppressed } from './platform-monitoring.schemas.js';

export const fingerprint = (item: Pick<MonitorCondition, 'area' | 'scope' | 'code'>) => `${item.area}:${item.scope}:${item.code}`;
export function deduplicate(conditions: MonitorCondition[]) {
  const result = new Map<string, MonitorCondition>();
  for (const item of conditions) {
    const key = fingerprint(item), current = result.get(key);
    if (!current) result.set(key, { ...item });
    else { current.value += item.value; if (item.firstAt < current.firstAt) current.firstAt = item.firstAt; if (item.lastAt > current.lastAt) current.lastAt = item.lastAt; }
  }
  return [...result.values()];
}
async function requireAlertIndex() {
  for (const [model, keys] of [[PlatformMonitorAlert, ['environment', 'fingerprint']], [PlatformHeartbeat, ['environment', 'instance']], [PlatformMonitorSignal, ['environment', 'bucket', 'kind', 'scope', 'subject']]] as const) {
    let indexes;
    try { indexes = await model.collection.indexes(); }
    catch { throw new AppError(503, 'MONITORING_INDEX_REQUIRED', 'Initialize monitoring database indexes before alert writes'); }
    if (!indexes.some(index => index.unique && keys.every(key => index.key[key] === 1) && Object.keys(index.key).length === keys.length && !index.sparse && !index.partialFilterExpression)) throw new AppError(503, 'MONITORING_INDEX_REQUIRED', 'Initialize monitoring database indexes before alert writes');
  }
}
export class PlatformMonitoringService {
  static async overview(auth: AuthenticatedUser) {
    AuthorizationService.assertPlatformAdmin(auth);
    const data = await monitoringSnapshot(auth);
    let switches = null, collector = null;
    if (mongoose.connection.readyState !== 1) return { ...data, switches, collector };
    try {
      const [rows, attempts, recorded, beat] = await Promise.all([
        PlatformSwitch.find({ key: { $in: platformSwitchCatalog.map(item => item[0]) } }).select('key mode reason modifiedBy modifiedAt enabled').lean(),
        PlatformMonitorSignal.aggregate<{ _id: string; count: number }>([{ $match: { environment: data.environment, kind: 'SWITCH_DENIED', bucket: { $gte: new Date(Date.now() - 86400_000) } } }, { $group: { _id: '$subject', count: { $sum: '$count' } } }]),
        PlatformHeartbeat.exists({ environment: data.environment, kind: { $in: ['API', 'WORKER'] }, expiresAt: { $gt: new Date() } }),
        PlatformHeartbeat.findOne({ environment: data.environment, instance: 'ALERT_COLLECTOR' }).select('lastSuccessAt lastErrorAt leaseExpiresAt').lean(),
      ]);
      switches = platformSwitchCatalog.map(([key, , name]) => {
        const row = rows.find(item => item.key === key);
        return { key, name, mode: row?.mode ?? 'OFF', reason: row?.reason ?? 'Default OFF; no switch record', modifiedBy: row?.modifiedBy ?? null, modifiedAt: row?.modifiedAt ?? null, ...switchCoverage[key], disabledAttempts: recorded ? attempts.find(item => item._id === key)?.count ?? 0 : null,
          dependencies: (switchCoverage[key]?.dependencies ?? []).map(dependency => ({ key: dependency, mode: rows.find(item => item.key === dependency)?.mode ?? 'OFF' })) };
      });
      collector = { lastSuccessAt: beat?.lastSuccessAt ?? null, lastErrorAt: beat?.lastErrorAt ?? null, status: beat?.lastSuccessAt ? Date.now() - beat.lastSuccessAt.getTime() > 180000 || beat.lastErrorAt && beat.lastErrorAt > beat.lastSuccessAt ? 'STALE' : 'RUNNING' : 'NOT_CONFIGURED' };
    } catch { /* Sources remain explicitly unavailable. */ }
    return { ...data, switches, collector };
  }

  static async listAlerts(auth: AuthenticatedUser, raw: unknown) {
    AuthorizationService.assertPlatformAdmin(auth);
    const query = monitoringQuery.parse(raw), environment = monitoringEnvironment();
    const filter = { environment, ...(query.area ? { area: query.area } : {}), ...(query.status ? { status: query.status } : {}), ...(query.scope ? { scope: query.scope } : {}) };
    const [items, total, windows] = await Promise.all([
      PlatformMonitorAlert.find(filter).select('-lastSeenRun -__v').sort({ lastAt: -1, _id: -1 }).skip((query.page - 1) * query.pageSize).limit(query.pageSize).lean(),
      PlatformMonitorAlert.countDocuments(filter),
      PlatformMaintenanceWindow.find({ environment, endsAt: { $gt: new Date() } }).sort({ startsAt: 1 }).limit(100).lean(),
    ]);
    return { items: items.map(item => ({ ...item, suppressed: suppressed(item.area, item.scope, windows) })), total, page: query.page, pageSize: query.pageSize };
  }

  static async history(auth: AuthenticatedUser, id: string, raw: unknown) {
    AuthorizationService.assertPlatformAdmin(auth);
    const objectId = AuditService.assertObjectId(id, 'alertId'), environment = monitoringEnvironment();
    if (!await PlatformMonitorAlert.exists({ _id: objectId, environment })) throw new AppError(404, 'MONITOR_ALERT_NOT_FOUND', 'Alert not found in this environment');
    const query = monitoringQuery.parse(raw), filter = { environment, alertId: objectId };
    const [items, total] = await Promise.all([PlatformMonitorHistory.find(filter).select('-__v').sort({ at: -1, _id: -1 }).skip((query.page - 1) * query.pageSize).limit(query.pageSize).lean(), PlatformMonitorHistory.countDocuments(filter)]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  static async review(auth: AuthenticatedUser, id: string, raw: unknown) {
    AuthorizationService.assertPlatformAdmin(auth);
    const input = alertReviewSchema.parse(raw), objectId = AuditService.assertObjectId(id, 'alertId'), environment = monitoringEnvironment();
    await requireAlertIndex();
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        const item = await PlatformMonitorAlert.findOne({ _id: objectId, environment }).session(session);
        if (!item) throw new AppError(404, 'MONITOR_ALERT_NOT_FOUND', 'Alert not found in this environment');
        if (item.revision !== input.expectedRevision) throw new AppError(409, 'MONITOR_ALERT_CONFLICT', 'Alert changed; refresh before reviewing again');
        const next = alertStatus(item.status, input.action);
        if (!next) throw new AppError(409, 'MONITOR_ALERT_TRANSITION', 'Invalid alert status transition');
        const before = item.status, now = new Date();
        item.owner = input.owner; item.status = next; item.revision++;
        if (next === 'ACKNOWLEDGED' && input.action === 'ACKNOWLEDGE') { item.acknowledgedAt = now; item.acknowledgedBy = auth.userId; }
        if (next === 'RESOLVED' && input.action === 'RESOLVE') { item.resolvedAt = now; item.resolvedBy = auth.userId; }
        if (input.action === 'REOPEN') { item.acknowledgedAt = undefined; item.acknowledgedBy = undefined; item.resolvedAt = undefined; item.resolvedBy = undefined; }
        await item.save({ session });
        await PlatformMonitorHistory.create([{ alertId: item._id, environment, action: input.action, actor: auth.userId, at: now, note: input.note, before, after: next, owner: input.owner }], { session });
        await AuditService.record({ actorUserId: auth.userId, actorRole: 'SUPER_ADMIN', action: 'platform.monitoring.' + input.action.toLowerCase(), resourceType: 'PlatformMonitorAlert', resourceId: item._id, before: { status: before }, after: { status: next, revision: item.revision }, metadata: { environment, ownerAssigned: !!input.owner } }, session);
        return { id: String(item._id), status: item.status, revision: item.revision };
      });
    } finally { await session.endSession(); }
  }

  static async windows(auth: AuthenticatedUser) {
    AuthorizationService.assertPlatformAdmin(auth);
    return PlatformMaintenanceWindow.find({ environment: monitoringEnvironment(), endsAt: { $gt: new Date() } }).select('-__v').sort({ startsAt: 1 }).limit(100).lean();
  }
  static async createWindow(auth: AuthenticatedUser, raw: unknown) {
    AuthorizationService.assertPlatformAdmin(auth);
    const input = maintenanceWindowSchema.parse(raw), now = new Date();
    if (Date.parse(input.endsAt) <= now.getTime()) throw new AppError(400, 'WINDOW_EXPIRED', 'Window must end in the future');
    const environment = monitoringEnvironment();
    if (input.scope !== 'PLATFORM' && !await Organization.exists({ _id: input.scope })) throw new AppError(404, 'ORGANIZATION_NOT_FOUND', 'Maintenance scope organization not found');
    await requireAlertIndex();
    const session = await mongoose.startSession();
    try { return await session.withTransaction(async () => {
      // A shared document serializes competing maintenance-window capacity checks.
      await PlatformHeartbeat.findOneAndUpdate({ environment, instance: 'WINDOW_LOCK' }, { $set: { kind: 'COLLECTOR', lastAt: now, expiresAt: new Date(now.getTime() + 3 * 86400_000) }, $setOnInsert: { firstAt: now } }, { session, upsert: true });
      const capacity = await PlatformMaintenanceWindow.countDocuments({ environment, endsAt: { $gt: now } }).session(session);
      if (capacity >= 100) throw new AppError(409, 'WINDOW_LIMIT', 'At most 100 pending or active windows are supported');
      const [item] = await PlatformMaintenanceWindow.create([{ ...input, environment, createdBy: auth.userId }], { session });
      await AuditService.record({ actorUserId: auth.userId, actorRole: 'SUPER_ADMIN', action: 'platform.monitoring.maintenance.created', resourceType: 'PlatformMaintenanceWindow', resourceId: item!._id, metadata: { environment, area: input.area, scope: input.scope, startsAt: input.startsAt, endsAt: input.endsAt } }, session);
      return item;
    }); } finally { await session.endSession(); }
  }
  static async endWindow(auth: AuthenticatedUser, id: string) {
    AuthorizationService.assertPlatformAdmin(auth);
    const objectId = AuditService.assertObjectId(id, 'windowId'), session = await mongoose.startSession();
    try { return await session.withTransaction(async () => {
      const item = await PlatformMaintenanceWindow.findOne({ _id: objectId, environment: monitoringEnvironment() }).session(session);
      if (!item) throw new AppError(404, 'WINDOW_NOT_FOUND', 'Maintenance window not found');
      item.endsAt = new Date(); await item.save({ session });
      await AuditService.record({ actorUserId: auth.userId, actorRole: 'SUPER_ADMIN', action: 'platform.monitoring.maintenance.ended', resourceType: 'PlatformMaintenanceWindow', resourceId: item._id, metadata: { environment: item.environment, area: item.area, scope: item.scope } }, session);
      return { id };
    }); } finally { await session.endSession(); }
  }

  static async collect() {
    await requireAlertIndex();
    const environment = monitoringEnvironment(), now = new Date(), token = randomUUID();
    let lease;
    try {
      lease = await PlatformHeartbeat.findOneAndUpdate({ environment, instance: 'ALERT_COLLECTOR', $or: [{ leaseExpiresAt: { $lt: now } }, { leaseExpiresAt: { $exists: false } }] },
        { $set: { kind: 'COLLECTOR', leaseToken: token, leaseExpiresAt: new Date(now.getTime() + 600000), expiresAt: new Date(now.getTime() + 3 * 86400_000) }, $setOnInsert: { firstAt: now, lastAt: now } }, { new: true, upsert: true });
    } catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 11000) return; throw error; }
    if (!lease) return;
    try {
      const snapshot = await monitoringSnapshot({ userId: new Types.ObjectId(), isPlatformAdmin: true, memberships: [] }, now);
      const windows = await PlatformMaintenanceWindow.find({ environment, startsAt: { $lte: now }, endsAt: { $gt: now } }).limit(100).lean();
      const detected = deduplicate(snapshot.areas.flatMap(item => item.conditions));
      for (const condition of detected) {
        if (suppressed(condition.area, condition.scope, windows, now)) continue;
        await this.renewLease(environment, token);
        await this.observe(condition);
      }
      const successfulAreas = snapshot.areas.filter(item => item.sourceAvailable && !item.truncated).map(item => item.key);
      const previous = await PlatformMonitorAlert.find({ environment, area: { $in: successfulAreas }, status: { $ne: 'RESOLVED' }, fingerprint: { $nin: detected.map(fingerprint) } }).limit(200);
      for (const item of previous) {
        await this.renewLease(environment, token);
        if (!suppressed(item.area, item.scope, windows, now)) await this.clear(String(item._id), item.revision);
      }
      await PlatformHeartbeat.updateOne({ environment, instance: 'ALERT_COLLECTOR', leaseToken: token }, { $set: { lastSuccessAt: new Date(), lastAt: new Date() } });
    } catch (error) {
      await PlatformHeartbeat.updateOne({ environment, instance: 'ALERT_COLLECTOR', leaseToken: token }, { $set: { lastErrorAt: new Date() } });
      throw error;
    } finally {
      await PlatformHeartbeat.updateOne({ environment, instance: 'ALERT_COLLECTOR', leaseToken: token }, { $unset: { leaseExpiresAt: 1, leaseToken: 1 } });
    }
  }

  private static async renewLease(environment: string, token: string) {
    const now = new Date();
    const result = await PlatformHeartbeat.updateOne({ environment, instance: 'ALERT_COLLECTOR', leaseToken: token, leaseExpiresAt: { $gt: now } }, { $set: { leaseExpiresAt: new Date(now.getTime() + 600000) } });
    if (!result.matchedCount) throw new AppError(409, 'COLLECTOR_LEASE_LOST', 'Monitoring collector lease expired or changed');
  }

  static async observe(condition: MonitorCondition) {
    const environment = monitoringEnvironment(), observedAt = new Date(), session = await mongoose.startSession();
    try { await session.withTransaction(async () => {
      let item = await PlatformMonitorAlert.findOne({ environment, fingerprint: fingerprint(condition) }).session(session);
      const action = !item ? 'DETECTED' : item.status === 'RESOLVED' ? 'REOPENED' : null;
      if (!item) item = new PlatformMonitorAlert({ environment, fingerprint: fingerprint(condition), area: condition.area, scope: condition.scope, code: condition.code, title: condition.title, severity: condition.severity, firstAt: observedAt, lastAt: observedAt, owner: condition.owner ?? '' });
      item.lastAt = observedAt > item.lastAt ? observedAt : item.lastAt; item.observedValue = condition.value; item.severity = condition.severity;
      if (action === 'REOPENED') { item.status = 'OPEN'; item.acknowledgedAt = undefined; item.acknowledgedBy = undefined; item.resolvedAt = undefined; item.resolvedBy = undefined; }
      item.revision++; await item.save({ session });
      if (action) {
        await PlatformMonitorHistory.create([{ alertId: item._id, environment, action, at: new Date(), note: 'Measured condition detected', after: item.status, owner: item.owner }], { session });
        await AuditService.record({ actorRole: 'SYSTEM', action: 'platform.monitoring.' + action.toLowerCase(), resourceType: 'PlatformMonitorAlert', resourceId: item._id, metadata: { environment, area: item.area, scope: item.scope, code: item.code } }, session);
      }
    }); } finally { await session.endSession(); }
  }
  static async clear(id: string, revision: number) {
    const session = await mongoose.startSession();
    try { await session.withTransaction(async () => {
      const item = await PlatformMonitorAlert.findOne({ _id: id, environment: monitoringEnvironment(), revision, status: { $ne: 'RESOLVED' } }).session(session);
      if (!item) return;
      const before = item.status; item.status = 'RESOLVED'; item.resolvedAt = new Date(); item.revision++;
      await item.save({ session });
      await PlatformMonitorHistory.create([{ alertId: item._id, environment: item.environment, action: 'AUTO_RESOLVED', at: item.resolvedAt, note: 'Measured condition cleared from a complete, available source', before, after: item.status, owner: item.owner }], { session });
      await AuditService.record({ actorRole: 'SYSTEM', action: 'platform.monitoring.auto_resolved', resourceType: 'PlatformMonitorAlert', resourceId: item._id, before: { status: before }, after: { status: item.status }, metadata: { environment: item.environment, area: item.area, scope: item.scope } }, session);
    }); } finally { await session.endSession(); }
  }
}
