'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { billingClient, type BillingProvider, type ChangePlanInput, type InvoiceStatus, type SubscribeInput } from '@/lib/data/billing';
import { queryKeys } from '@/lib/data/query-keys';

export function useBillingPlansQuery() {
  return useQuery({ queryKey: queryKeys.billing.plans(), queryFn: billingClient.plans, staleTime: 5 * 60_000 });
}
export function useBillingSubscriptionQuery(organizationId?: string) {
  return useQuery({ queryKey: queryKeys.billing.subscription(organizationId ?? 'none'), queryFn: () => billingClient.subscription(organizationId!), enabled: Boolean(organizationId) });
}
export function useBillingEntitlementsQuery(organizationId?: string) {
  return useQuery({ queryKey: queryKeys.billing.entitlements(organizationId ?? 'none'), queryFn: () => billingClient.entitlements(organizationId!), enabled: Boolean(organizationId) });
}
export function useBillingUsageQuery(organizationId?: string) {
  return useQuery({ queryKey: queryKeys.billing.usage(organizationId ?? 'none'), queryFn: () => billingClient.usage(organizationId!), enabled: Boolean(organizationId), refetchInterval: 60_000 });
}
export function useBillingInvoicesQuery(organizationId?: string, status?: InvoiceStatus, page = 1) {
  return useQuery({ queryKey: queryKeys.billing.invoices(organizationId ?? 'none', status, page), queryFn: () => billingClient.invoices(organizationId!, status, page), enabled: Boolean(organizationId) });
}
function invalidate(qc: ReturnType<typeof useQueryClient>, organizationId: string) {
  void qc.invalidateQueries({ queryKey: queryKeys.billing.all(organizationId) });
}
export function useSubscribeMutation(organizationId?: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: SubscribeInput) => billingClient.subscribe(organizationId!, input), onSuccess: () => organizationId && invalidate(qc, organizationId) });
}
export function useRecoverCheckoutMutation(organizationId?: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => billingClient.recoverCheckout(organizationId!), onSuccess: () => organizationId && invalidate(qc, organizationId) });
}
export function useChangePlanMutation(organizationId?: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: ChangePlanInput) => billingClient.changePlan(organizationId!, input), onSuccess: () => organizationId && invalidate(qc, organizationId) });
}
export function useCancelSubscriptionMutation(organizationId?: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (atPeriodEnd: boolean) => billingClient.cancel(organizationId!, atPeriodEnd), onSuccess: () => organizationId && invalidate(qc, organizationId) });
}
export type { BillingProvider };
