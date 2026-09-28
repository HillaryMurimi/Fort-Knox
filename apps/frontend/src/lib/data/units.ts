import { api } from '../api';
import type { Unit } from './resource-types';

export type CreateUnitInput = Pick<Unit, 'floorId' | 'name' | 'code' | 'unitType' | 'monthlyRent'> & Pick<Unit, 'unitTypeLabel' | 'serviceCharge' | 'areaSqm' | 'bedrooms' | 'bathrooms' | 'amenities'>;
export type UpdateUnitInput = Partial<Omit<CreateUnitInput, 'floorId'>> & { status?: Unit['status'] };

export const unitClient = {
  listByOrganization: (organizationId: string) => api<Unit[]>(`/organizations/${organizationId}/units`),
  listByFloor: (floorId: string) => api<Unit[]>(`/floors/${floorId}/units`),
  get: (unitId: string) => api<Unit>(`/units/${unitId}`),
  create: (organizationId: string, input: CreateUnitInput) => api<Unit>(`/organizations/${organizationId}/units`, { method: 'POST', body: JSON.stringify(input) }),
  update: (unitId: string, input: UpdateUnitInput) => api<Unit>(`/units/${unitId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (unitId: string) => api<Unit>(`/units/${unitId}`, { method: 'DELETE' }),
};
