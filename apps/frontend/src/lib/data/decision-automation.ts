import { api } from '../api';
import { toQueryString, type QueryValue } from './query-params';
import type {
  DecisionAutomationOverview,
  DecisionAutomationPolicy,
  LandlordAction,
  TenantArrearsRisk,
  VacancyForecast,
} from './resource-types';

export type DecisionAutomationPeriod = {
  from?: string;
  to?: string;
  propertyId?: string;
};

export type DecisionAutomationActionQuery = DecisionAutomationPeriod & {
  status?: string;
  priority?: string;
  limit?: number;
};

export type TenantRiskQuery = {
  propertyId?: string;
  grade?: string;
  limit?: number;
};

export type VacancyForecastQuery = {
  propertyId?: string;
  limit?: number;
};

export type DecisionAutomationPolicyInput = {
  enabled?: boolean;
  evaluationIntervalMinutes?: number;
  escalationAfterMinutes?: number;
  notifyPriority?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  forecastHorizonDays?: number;
  maxNotificationsPerRun?: number;
};

export type ActionStatusInput = {
  status: 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED';
};

function query(params: Record<string, QueryValue>): string {
  const value = toQueryString(params);
  return value ? `?${value}` : '';
}

export const decisionAutomationClient = {
  overview: (organizationId: string, params: DecisionAutomationPeriod = {}) =>
    api<DecisionAutomationOverview>(
      `/organizations/${organizationId}/decision-automation${query(params)}`,
    ),
  evaluate: (organizationId: string, params: DecisionAutomationPeriod = {}) =>
    api<unknown>(
      `/organizations/${organizationId}/decision-automation/evaluate`,
      { method: 'POST', body: JSON.stringify(params) },
    ),
  bootstrap: (organizationId: string) =>
    api<{ policy: DecisionAutomationPolicy; scheduled: boolean }>(
      `/organizations/${organizationId}/decision-automation/bootstrap`,
      { method: 'POST' },
    ),
  policy: (organizationId: string) =>
    api<DecisionAutomationPolicy | null>(
      `/organizations/${organizationId}/decision-automation/policy`,
    ),
  updatePolicy: (organizationId: string, input: DecisionAutomationPolicyInput) =>
    api<DecisionAutomationPolicy>(
      `/organizations/${organizationId}/decision-automation/policy`,
      { method: 'PATCH', body: JSON.stringify(input) },
    ),
  actions: (organizationId: string, params: DecisionAutomationActionQuery = {}) =>
    api<LandlordAction[]>(
      `/organizations/${organizationId}/decision-automation/actions${query(params)}`,
    ),
  updateAction: (actionId: string, input: ActionStatusInput) =>
    api<LandlordAction>(`/decision-automation/actions/${actionId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  tenantRisks: (organizationId: string, params: TenantRiskQuery = {}) =>
    api<TenantArrearsRisk[]>(
      `/organizations/${organizationId}/decision-automation/tenant-risks${query(params)}`,
    ),
  vacancyForecasts: (organizationId: string, params: VacancyForecastQuery = {}) =>
    api<VacancyForecast[]>(
      `/organizations/${organizationId}/decision-automation/vacancy-forecasts${query(params)}`,
    ),
};