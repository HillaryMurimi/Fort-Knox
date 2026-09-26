import { api } from '../api';
import type { MaintenanceApprovalPolicy, MaintenanceRequest } from './resource-types';

export interface CreateMaintenanceInput { unitId: string; tenantId?: string; title: string; description: string; category: MaintenanceRequest['category']; priority?: MaintenanceRequest['priority']; evidenceIds?: string[]; }
export interface TriageInput { priority?: MaintenanceRequest['priority']; notes?: string; }
export interface AssignInput { assignedToUserId?: string; contractorId?: string; }
export interface QuoteInput { quoteAmount: number; notes?: string; evidenceIds?: string[]; }
export interface ApproveInput { approvedAmount?: number; notes?: string; }
export interface ProgressInput { status: 'IN_PROGRESS' | 'COMPLETED'; actualAmount?: number; resolutionNotes?: string; evidenceIds?: string[]; }
export interface VerifyInput { notes?: string; }
export interface MaintenancePolicyInput { approvalThreshold: number; emergencyAutoApprove?: boolean; autoApproveRoles?: string[]; currency?: string; }

export const maintenanceClient = {
  list: (organizationId: string) => api<MaintenanceRequest[]>(`/organizations/${organizationId}/maintenance`),
  get: (maintenanceId: string) => api<MaintenanceRequest>(`/maintenance/${maintenanceId}`),
  create: (organizationId: string, input: CreateMaintenanceInput) => api<MaintenanceRequest>(`/organizations/${organizationId}/maintenance`, { method: 'POST', body: JSON.stringify(input) }),
  addEvidence: (maintenanceId: string, files: File[]) => {
    const body = new FormData();
    for (const file of files) body.append('media', file, file.name);
    return api<import('./resource-types').EvidenceRecord[]>(`/maintenance/${maintenanceId}/evidence`, { method: 'POST', body });
  },
  triage: (maintenanceId: string, input: TriageInput) => api<MaintenanceRequest>(`/maintenance/${maintenanceId}/triage`, { method: 'POST', body: JSON.stringify(input) }),
  assign: (maintenanceId: string, input: AssignInput) => api<MaintenanceRequest>(`/maintenance/${maintenanceId}/assign`, { method: 'POST', body: JSON.stringify(input) }),
  quote: (maintenanceId: string, input: QuoteInput) => api<MaintenanceRequest>(`/maintenance/${maintenanceId}/quote`, { method: 'POST', body: JSON.stringify(input) }),
  approve: (maintenanceId: string, input: ApproveInput = {}) => api<MaintenanceRequest>(`/maintenance/${maintenanceId}/approve`, { method: 'POST', body: JSON.stringify(input) }),
  progress: (maintenanceId: string, input: ProgressInput) => api<MaintenanceRequest>(`/maintenance/${maintenanceId}/progress`, { method: 'POST', body: JSON.stringify(input) }),
  verify: (maintenanceId: string, input: VerifyInput = {}) => api<MaintenanceRequest>(`/maintenance/${maintenanceId}/verify`, { method: 'POST', body: JSON.stringify(input) }),
  close: (maintenanceId: string, notes?: string) => api<MaintenanceRequest>(`/maintenance/${maintenanceId}/close`, { method: 'POST', body: JSON.stringify(notes ? { notes } : {}) }),
  policy: {
    get: (organizationId: string) => api<MaintenanceApprovalPolicy>(`/organizations/${organizationId}/maintenance-policy`),
    set: (organizationId: string, input: MaintenancePolicyInput) => api<MaintenanceApprovalPolicy>(`/organizations/${organizationId}/maintenance-policy`, { method: 'PUT', body: JSON.stringify(input) }),
  },
};
