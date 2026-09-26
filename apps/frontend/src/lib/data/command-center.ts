import { api } from '../api';
import type { CommandCenter } from '../../types/api';
import type { HealthHistoryPoint, IntelligenceAlert, PropertyHealth } from './resource-types';
import { toQueryString, type QueryValue } from './query-params';

export type CommandCenterQuery = {
  from?: string;
  to?: string;
  propertyId?: string;
};

export type AlertQuery = CommandCenterQuery & {
  status?: string;
  severity?: string;
  limit?: number;
};

export type AlertUpdateInput = {
  status: 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';
};

function query(params: Record<string, QueryValue>): string {
  const value = toQueryString(params);
  return value ? `?${value}` : '';
}

export const commandCenterClient = {
  dashboard: (organizationId: string, params: CommandCenterQuery = {}) =>
    api<CommandCenter>(`/organizations/${organizationId}/command-center${query(params)}`),
  propertyHealth: (organizationId: string, propertyId: string) =>
    api<PropertyHealth>(`/organizations/${organizationId}/properties/${propertyId}/health`),
  alerts: (organizationId: string, params: AlertQuery = {}) =>
    api<IntelligenceAlert[]>(`/organizations/${organizationId}/intelligence/alerts${query(params)}`),
  evaluate: (organizationId: string, params: CommandCenterQuery = {}) =>
    api<unknown>(`/organizations/${organizationId}/intelligence/evaluate`, {
      method: 'POST',
      body: JSON.stringify(params),
    }),
  updateAlert: (alertId: string, input: AlertUpdateInput) =>
    api<IntelligenceAlert>(`/intelligence/alerts/${alertId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  history: (organizationId: string, propertyId: string) =>
    api<HealthHistoryPoint[]>(`/organizations/${organizationId}/properties/${propertyId}/health/history`),
};