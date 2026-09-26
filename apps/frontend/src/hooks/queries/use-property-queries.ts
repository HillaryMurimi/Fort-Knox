'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { propertyClient, type CreatePropertyInput, type UpdatePropertyInput } from '../../lib/data/properties';
import { queryKeys } from '../../lib/data/query-keys';

export function usePropertiesQuery(organizationId: string | null) {
  return useQuery({ queryKey: organizationId ? queryKeys.properties.list(organizationId) : ['properties', 'disabled'], queryFn: () => propertyClient.list(organizationId as string), enabled: Boolean(organizationId) });
}

export function usePropertyQuery(organizationId: string | null, propertyId: string | null) {
  return useQuery({ queryKey: organizationId && propertyId ? queryKeys.properties.detail(organizationId, propertyId) : ['property', 'disabled'], queryFn: () => propertyClient.get(propertyId as string), enabled: Boolean(organizationId && propertyId) });
}

export function useCreatePropertyMutation(organizationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (input: CreatePropertyInput) => propertyClient.create(organizationId as string, input), onSuccess: () => { if (organizationId) void queryClient.invalidateQueries({ queryKey: queryKeys.properties.all(organizationId) }); } });
}

export function useUpdatePropertyMutation(organizationId: string | null, propertyId: string) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (input: UpdatePropertyInput) => propertyClient.update(propertyId, input), onSuccess: () => { if (organizationId) void queryClient.invalidateQueries({ queryKey: queryKeys.properties.all(organizationId) }); } });
}

export function useRemovePropertyMutation(organizationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (propertyId: string) => propertyClient.remove(propertyId), onSuccess: () => { if (organizationId) void queryClient.invalidateQueries({ queryKey: queryKeys.properties.all(organizationId) }); } });
}
