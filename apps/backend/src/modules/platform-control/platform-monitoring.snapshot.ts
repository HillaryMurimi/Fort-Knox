import { Organization } from '../../database/models/Organization.js';
import { OrganizationContract } from '../../database/models/OrganizationContract.js';
import mongoose, { type PipelineStage } from 'mongoose';
import { env } from '../../config/env.js';
import { snapshotMetrics } from '../../core/observability/metrics.js';
import { monitoringEnvironment, telemetryHealth } from '../../core/observability/platform-telemetry.js';
import { PlatformHeartbeat, PlatformMonitorSignal } from '../../database/models/PlatformMonitoring.js';
import { PlatformSwitch } from '../../database/models/PlatformSwitch.js';
import { Job } from '../../database/models/Job.js';
import { Notification } from '../../database/models/Notification.js';
import { PropertyOnboardingRequest } from '../../database/models/PropertyOnboardingRequest.js';
import { OrganizationSubscription } from '../../database/models/OrganizationSubscription.js';
import { SubscriptionInvoice } from '../../database/models/SubscriptionInvoice.js';
import { Unit } from '../../database/models/Unit.js';
import { Tenancy } from '../../database/models/Tenancy.js';
import { Property } from '../../database/models/Property.js';
import { AuditLog } from '../../database/models/AuditLog.js';
import { LaunchReadinessService } from './launch-readiness.service.js';
import { platformSwitchCatalog } from './platform-control.service.js';
import { area, metric, type AreaKey, type MonitorCondition, type MonitorArea } from './platform-monitoring.types.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';

interface Counts { counts: Array<{ _id: string; count: number }>; scopes: Array<{ _id: { scope: mongoose.Types.ObjectId | null; status: string }; count: number; firstAt: Date; lastAt: Date }>; }
type AggregateSource = { aggregate<T>(pipeline: PipelineStage[]): { exec(): Promise<T[]> } };
async function counts(source: AggregateSource, match: Record<string, unknown> = {}): Promise<Counts> {
  const result = await source.aggregate<Counts>([{ $match: match }, { $facet: {
    counts: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
    scopes: [{ $group: { _id: { scope: '$organizationId', status: '$status' }, count: { $sum: 1 }, firstAt: { $min: '$createdAt' }, lastAt: { $max: '$updatedAt' } } }, { $sort: { count: -1, '_id.scope': 1, '_id.status': 1 } }, { $limit: 201 }],
  } }]).exec();
  return result[0] ?? { counts: [], scopes: [] };
}
const count = (data: Counts, ...statuses: string[]) => data.counts.filter(row => statuses.includes(row._id)).reduce((sum, row) => sum + row.count, 0);
function conditions(key: AreaKey, data: Counts, statuses: string[], title: string, now: Date, severity: 'LOW' | 'HIGH' | 'CRITICAL' = 'HIGH'): MonitorCondition[] {
  return data.scopes.slice(0, 200).filter(row => statuses.includes(row._id.status)).map(row => ({
    area: key, scope: row._id.scope?.toString() ?? 'PLATFORM', code: row._id.status, title, severity, value: row.count,
    firstAt: row.firstAt ?? now, lastAt: now,
  }));
}
async function safe(key: AreaKey, title: string, read: () => Promise<MonitorArea>) {
  if (mongoose.connection.readyState !== 1) return { ...area(key, title, [metric('unavailable', 'Record source', null, 'Database disconnected')], [], ['Database record source unavailable.']), sourceAvailable: false };
  try { return await read(); } catch { return { ...area(key, title, [metric('unavailable', 'Record source', null, 'Database query unavailable')], [], ['Data unavailable; no healthy status or zero count has been inferred.']), sourceAvailable: false }; }
}
export async function monitoringSnapshot(auth: AuthenticatedUser, now = new Date()) {
  const since = new Date(now.getTime() - 86400_000);
  const old = new Date(now.getTime() - env.MONITORING_ONBOARDING_AGE_SECONDS * 1000);
  const queueOld = new Date(now.getTime() - env.MONITORING_QUEUE_AGE_SECONDS * 1000);
  const environment = monitoringEnvironment();
  const http = snapshotMetrics();
  const duration = http.routes.reduce((sum, row) => sum + row.averageDurationMs * row.requests, 0);
  const areas = await Promise.all([
    safe('launch', 'Launch readiness', async () => {
      const data = await LaunchReadinessService.list(auth);
      return area('launch', 'Launch readiness', [metric('ready', 'Reviewed items ready', data.summary.ready, 'LaunchReadiness / provider configuration'), metric('blockers', 'Explicit blockers', data.summary.blockers, 'LaunchReadiness'), metric('unassigned', 'Owners unassigned', data.summary.unassigned, 'LaunchReadiness')],
        data.items.filter(item => item.blocker || !item.optional && !item.ready).map(item => ({ area: 'launch', scope: 'PLATFORM', code: item.key, title: `${item.name}: readiness requires action`, severity: item.severity === 'CRITICAL' ? 'CRITICAL' : item.severity === 'HIGH' ? 'HIGH' : 'LOW', value: 1, firstAt: item.updatedAt ?? now, lastAt: now, owner: item.responsibleOwner })),
        ['Readiness is manually reviewed; optional providers count toward item totals. No launch certification or service activation is inferred.']);
    }),
    safe('switches', 'Service switches', async () => {
      const rows = await PlatformSwitch.find({ key: { $in: platformSwitchCatalog.map(item => item[0]) } }).select('key mode reason modifiedAt modifiedBy enabled').lean();
      const issues: MonitorCondition[] = rows.filter(row => row.mode === 'ON').map(row => ({ area: 'switches', scope: 'PLATFORM', code: row.key, title: `${row.key}: enforcement coverage is incomplete`, severity: 'HIGH', value: 1, firstAt: row.modifiedAt ?? now, lastAt: now }));
      const denied = await PlatformMonitorSignal.aggregate<{ _id: string; count: number; firstAt: Date; lastAt: Date }>([{ $match: { environment, kind: 'SWITCH_DENIED', bucket: { $gte: new Date(now.getTime() - 5 * 60_000) } } }, { $group: { _id: '$subject', count: { $sum: '$count' }, firstAt: { $min: '$firstAt' }, lastAt: { $max: '$lastAt' } } }]);
      for (const row of denied) issues.push({ area: 'switches', scope: 'PLATFORM', code: 'DISABLED:' + row._id, title: row._id + ': operations attempted while disabled', severity: 'LOW', value: row.count, firstAt: row.firstAt, lastAt: row.lastAt });
      return area('switches', 'Service switches', [metric('on', 'ON', rows.filter(row => row.enabled && row.mode === 'ON').length, 'PlatformSwitch'), metric('maintenance', 'Maintenance', rows.filter(row => row.mode === 'MAINTENANCE').length, 'PlatformSwitch'), metric('off', 'OFF / default OFF', platformSwitchCatalog.length - rows.filter(row => row.mode !== 'OFF').length, 'PlatformSwitch / fail-closed catalog'), metric('coverage', 'Fully certified switch coverage', null, 'Enforcement manifest')],
        issues, ['OFF reflects switch state; it does not prove every internal operation is disabled. See the enforcement manifest and declared dependencies.']);
    }),
    (async () => {
      const base = [metric('api', 'This API process', 'Responding', 'Authenticated overview request', 'At this request'), metric('requests', 'Observed HTTP requests', http.totals.requests, 'In-process request telemetry', 'Since process start'), metric('latency', 'Average request latency (ms)', http.totals.requests ? Math.round(duration / http.totals.requests) : null, 'In-process request telemetry', 'Since process start'), metric('errors', 'HTTP 5xx rate (%)', http.totals.requests ? Math.round(10000 * http.totals.errors / http.totals.requests) / 100 : null, 'In-process request telemetry', 'Since process start'), metric('database', 'Database connection', mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected', 'Mongoose connection state', 'At this request'), metric('storage', 'Storage availability', null, 'No active storage probe'), metric('backup', 'Last successful backup / restore test', null, 'No backup/restore telemetry'), metric('telemetryFailures', 'Telemetry write failures (this process)', telemetryHealth().writeFailures, 'Recorder failure counter', 'Since process start')];
      let heartbeatAvailable = mongoose.connection.readyState === 1;
      let heartbeats: Awaited<ReturnType<typeof PlatformHeartbeat.find>> = [];
      if (mongoose.connection.readyState === 1) try { heartbeats = await PlatformHeartbeat.find({ environment, expiresAt: { $gt: now } }).sort({ lastAt: -1 }).limit(101); } catch { heartbeatAvailable = false; }
      const workers = heartbeats.filter(row => row.kind === 'WORKER');
      const latest = workers[0];
      const stale = latest && (!workers.some(row => !row.stoppedAt && now.getTime() - row.lastAt.getTime() <= env.MONITORING_HEARTBEAT_STALE_SECONDS * 1000));
      base.push(metric('worker', 'Worker heartbeat', latest ? stale ? 'Stale / stopped' : latest.lastAt.toISOString() : null, 'PlatformHeartbeat', '30-second heartbeat; configurable stale threshold'));
      const issues: MonitorCondition[] = [];
      if (mongoose.connection.readyState !== 1) issues.push({ area: 'system', scope: 'PLATFORM', code: 'DATABASE_DISCONNECTED', title: 'Database connection is down', severity: 'CRITICAL', value: 1, firstAt: now, lastAt: now });
      if (stale) issues.push({ area: 'system', scope: 'PLATFORM', code: 'WORKER_STALE', title: 'No fresh worker heartbeat', severity: 'CRITICAL', value: 1, firstAt: latest.lastAt, lastAt: now });
      if (telemetryHealth().writeFailures) issues.push({ area: 'system', scope: 'PLATFORM', code: 'TELEMETRY_WRITE_FAILURE', title: 'Telemetry writes failed in this API process', severity: 'HIGH', value: telemetryHealth().writeFailures, firstAt: telemetryHealth().lastFailureAt ?? now, lastAt: now });
      return { ...area('system', 'System health', base, issues, ['HTTP metrics cover this process, not external uptime or the whole API fleet. Backup/restore and storage availability are not inferred from configuration.', 'Worker health checks whether at least one worker is fresh; expected worker fleet size is not configured.'], heartbeats.length > 100), sourceAvailable: heartbeatAvailable };
    })(),
    safe('onboarding', 'Landlord onboarding', async () => {
      const [subscriptions, requests, staleRequests, pending, invoices, firstProperty, firstUnits, firstTenancy, agreements, progress, attention] = await Promise.all([
        counts(OrganizationSubscription), counts(PropertyOnboardingRequest), counts(PropertyOnboardingRequest, { status: 'REQUESTED', createdAt: { $lt: old } }),
        counts(OrganizationSubscription, { status: 'PENDING', createdAt: { $lt: old } }), counts(SubscriptionInvoice, { status: { $in: ['OPEN', 'PAST_DUE'] }, dueDate: { $lt: now } }),
        Property.aggregate<{ count: number }>([{ $group: { _id: '$organizationId' } }, { $count: 'count' }]),
        Unit.aggregate<{ count: number }>([{ $group: { _id: '$organizationId' } }, { $count: 'count' }]),
        Tenancy.aggregate<{ count: number }>([{ $match: { status: 'ACTIVE' } }, { $group: { _id: '$organizationId' } }, { $count: 'count' }]),
        counts(OrganizationContract),
        Organization.aggregate<{ _id:string; count:number }>([{ $match:{ onboarding: { $exists:true } } }, { $group:{ _id:'$onboarding.state', count:{ $sum:1 } } }]),
        Organization.aggregate<{ _id:{scope:mongoose.Types.ObjectId;code:string};count:number;firstAt:Date }>([{ $match:{ 'onboarding.attentionCode': { $type:'string' } } }, { $group:{ _id:{ scope:'$_id', code:'$onboarding.attentionCode' }, count:{ $sum:1 },firstAt:{ $min:'$updatedAt' } } }, { $limit:201 }]),
      ]);
      return area('onboarding', 'Landlord onboarding', [metric('pending', 'Pending subscriptions', count(subscriptions, 'PENDING'), 'OrganizationSubscription'), metric('active', 'Active / trial subscriptions', count(subscriptions, 'ACTIVE', 'TRIALING'), 'OrganizationSubscription'), metric('assistance', 'Assistance awaiting response', count(requests, 'REQUESTED'), 'PropertyOnboardingRequest'), metric('firstProperty', 'Organizations with a property', firstProperty[0]?.count ?? 0, 'Property grouped by organization'), metric('firstUnits', 'Organizations with units', firstUnits[0]?.count ?? 0, 'Unit grouped by organization'), metric('firstTenant', 'Organizations with active tenancies', firstTenancy[0]?.count ?? 0, 'Active Tenancy grouped by organization'), metric('timeToValue', 'Time to first useful action', null, 'No activation timeline telemetry'), metric('overdue', 'Overdue unpaid invoices', count(invoices, 'OPEN', 'PAST_DUE'), 'SubscriptionInvoice'), metric('agreement', 'Signed durable agreements', count(agreements,'SIGNED'), 'OrganizationContract'), ...progress.map(row=>metric(`step-${row._id}`,row._id.replaceAll('_',' ').toLowerCase(),row.count,'Organization.onboarding.state')), metric('abandonment', 'Abandoned onboarding steps', null, 'No step telemetry'), metric('crm', 'CRM synchronization failures', null, 'No synchronization adapter')],
        [...attention.slice(0,200).map(row=>({area:'onboarding' as const,scope:String(row._id.scope),code:row._id.code,title:'Landlord payment or renewal requires attention',severity:'HIGH' as const,value:row.count,firstAt:row.firstAt,lastAt:now})), ...conditions('onboarding', staleRequests, ['REQUESTED'], 'Property assistance awaiting response', now).map(item => ({ ...item, code: 'ASSISTANCE_OVERDUE' })), ...conditions('onboarding', pending, ['PENDING'], 'Pending subscription exceeds onboarding age threshold', now).map(item => ({ ...item, code: 'SUBSCRIPTION_PENDING' })), ...conditions('onboarding', invoices, ['OPEN', 'PAST_DUE'], 'Unpaid subscription invoice is overdue', now).map(item => ({ ...item, code: 'INVOICE_OVERDUE' }))],
        ['Signed agreements and saved activation states are durable backend records. Provider staging acceptance is a separate launch gate. Missing first-use telemetry remains unavailable.'], attention.length > 200 || [staleRequests, pending, invoices].some(data => data.scopes.length > 200));
    }),
    safe('queues', 'Queues and workers', async () => {
      const [all, oldJobs, running, durations] = await Promise.all([counts(Job), counts(Job, { status: 'QUEUED', availableAt: { $lt: queueOld } }), counts(Job, { status: 'RUNNING', leaseExpiresAt: { $lt: now } }),
        Job.aggregate<{ _id: string; averageMs: number | null; count: number }>([{ $match: { status: 'SUCCEEDED', completedAt: { $gte: since }, startedAt: { $type: 'date' } } }, { $group: { _id: '$type', count: { $sum: 1 }, averageMs: { $avg: { $subtract: ['$completedAt', '$startedAt'] } } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 101 }])]);
      const oldest = await Job.findOne({ status: 'QUEUED' }).sort({ availableAt: 1 }).select('availableAt').lean();
      const retries = await Job.countDocuments({ status: { $in: ['QUEUED', 'FAILED'] }, attempts: { $gt: 0 } });
      return area('queues', 'Queues and workers', [metric('queued', 'Queued jobs', count(all, 'QUEUED'), 'Job'), metric('running', 'Running jobs', count(all, 'RUNNING'), 'Job'), metric('dead', 'Dead-letter jobs', count(all, 'DEAD_LETTER'), 'Job'), metric('failed', 'Failed jobs', count(all, 'FAILED'), 'Job'), metric('retry', 'Jobs with retry attempts', retries, 'Job'), metric('oldest', 'Oldest queued availability', oldest?.availableAt.toISOString() ?? 'No queued jobs', 'Job'), metric('paused', 'Paused work', null, 'No paused job state'), ...durations.slice(0, 100).map(row => metric('duration:' + row._id, row._id + ' average processing (ms)', row.averageMs === null ? null : Math.round(row.averageMs), 'Successful Job startedAt/completedAt', 'Last 24 hours'))],
        [...conditions('queues', all, ['FAILED', 'DEAD_LETTER'], 'Failed or dead-letter work requires review', now), ...conditions('queues', oldJobs, ['QUEUED'], 'Queued work exceeds age threshold', now), ...conditions('queues', running, ['RUNNING'], 'Job lease expired while running', now)],
        ['Processing duration uses persisted successful-job timestamps, not provider response time. Scheduled future jobs do not trigger overdue backlog alerts.'], all.scopes.length > 200 || oldJobs.scopes.length > 200 || running.scopes.length > 200 || durations.length > 100);
    }),
    safe('notifications', 'Notifications and OTP', async () => {
      const data = await counts(Notification, { createdAt: { $gte: since } });
      const signals = await PlatformMonitorSignal.aggregate<{ _id: string; count: number }>([{ $match: { environment, bucket: { $gte: since } } }, { $group: { _id: '$kind', count: { $sum: '$count' } } }]);
      const hasTelemetry = await PlatformHeartbeat.exists({ environment, kind: 'API', expiresAt: { $gt: now } });
      const value = (kind: string) => hasTelemetry ? signals.find(row => row._id === kind)?.count ?? 0 : null;
      return area('notifications', 'Notifications and OTP', [metric('queued', 'Queued notifications', count(data, 'QUEUED'), 'Notification', 'Created in last 24 hours'), metric('failed', 'Failed notifications', count(data, 'FAILED'), 'Notification', 'Created in last 24 hours'), metric('sent', 'Sent (provider accepted)', count(data, 'SENT'), 'Notification', 'Created in last 24 hours'), metric('delivered', 'Delivered / read', count(data, 'DELIVERED', 'READ'), 'Notification', 'Created in last 24 hours'), metric('requests', 'Successful auth OTP request endpoints', value('OTP_REQUEST'), 'PlatformMonitorSignal', 'Last 24 hours'), metric('verified', 'Successful auth OTP verification endpoints', value('OTP_VERIFIED'), 'PlatformMonitorSignal', 'Last 24 hours'), metric('lockouts', 'Auth OTP lockouts', value('OTP_LOCKED'), 'PlatformMonitorSignal', 'Last 24 hours'), metric('latency', 'Provider response time', null, 'Not instrumented')],
        conditions('notifications', data, ['FAILED'], 'Notification delivery failed', now), ['SENT is not confirmed delivery. OTP counters cover auth HTTP endpoints only; expired OTP documents are not used as historical metrics. No OTP values, hashes, recipients or message bodies are returned.'], data.scopes.length > 200);
    }),
    safe('security', 'Security and access', async () => {
      const recent = new Date(now.getTime() - 5 * 60_000);
      const signals = await PlatformMonitorSignal.aggregate<{ _id: { scope: string; kind: string }; count: number; firstAt: Date; lastAt: Date }>([{ $match: { environment, bucket: { $gte: recent } } }, { $group: { _id: { scope: '$scope', kind: '$kind' }, count: { $sum: '$count' }, firstAt: { $min: '$firstAt' }, lastAt: { $max: '$lastAt' } } }, { $sort: { count: -1 } }, { $limit: 201 }]);
      const hasTelemetry = await PlatformHeartbeat.exists({ environment, kind: 'API', expiresAt: { $gt: now } });
      const total = (kind: string) => hasTelemetry && signals.length <= 200 ? signals.filter(row => row._id.kind === kind).reduce((sum, row) => sum + row.count, 0) : null;
      const privileged = await AuditLog.countDocuments({ actorRole: 'SUPER_ADMIN', occurredAt: { $gte: since } });
      const issues = signals.slice(0, 200).filter(row => row._id.kind === 'CROSS_ORGANIZATION_DENIAL' || row._id.kind === 'AUTH_FAILURE' && row.count >= env.MONITORING_AUTH_BURST_THRESHOLD || row._id.kind === 'AUTHORIZATION_DENIAL' && row.count >= env.MONITORING_DENIAL_THRESHOLD || row._id.kind === 'OTP_LOCKED').map(row => ({ area: 'security' as const, scope: row._id.scope, code: row._id.kind, title: row._id.kind.replaceAll('_', ' ').toLowerCase(), severity: row._id.kind === 'CROSS_ORGANIZATION_DENIAL' ? 'CRITICAL' as const : 'HIGH' as const, value: row.count, firstAt: row.firstAt, lastAt: row.lastAt }));
      return { ...area('security', 'Security and access', [metric('auth', 'HTTP authentication failures', total('AUTH_FAILURE'), 'PlatformMonitorSignal', 'Last 5 minutes'), metric('denials', 'Authorization denials', total('AUTHORIZATION_DENIAL'), 'PlatformMonitorSignal', 'Last 5 minutes'), metric('cross', 'Organization access denials', total('CROSS_ORGANIZATION_DENIAL'), 'PlatformMonitorSignal', 'Last 5 minutes'), metric('admin', 'Recorded Super Admin actions', privileged, 'AuditLog actorRole', 'Last 24 hours'), metric('changes', 'Privileged account changes', null, 'Complete change-event coverage not implemented')],
        issues, ['Security counters aggregate the authenticated active organization where available; unauthenticated attempts have platform/unknown scope. They do not identify attackers or prove a cross-tenant data leak.', 'Super Admin action counts cover recorded audit actions, not all administrator requests.'], signals.length > 200), sourceAvailable: Boolean(hasTelemetry) };
    }),
  ]);
  return { environment, generatedAt: now.toISOString(), areas };
}
