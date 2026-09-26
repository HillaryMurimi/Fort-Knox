'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { buildingClient, type CreateBuildingInput, type UpdateBuildingInput } from '../../lib/data/buildings';
import { floorClient, type CreateFloorInput, type UpdateFloorInput } from '../../lib/data/floors';
import { unitClient, type CreateUnitInput, type UpdateUnitInput } from '../../lib/data/units';
import { queryKeys } from '../../lib/data/query-keys';

export function useBuildingsQuery(organizationId: string | null, propertyId?: string) {
  return useQuery({ queryKey: organizationId ? queryKeys.buildings.list(organizationId, propertyId) : ['buildings', 'disabled'], queryFn: () => propertyId ? buildingClient.listByProperty(propertyId) : buildingClient.listByOrganization(organizationId as string), enabled: Boolean(organizationId) });
}
export function useBuildingQuery(organizationId: string | null, buildingId: string | null) {
  return useQuery({ queryKey: organizationId && buildingId ? queryKeys.buildings.detail(organizationId, buildingId) : ['building', 'disabled'], queryFn: () => buildingClient.get(buildingId as string), enabled: Boolean(organizationId && buildingId) });
}
export function useCreateBuildingMutation(organizationId: string | null) { const qc = useQueryClient(); return useMutation({ mutationFn: (input: CreateBuildingInput) => buildingClient.create(organizationId as string, input), onSuccess: () => { if (organizationId) void qc.invalidateQueries({ queryKey: queryKeys.buildings.all(organizationId) }); } }); }
export function useUpdateBuildingMutation(organizationId: string | null, buildingId: string) { const qc = useQueryClient(); return useMutation({ mutationFn: (input: UpdateBuildingInput) => buildingClient.update(buildingId, input), onSuccess: () => { if (organizationId) void qc.invalidateQueries({ queryKey: queryKeys.buildings.all(organizationId) }); } }); }
export function useRemoveBuildingMutation(organizationId: string | null) { const qc = useQueryClient(); return useMutation({ mutationFn: (buildingId: string) => buildingClient.remove(buildingId), onSuccess: () => { if (organizationId) void qc.invalidateQueries({ queryKey: queryKeys.buildings.all(organizationId) }); } }); }

export function useFloorsQuery(organizationId: string | null, buildingId?: string) { return useQuery({ queryKey: organizationId ? queryKeys.floors.list(organizationId, buildingId) : ['floors', 'disabled'], queryFn: () => buildingId ? floorClient.listByBuilding(buildingId) : floorClient.listByOrganization(organizationId as string), enabled: Boolean(organizationId) }); }
export function useFloorQuery(organizationId: string | null, floorId: string | null) { return useQuery({ queryKey: organizationId && floorId ? queryKeys.floors.detail(organizationId, floorId) : ['floor', 'disabled'], queryFn: () => floorClient.get(floorId as string), enabled: Boolean(organizationId && floorId) }); }
export function useCreateFloorMutation(organizationId: string | null) { const qc = useQueryClient(); return useMutation({ mutationFn: (input: CreateFloorInput) => floorClient.create(organizationId as string, input), onSuccess: () => { if (organizationId) void qc.invalidateQueries({ queryKey: queryKeys.floors.all(organizationId) }); } }); }
export function useUpdateFloorMutation(organizationId: string | null, floorId: string) { const qc = useQueryClient(); return useMutation({ mutationFn: (input: UpdateFloorInput) => floorClient.update(floorId, input), onSuccess: () => { if (organizationId) void qc.invalidateQueries({ queryKey: queryKeys.floors.all(organizationId) }); } }); }
export function useRemoveFloorMutation(organizationId: string | null) { const qc = useQueryClient(); return useMutation({ mutationFn: (floorId: string) => floorClient.remove(floorId), onSuccess: () => { if (organizationId) void qc.invalidateQueries({ queryKey: queryKeys.floors.all(organizationId) }); } }); }

export function useUnitsQuery(organizationId: string | null, floorId?: string) { return useQuery({ queryKey: organizationId ? queryKeys.units.list(organizationId, floorId) : ['units', 'disabled'], queryFn: () => floorId ? unitClient.listByFloor(floorId) : unitClient.listByOrganization(organizationId as string), enabled: Boolean(organizationId) }); }
export function useUnitQuery(organizationId: string | null, unitId: string | null) { return useQuery({ queryKey: organizationId && unitId ? queryKeys.units.detail(organizationId, unitId) : ['unit', 'disabled'], queryFn: () => unitClient.get(unitId as string), enabled: Boolean(organizationId && unitId) }); }
export function useCreateUnitMutation(organizationId: string | null) { const qc = useQueryClient(); return useMutation({ mutationFn: (input: CreateUnitInput) => unitClient.create(organizationId as string, input), onSuccess: () => { if (organizationId) void qc.invalidateQueries({ queryKey: queryKeys.units.all(organizationId) }); } }); }
export function useUpdateUnitMutation(organizationId: string | null, unitId: string) { const qc = useQueryClient(); return useMutation({ mutationFn: (input: UpdateUnitInput) => unitClient.update(unitId, input), onSuccess: () => { if (organizationId) void qc.invalidateQueries({ queryKey: queryKeys.units.all(organizationId) }); } }); }
export function useRemoveUnitMutation(organizationId: string | null) { const qc = useQueryClient(); return useMutation({ mutationFn: (unitId: string) => unitClient.remove(unitId), onSuccess: () => { if (organizationId) void qc.invalidateQueries({ queryKey: queryKeys.units.all(organizationId) }); } }); }
