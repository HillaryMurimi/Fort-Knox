import { api } from '../api';
import { toQueryString, type QueryValue } from './query-params';
import type { ModelActivationApproval, ModelDeployment, ModelMonitoringSnapshot, ModelSafetyIncident, ModelServingPolicy, PredictiveModel, TrainingRunResult } from './resource-types';

type Domain = 'ARREARS' | 'VACANCY' | 'REVENUE';
type ServingMode = 'SHADOW' | 'CANARY' | 'ACTIVE';

export type ModelServingQuery = {
  domain?: Domain;
  limit?: number;
};

export type IncidentQuery = {
  domain?: Domain;
  status?: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';
  limit?: number;
};

export interface PolicyInput {
  enabled?: boolean;
  mode?: ServingMode;
  canaryPercent?: number;
  minConfidence?: number;
  mlActionMinConfidence?: number;
  requireValidation?: boolean;
  maxDriftPsi?: number;
  maxPerformanceDegradation?: number;
  autoRollbackOnCriticalDrift?: boolean;
  autoRollbackOnPerformanceDegradation?: boolean;
  approvalValidityHours?: number;
  domains?: Partial<Record<Domain, boolean>>;
}

export interface DeploymentInput {
  domain: Domain;
  championModelId: string;
  challengerModelId?: string;
  mode: ServingMode;
  canaryPercent: number;
}

export interface RollbackInput {
  domain: Domain;
  reason: string;
}

export interface MonitorInput {
  domain?: Domain;
  windowDays: number;
}

export interface ApprovalRequestInput {
  domain: Domain;
  mode: 'CANARY' | 'ACTIVE';
  reason: string;
}

export interface ApprovalDecisionInput {
  decision: 'APPROVED' | 'REJECTED' | 'REVOKED';
  reason?: string;
}

export interface TrainingInput {
  domain?: Domain;
  horizonDays: number;
  minSamples: number;
}

const query = (params: Record<string, QueryValue>) => {
  const q = toQueryString(params);
  return q ? `?${q}` : '';
};

export const modelServingClient = {
  policy: (organizationId: string) =>
    api<ModelServingPolicy | null>(`/organizations/${organizationId}/model-serving/policy`),

  updatePolicy: (organizationId: string, input: PolicyInput) =>
    api<ModelServingPolicy>(`/organizations/${organizationId}/model-serving/policy`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  deployments: (organizationId: string, params: ModelServingQuery = {}) =>
    api<ModelDeployment[]>(
      `/organizations/${organizationId}/model-serving/deployments${query(params)}`,
    ),

  deploy: (organizationId: string, input: DeploymentInput) =>
    api<ModelDeployment>(`/organizations/${organizationId}/model-serving/deploy`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  rollback: (organizationId: string, input: RollbackInput) =>
    api<ModelDeployment>(`/organizations/${organizationId}/model-serving/rollback`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  monitor: (organizationId: string, input: MonitorInput) =>
    api<ModelMonitoringSnapshot>(`/organizations/${organizationId}/model-serving/monitor`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  monitoring: (organizationId: string, params: ModelServingQuery = {}) =>
    api<ModelMonitoringSnapshot[]>(
      `/organizations/${organizationId}/model-serving/monitoring${query(params)}`,
    ),

  approvals: (organizationId: string, params: ModelServingQuery = {}) =>
    api<ModelActivationApproval[]>(
      `/organizations/${organizationId}/model-serving/approvals${query(params)}`,
    ),

  requestApproval: (organizationId: string, input: ApprovalRequestInput) =>
    api<ModelActivationApproval>(
      `/organizations/${organizationId}/model-serving/approvals`,
      { method: 'POST', body: JSON.stringify(input) },
    ),

  decideApproval: (approvalId: string, input: ApprovalDecisionInput) =>
    api<ModelActivationApproval>(`/model-serving/approvals/${approvalId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  incidents: (organizationId: string, params: IncidentQuery = {}) =>
    api<ModelSafetyIncident[]>(
      `/organizations/${organizationId}/model-serving/incidents${query(params)}`,
    ),

  updateIncident: (
    incidentId: string,
    input: { status: 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED'; reason?: string },
  ) =>
    api<ModelSafetyIncident>(`/model-serving/incidents/${incidentId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  train: (organizationId: string, input: TrainingInput) =>
    api<Array<PredictiveModel | { domain: Domain; status: string; sampleCount: number }>>(
      `/organizations/${organizationId}/predictive-learning/train`,
      { method: 'POST', body: JSON.stringify(input) },
    ),

  promote: (organizationId: string, modelId: string) =>
    api<PredictiveModel>(`/organizations/${organizationId}/predictive-learning/promote`, {
      method: 'POST',
      body: JSON.stringify({ modelId }),
    }),
};