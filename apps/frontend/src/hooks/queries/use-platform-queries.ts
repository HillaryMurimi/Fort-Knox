'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { platformClient } from '@/lib/data/platform';
import { queryKeys } from '@/lib/data/query-keys';

export function usePlatformOrganizationsQuery(enabled = true) { return useQuery({ queryKey: queryKeys.platform.organizations(), queryFn: platformClient.organizations, enabled, staleTime: 30_000 }); }
export function usePlatformPlansQuery(enabled = true) { return useQuery({ queryKey: queryKeys.platform.plans(), queryFn: () => platformClient.plans(true), enabled, staleTime: 60_000 }); }
export function usePlatformOrganizationUsersQuery(organizationId?: string) { return useQuery({ queryKey: queryKeys.platform.users(organizationId ?? 'none'), queryFn: () => platformClient.users(organizationId!), enabled: Boolean(organizationId), staleTime: 30_000 }); }
export function usePlatformRolesQuery(organizationId?: string) { return useQuery({ queryKey: queryKeys.platform.roles(organizationId ?? 'none'), queryFn: () => platformClient.roles(organizationId!), enabled: Boolean(organizationId), staleTime: 60_000 }); }
export function usePlatformPermissionsQuery(organizationId?: string) { return useQuery({ queryKey: queryKeys.platform.permissions(organizationId ?? 'none'), queryFn: () => platformClient.permissions(organizationId!), enabled: Boolean(organizationId), staleTime: 60_000 }); }
export function usePlatformJobsQuery(organizationId?: string, status?: Parameters<typeof platformClient.jobs>[1]) { return useQuery({ queryKey: queryKeys.platform.jobs(organizationId ?? 'none', status), queryFn: () => platformClient.jobs(organizationId!, status), enabled: Boolean(organizationId), refetchInterval: 15_000 }); }
export function usePlatformAuditQuery(organizationId?: string) { return useQuery({ queryKey: queryKeys.platform.audit(organizationId ?? 'none'), queryFn: () => platformClient.audit(organizationId!), enabled: Boolean(organizationId), staleTime: 30_000 }); }
export function usePlatformEventsQuery(organizationId?: string) { return useQuery({ queryKey: queryKeys.platform.events(organizationId ?? 'none'), queryFn: () => platformClient.domainEvents(organizationId!), enabled: Boolean(organizationId), staleTime: 30_000 }); }
export function usePlatformDiagnosticsQuery(enabled = true) { return useQuery({ queryKey: queryKeys.platform.diagnostics(), queryFn: platformClient.diagnostics, enabled, refetchInterval: 30_000 }); }
export function usePlatformIntegrationsHealthQuery(enabled = true) { return useQuery({ queryKey: queryKeys.platform.integrations(), queryFn: platformClient.integrationsHealth, enabled, refetchInterval: 30_000 }); }
export function usePlatformSwitchesQuery(enabled = true) { return useQuery({ queryKey: queryKeys.platform.switches(), queryFn: platformClient.switches, enabled, staleTime: 15_000 }); }
export function usePlatformSwitchMutation() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ key, mode, reason }: { key: string; mode: 'ON' | 'OFF' | 'MAINTENANCE'; reason: string }) => platformClient.updateSwitch(key, { mode, reason, confirm: true }), onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.platform.switches() }) }); }
export function usePlatformSubscriptionQuery(organizationId?: string) { return useQuery({ queryKey: queryKeys.platform.subscription(organizationId ?? 'none'), queryFn: () => platformClient.subscription(organizationId!), enabled: Boolean(organizationId), staleTime: 30_000 }); }
export function usePlatformUsageQuery(organizationId?: string) { return useQuery({ queryKey: queryKeys.platform.usage(organizationId ?? 'none'), queryFn: () => platformClient.usage(organizationId!), enabled: Boolean(organizationId), staleTime: 30_000 }); }
export function usePlatformInvoicesQuery(organizationId?: string) { return useQuery({ queryKey: queryKeys.platform.invoices(organizationId ?? 'none'), queryFn: () => platformClient.invoices(organizationId!), enabled: Boolean(organizationId), staleTime: 30_000 }); }

export function useCreatePlanMutation() { const qc = useQueryClient(); return useMutation({ mutationFn: platformClient.createPlan, onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.platform.plans() }) }); }
export function useUpdatePlanMutation() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ planId, input }: { planId: string; input: Parameters<typeof platformClient.updatePlan>[1] }) => platformClient.updatePlan(planId, input), onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.platform.plans() }) }); }
export function useMarkInvoicePaidMutation(organizationId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: ({ invoiceId, amount }: { invoiceId: string; amount: number }) => platformClient.markInvoicePaid(organizationId!, invoiceId, amount), onSuccess: () => { if (organizationId) { void qc.invalidateQueries({ queryKey: queryKeys.platform.invoices(organizationId) }); void qc.invalidateQueries({ queryKey: queryKeys.platform.subscription(organizationId) }); } } }); }

export function useLaunchReadinessQuery(enabled = true) {
  return useQuery({ queryKey: queryKeys.platform.launchReadiness(), queryFn: platformClient.launchReadiness, enabled, refetchInterval: 30_000 });
}
export function useUpdateLaunchReadinessMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, input }: { key: string; input: Parameters<typeof platformClient.updateLaunchReadiness>[1] }) => platformClient.updateLaunchReadiness(key, input),
    onSuccess: data => { qc.setQueryData(queryKeys.platform.launchReadiness(), data); },
  });
}
