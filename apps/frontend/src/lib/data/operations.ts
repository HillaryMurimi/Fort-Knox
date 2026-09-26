import { api } from '../api';
import type { NotificationRecord, NotificationPreference, JobRecord, Paginated } from './resource-types';
import { toQueryString, type QueryValue } from './query-params';

function qs(values: Record<string, QueryValue>): string {
  const value = toQueryString(values);
  return value ? `?${value}` : '';
}

export interface NotificationQuery { status?: NotificationRecord['status']; limit?: number; }
export interface JobQuery { status?: JobRecord['status']; type?: string; page?: number; pageSize?: number; }

export const operationsClient = {
  notifications: (organizationId: string, params: NotificationQuery = {}) =>
    api<NotificationRecord[]>(`/organizations/${organizationId}/notifications${qs(params as Record<string, QueryValue>)}`),
  preferences: (organizationId: string) =>
    api<NotificationPreference[]>(`/organizations/${organizationId}/notification-preferences`),
  setPreference: (organizationId: string, input: { eventType: string; channels: NotificationPreference['channels']; enabled: boolean }) =>
    api<NotificationPreference>(`/organizations/${organizationId}/notification-preferences`, { method: 'PUT', body: JSON.stringify(input) }),
  markNotificationRead: (notificationId: string) =>
    api<NotificationRecord>(`/notifications/${notificationId}/read`, { method: 'POST' }),
  jobs: (organizationId: string, params: JobQuery = {}) =>
    api<Paginated<JobRecord>>(`/organizations/${organizationId}/jobs${qs(params as Record<string, QueryValue>)}`),
  enqueueJob: (input: { organizationId: string; type: string; payload?: Record<string, unknown>; priority?: number; availableAt?: string; maxAttempts?: number; dedupeKey?: string }) =>
    api<JobRecord>('/jobs', { method: 'POST', body: JSON.stringify(input) }),
};
