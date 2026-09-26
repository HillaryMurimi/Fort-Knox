'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { operationsClient, type JobQuery, type NotificationQuery } from '../../lib/data/operations';
import type { NotificationRecord } from '../../lib/data/resource-types';
import { queryKeys } from '../../lib/data/query-keys';

export function useNotificationsQuery(org: string | null, params: NotificationQuery = {}) {
  const serialized = JSON.stringify(params);
  return useQuery({ queryKey: org ? queryKeys.operations.notifications(org, serialized) : ['operations', 'notifications', 'disabled'], queryFn: () => operationsClient.notifications(org as string, params), enabled: Boolean(org), refetchInterval: 30_000 });
}
export function useNotificationPreferencesQuery(org: string | null) {
  return useQuery({ queryKey: org ? queryKeys.operations.preferences(org) : ['operations', 'preferences', 'disabled'], queryFn: () => operationsClient.preferences(org as string), enabled: Boolean(org) });
}
export function useNotificationReadMutation(org: string | null) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: operationsClient.markNotificationRead, onSuccess: () => { if (org) qc.invalidateQueries({ queryKey: queryKeys.operations.all(org) }); } });
}
export function useNotificationPreferenceMutation(org: string | null) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: { eventType: string; channels: NotificationRecord['channel'][]; enabled: boolean }) => operationsClient.setPreference(org as string, input), onSuccess: () => { if (org) qc.invalidateQueries({ queryKey: queryKeys.operations.preferences(org) }); } });
}
export function useJobsQuery(org: string | null, params: JobQuery = {}) {
  const serialized = JSON.stringify(params);
  return useQuery({ queryKey: org ? queryKeys.operations.jobs(org, serialized) : ['operations', 'jobs', 'disabled'], queryFn: () => operationsClient.jobs(org as string, params), enabled: Boolean(org), refetchInterval: 15_000 });
}
export function useEnqueueJobMutation(org: string | null) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: { type: string; payload?: Record<string, unknown>; priority?: number; maxAttempts?: number; dedupeKey?: string }) => operationsClient.enqueueJob({ organizationId: org as string, ...input }), onSuccess: () => { if (org) qc.invalidateQueries({ queryKey: queryKeys.operations.jobs(org, JSON.stringify({})) }); } });
}
