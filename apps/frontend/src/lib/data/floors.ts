import { api } from '../api';
import type { Floor } from './resource-types';

export type CreateFloorInput = Pick<Floor, 'buildingId' | 'name' | 'level' | 'code'>;
export type UpdateFloorInput = Partial<Pick<Floor, 'name' | 'level' | 'code' | 'status'>>;

export const floorClient = {
  listByOrganization: (organizationId: string) => api<Floor[]>(`/organizations/${organizationId}/floors`),
  listByBuilding: (buildingId: string) => api<Floor[]>(`/buildings/${buildingId}/floors`),
  get: (floorId: string) => api<Floor>(`/floors/${floorId}`),
  create: (organizationId: string, input: CreateFloorInput) => api<Floor>(`/organizations/${organizationId}/floors`, { method: 'POST', body: JSON.stringify(input) }),
  update: (floorId: string, input: UpdateFloorInput) => api<Floor>(`/floors/${floorId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (floorId: string) => api<Floor>(`/floors/${floorId}`, { method: 'DELETE' }),
};
