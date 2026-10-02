import { api } from '../api';
import type { LaunchReadinessResponse, ReadinessReviewInput } from './launch-readiness';
import type { Organization } from '../../types/organization';
import type { BillingPlan, BillingSubscription, BillingUsageSnapshot, PaginatedInvoices, SubscriptionInvoice } from './resource-types';

export interface PlatformUser { _id: string; phone: string; email?: string; firstName: string; lastName: string; status: 'ACTIVE'|'SUSPENDED'|'DEACTIVATED'; verifiedAt?: string; createdAt?: string; }
export interface PlatformMembership { userId: string; roleIds: string[]; scope: { allProperties: boolean; propertyIds: string[]; buildingIds: string[]; unitIds: string[] }; status: string; joinedAt?: string; }
export interface PlatformRole { _id: string; name: string; key: string; description?: string; permissions: string[]; system?: boolean; assignable?: boolean; organizationId?: string | null; }
export interface PlatformPermission { _id: string; key: string; resource?: string; action?: string; description?: string; }
export interface PlatformJob { _id: string; organizationId?: string; type: string; status: 'QUEUED'|'RUNNING'|'SUCCEEDED'|'FAILED'|'CANCELLED'|'DEAD_LETTER'; priority: number; attempts: number; maxAttempts: number; availableAt?: string; startedAt?: string; completedAt?: string; failedAt?: string; error?: string; createdAt?: string; }
export interface PlatformAuditLog { _id: string; organizationId?: string; actorUserId?: string; actorRole?: string; action: string; resourceType: string; resourceId?: string; requestId?: string; occurredAt: string; }
export interface PlatformDiagnostics { status: string; [key: string]: unknown }
export type PlatformSwitchMode = 'ON' | 'OFF' | 'MAINTENANCE';
export interface PlatformSwitch { _id: string; key: string; kind: 'SERVICE' | 'FEATURE'; name: string; description: string; environment: string; enabled: boolean; mode: PlatformSwitchMode; reason: string; modifiedBy?: string; modifiedAt?: string; }

export interface CreatePlanInput {
  key: string; name: string; description?: string; currency: string; amount: number;
  billingInterval: 'MONTH'|'QUARTER'|'YEAR'; trialDays: number;
  entitlements: { maxProperties: number; maxUnits: number; maxUsers: number; maxTenants: number; features: string[] };
  active: boolean;
}

export const platformClient = {
  organizations: () => api<Organization[]>('/organizations'),
  users: (organizationId: string) => api<{ users: PlatformUser[]; memberships: PlatformMembership[] }>(`/users/organization/${organizationId}`),
  roles: (organizationId: string) => api<PlatformRole[]>(`/roles/organization/${organizationId}`),
  permissions: (organizationId: string) => api<PlatformPermission[]>(`/permissions/organization/${organizationId}`),
  jobs: (organizationId: string, status?: PlatformJob['status']) => {
    const params = new URLSearchParams({ page: '1', pageSize: '50' });
    if (status) params.set('status', status);
    return api<{ items: PlatformJob[]; pagination: { total: number; totalPages: number } }>(`/organizations/${organizationId}/jobs?${params.toString()}`);
  },
  audit: (organizationId: string) => api<PlatformAuditLog[]>(`/audit-logs?organizationId=${organizationId}&limit=50`),
  domainEvents: (organizationId: string) => api<PlatformAuditLog[]>(`/domain-events?organizationId=${organizationId}&limit=50`),
  diagnostics: () => api<PlatformDiagnostics>('/operations/diagnostics'),
  integrationsHealth: () => api<Record<string, boolean>>('/integrations/integrations/health'),
  launchReadiness: () => api<LaunchReadinessResponse>('/platform-control/launch-readiness'),
  updateLaunchReadiness: (key: string, input: ReadinessReviewInput) => api<LaunchReadinessResponse>(`/platform-control/launch-readiness/${encodeURIComponent(key)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  switches: () => api<PlatformSwitch[]>('/platform-control/switches'),
  updateSwitch: (key: string, input: { mode: PlatformSwitchMode; reason: string; confirm: true }) => api<PlatformSwitch>(`/platform-control/switches/${key}`, { method: 'PATCH', body: JSON.stringify(input) }),
  plans: (includeInactive = true) => api<BillingPlan[]>(`/billing/plans?activeOnly=${includeInactive ? 'false' : 'true'}`),
  createPlan: (input: CreatePlanInput) => api<BillingPlan>('/billing/plans', { method: 'POST', body: JSON.stringify(input) }),
  updatePlan: (planId: string, input: Partial<CreatePlanInput>) => api<BillingPlan>(`/billing/plans/${planId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  subscription: (organizationId: string) => api<BillingSubscription | null>(`/billing/organizations/${organizationId}/subscription`),
  usage: (organizationId: string) => api<BillingUsageSnapshot>(`/billing/organizations/${organizationId}/usage`),
  invoices: (organizationId: string) => api<PaginatedInvoices>(`/billing/organizations/${organizationId}/invoices?page=1&pageSize=50`),
  markInvoicePaid: (organizationId: string, invoiceId: string, amount: number) => api<SubscriptionInvoice>(`/billing/organizations/${organizationId}/invoices/${invoiceId}/mark-paid`, { method: 'POST', body: JSON.stringify({ amount }) }),
};
