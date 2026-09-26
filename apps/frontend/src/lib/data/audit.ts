import { api } from '../api';
import type { AuditLogRecord, DomainEventRecord } from './resource-types';
import { toQueryString, type QueryValue } from './query-params';

export interface AuditQuery {
  resourceType?: string;
  resourceId?: string;
  actorUserId?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface DomainEventQuery {
  name?: string;
  aggregateType?: string;
  aggregateId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

function qs(values: Record<string, QueryValue>): string {
  const value = toQueryString(values);
  return value ? `?${value}` : '';
}

export const auditClient = {
  logs: (organizationId: string, params: AuditQuery = {}) =>
    api<AuditLogRecord[]>(`/audit-logs${qs({ organizationId, ...params })}`),
  events: (organizationId: string, params: DomainEventQuery = {}) =>
    api<DomainEventRecord[]>(`/domain-events${qs({ organizationId, ...params })}`),
};
