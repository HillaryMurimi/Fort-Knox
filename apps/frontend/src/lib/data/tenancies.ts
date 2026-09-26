import { api } from '../api';
import type { Tenancy } from './resource-types';

export type CreateTenancyInput = Pick<Tenancy, 'tenantId' | 'unitId' | 'leaseNumber' | 'startDate' | 'monthlyRent' | 'billingDay' | 'noticePeriodDays'> & Partial<Pick<Tenancy, 'endDate' | 'serviceCharge' | 'depositAmount' | 'signedLeaseDocumentId' | 'notes'>>;
export type UpdateTenancyInput = Partial<Pick<Tenancy, 'endDate' | 'monthlyRent' | 'serviceCharge' | 'depositAmount' | 'billingDay' | 'noticePeriodDays' | 'signedLeaseDocumentId' | 'notes'>>;

export const tenancyClient = {
  list: (organizationId: string) => api<Tenancy[]>(`/organizations/${organizationId}/tenancies`),
  get: (tenancyId: string) => api<Tenancy>(`/tenancies/${tenancyId}`),
  create: (organizationId: string, input: CreateTenancyInput) => api<Tenancy>(`/organizations/${organizationId}/tenancies`, { method: 'POST', body: JSON.stringify(input) }),
  update: (tenancyId: string, input: UpdateTenancyInput) => api<Tenancy>(`/tenancies/${tenancyId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  activate: (tenancyId: string) => api<Tenancy>(`/tenancies/${tenancyId}/activate`, { method: 'POST' }),
  terminate: (tenancyId: string) => api<Tenancy>(`/tenancies/${tenancyId}/terminate`, { method: 'POST' }),
};
