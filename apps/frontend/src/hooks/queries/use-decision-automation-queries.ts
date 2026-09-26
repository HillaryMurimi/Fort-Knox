'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { decisionAutomationClient, type ActionStatusInput, type DecisionAutomationActionQuery, type DecisionAutomationPeriod, type DecisionAutomationPolicyInput, type TenantRiskQuery, type VacancyForecastQuery } from '../../lib/data/decision-automation';
import { queryKeys } from '../../lib/data/query-keys';

const disabled = ['decision-automation', 'disabled'] as const;

export function useDecisionAutomationOverviewQuery(org: string | null, params: DecisionAutomationPeriod = {}) {
  const serialized = JSON.stringify(params);
  return useQuery({ queryKey: org ? queryKeys.decisionAutomation.overview(org, serialized) : disabled, queryFn: () => decisionAutomationClient.overview(org as string, params), enabled: Boolean(org), refetchInterval: 30_000 });
}
export function useDecisionAutomationPolicyQuery(org: string | null) {
  return useQuery({ queryKey: org ? queryKeys.decisionAutomation.policy(org) : disabled, queryFn: () => decisionAutomationClient.policy(org as string), enabled: Boolean(org) });
}
export function useDecisionAutomationActionsQuery(org: string | null, params: DecisionAutomationActionQuery = {}) {
  const serialized = JSON.stringify(params);
  return useQuery({ queryKey: org ? queryKeys.decisionAutomation.actions(org, serialized) : disabled, queryFn: () => decisionAutomationClient.actions(org as string, params), enabled: Boolean(org), refetchInterval: 30_000 });
}
export function useTenantArrearsRisksQuery(org: string | null, params: TenantRiskQuery = {}) {
  const serialized = JSON.stringify(params);
  return useQuery({ queryKey: org ? queryKeys.decisionAutomation.tenantRisks(org, serialized) : disabled, queryFn: () => decisionAutomationClient.tenantRisks(org as string, params), enabled: Boolean(org), refetchInterval: 60_000 });
}
export function useVacancyForecastsQuery(org: string | null, params: VacancyForecastQuery = {}) {
  const serialized = JSON.stringify(params);
  return useQuery({ queryKey: org ? queryKeys.decisionAutomation.vacancies(org, serialized) : disabled, queryFn: () => decisionAutomationClient.vacancyForecasts(org as string, params), enabled: Boolean(org), refetchInterval: 60_000 });
}
function invalidate(qc: ReturnType<typeof useQueryClient>, org: string) {
  return qc.invalidateQueries({ queryKey: queryKeys.decisionAutomation.all(org) });
}
export function useEvaluateDecisionAutomationMutation(org: string | null) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (params: DecisionAutomationPeriod = {}) => decisionAutomationClient.evaluate(org as string, params), onSuccess: () => { if (org) void invalidate(qc, org); } });
}
export function useBootstrapDecisionAutomationMutation(org: string | null) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => decisionAutomationClient.bootstrap(org as string), onSuccess: () => { if (org) void invalidate(qc, org); } });
}
export function useUpdateDecisionAutomationPolicyMutation(org: string | null) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: DecisionAutomationPolicyInput) => decisionAutomationClient.updatePolicy(org as string, input), onSuccess: () => { if (org) void invalidate(qc, org); } });
}
export function useUpdateLandlordActionMutation(org: string | null) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ actionId, input }: { actionId: string; input: ActionStatusInput }) => decisionAutomationClient.updateAction(actionId, input), onSuccess: () => { if (org) void invalidate(qc, org); } });
}
