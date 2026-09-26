import { api } from '../api';
import type { Building } from './resource-types';

export type CreateBuildingInput = Pick<Building, 'propertyId' | 'name' | 'code'> & Pick<Building, 'description'>;
export type UpdateBuildingInput = Partial<Pick<Building, 'name' | 'code' | 'description' | 'status' | 'totalFloors'>>;

export const buildingClient = {
  listByOrganization: (organizationId: string) => api<Building[]>(`/organizations/${organizationId}/buildings`),
  listByProperty: (propertyId: string) => api<Building[]>(`/properties/${propertyId}/buildings`),
  get: (buildingId: string) => api<Building>(`/buildings/${buildingId}`),
  create: (organizationId: string, input: CreateBuildingInput) => api<Building>(`/organizations/${organizationId}/buildings`, { method: 'POST', body: JSON.stringify(input) }),
  update: (buildingId: string, input: UpdateBuildingInput) => api<Building>(`/buildings/${buildingId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (buildingId: string) => api<Building>(`/buildings/${buildingId}`, { method: 'DELETE' }),
};
