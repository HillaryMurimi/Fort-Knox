import { api } from '@/lib/api';
export type MonitorAreaKey = 'launch' | 'switches' | 'system' | 'onboarding' | 'queues' | 'notifications' | 'security';
export interface MonitorMetric { key: string; label: string; value: string | number | null; source: string; window: string; }
export interface MonitorArea { key: MonitorAreaKey; title: string; status: 'HEALTHY' | 'NEEDS_ACTION' | 'BLOCKED' | 'NOT_CONFIGURED'; metrics: MonitorMetric[]; notes: string[]; truncated: boolean; sourceAvailable: boolean; conditions: Array<{ scope: string; title: string; value: number }>; }
export interface MonitoredSwitch { key: string; name: string; mode: string; reason: string; modifiedAt: string | null; modifiedBy: string | null; coverage: string; boundaries: string; limitation: string; disabledAttempts: number | null; dependencies: Array<{ key: string; mode: string }>; }
export interface MonitoringOverview { environment: string; generatedAt: string; areas: MonitorArea[]; switches: MonitoredSwitch[] | null; collector: { status: string; lastSuccessAt: string | null; lastErrorAt: string | null } | null; }
export interface MonitoringAlert { _id: string; area: MonitorAreaKey; scope: string; code: string; title: string; severity: 'LOW' | 'HIGH' | 'CRITICAL'; status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'; owner: string; revision: number; firstAt: string; lastAt: string; observedValue?: number; acknowledgedAt?: string; acknowledgedBy?: string; resolvedAt?: string; resolvedBy?: string; suppressed: boolean; }
export interface MonitoringHistory { _id: string; action: string; at: string; actor?: string; note: string; before?: string; after?: string; owner?: string; }
export interface MaintenanceWindow { _id: string; area: MonitorAreaKey; scope: string; startsAt: string; endsAt: string; reason: string; owner: string; createdBy: string; }
export interface AlertReview { expectedRevision: number; owner: string; action: 'ASSIGN' | 'ACKNOWLEDGE' | 'RESOLVE' | 'REOPEN'; note: string; }
export interface WindowInput { area: MonitorAreaKey; scope: string; startsAt: string; endsAt: string; owner: string; reason: string; }
export interface MonitoringPage<T> { items: T[]; total: number; page: number; pageSize: number; }
export interface AlertFilter { page: number; area?: string; status?: string; scope?: string; }
const root = '/platform-control/monitoring';
export const monitoringClient = {
  overview: () => api<MonitoringOverview>(root),
  alerts: (filter: AlertFilter) => {
    const params = new URLSearchParams({ page: String(filter.page), pageSize: '25' });
    for (const key of ['area', 'status', 'scope'] as const) if (filter[key]) params.set(key, filter[key]);
    return api<MonitoringPage<MonitoringAlert>>(root + '/alerts?' + params);
  },
  history: (id: string, page: number) => api<MonitoringPage<MonitoringHistory>>(`${root}/alerts/${encodeURIComponent(id)}/history?page=${page}&pageSize=25`),
  review: (id: string, input: AlertReview) => api(`${root}/alerts/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  windows: () => api<MaintenanceWindow[]>(root + '/maintenance-windows'),
  createWindow: (input: WindowInput) => api(root + '/maintenance-windows', { method: 'POST', body: JSON.stringify(input) }),
  endWindow: (id: string) => api(`${root}/maintenance-windows/${encodeURIComponent(id)}/end`, { method: 'POST' }),
};
export const monitorValue = (value: MonitorMetric['value']) => value === null ? 'Not configured' : String(value);
