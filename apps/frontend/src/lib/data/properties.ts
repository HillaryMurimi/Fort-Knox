import { api } from '../api';
import type { Property } from './resource-types';

export type CreatePropertyInput = Pick<Property, 'name' | 'code' | 'propertyType' | 'address'> & Pick<Property, 'description' | 'location'>;
export type UpdatePropertyInput = Partial<Omit<CreatePropertyInput, never>> & { status?: Property['status'] };

export const propertyClient = {
  list: (organizationId: string) => api<Property[]>(`/organizations/${organizationId}/properties`),
  get: (propertyId: string) => api<Property>(`/properties/${propertyId}`),
  create: (organizationId: string, input: CreatePropertyInput) => api<Property>(`/organizations/${organizationId}/properties`, { method: 'POST', body: JSON.stringify(input) }),
  update: (propertyId: string, input: UpdatePropertyInput) => api<Property>(`/properties/${propertyId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (propertyId: string) => api<Property>(`/properties/${propertyId}`, { method: 'DELETE' }),
};
