'use client';
import { useQuery } from '@tanstack/react-query';
import { auditClient, type AuditQuery, type DomainEventQuery } from '../../lib/data/audit';
import { queryKeys } from '../../lib/data/query-keys';

export function useAuditLogsQuery(org: string | null, params: AuditQuery = {}) {
  const serialized = JSON.stringify(params);
  return useQuery({
    queryKey: org ? queryKeys.audit.logs(org, serialized) : ['audit', 'disabled'],
    queryFn: () => auditClient.logs(org as string, params),
    enabled: Boolean(org),
  });
}

export function useDomainEventsQuery(org: string | null, params: DomainEventQuery = {}) {
  const serialized = JSON.stringify(params);
  return useQuery({
    queryKey: org ? queryKeys.audit.events(org, serialized) : ['events', 'disabled'],
    queryFn: () => auditClient.events(org as string, params),
    enabled: Boolean(org),
  });
}
