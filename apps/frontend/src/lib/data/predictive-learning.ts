import { api } from '../api';
import { toQueryString, type QueryValue } from './query-params';
import type { PredictiveModel } from './resource-types';

export type PredictiveModelQuery = {
  domain?: 'ARREARS' | 'VACANCY' | 'REVENUE';
  status?: 'CANDIDATE' | 'VALIDATED' | 'PROMOTED' | 'RETIRED';
  limit?: number;
};

export interface LabelOutcomesInput {
  domain?: 'ARREARS' | 'VACANCY' | 'REVENUE';
  asOf?: string;
  horizonDays?: number;
}

const query = (params: Record<string, QueryValue>) => {
  const q = toQueryString(params);
  return q ? `?${q}` : '';
};

export const predictiveLearningClient = {
  models: (organizationId: string, params: PredictiveModelQuery = {}) =>
    api<PredictiveModel[]>(
      `/organizations/${organizationId}/predictive-learning/models${query(params)}`,
    ),
  labelOutcomes: (organizationId: string, input: LabelOutcomesInput = {}) =>
    api<unknown>(
      `/organizations/${organizationId}/predictive-learning/label-outcomes`,
      { method: 'POST', body: JSON.stringify(input) },
    ),
};