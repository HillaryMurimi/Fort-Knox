import { api } from '../api';
import type { Tenant } from './resource-types';

export type CreateTenantInput = Pick<Tenant, 'userId'> & Partial<Pick<Tenant, 'status' | 'nationalIdLast4' | 'dateOfBirth' | 'emergencyContact' | 'notes'>>;
export type UpdateTenantInput = Partial<Omit<CreateTenantInput, 'userId'>>;

export const tenantClient = {
  list: (organizationId: string) => api<Tenant[]>(`/organizations/${organizationId}/tenants`),
  get: (tenantId: string) => api<Tenant>(`/tenants/${tenantId}`),
  create: (organizationId: string, input: CreateTenantInput) => api<Tenant>(`/organizations/${organizationId}/tenants`, { method: 'POST', body: JSON.stringify(input) }),
  update: (tenantId: string, input: UpdateTenantInput) => api<Tenant>(`/tenants/${tenantId}`, { method: 'PATCH', body: JSON.stringify(input) }),
};
