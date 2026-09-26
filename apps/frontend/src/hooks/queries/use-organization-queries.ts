'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listOrganizations, getOrganization, updateOrganization, type UpdateOrganizationInput } from '../../lib/organizations/organization-api';
import { queryKeys } from '../../lib/data/query-keys';

export function useOrganizationsQuery(enabled = true) {
  return useQuery({ queryKey: queryKeys.organizations.list(), queryFn: listOrganizations, enabled });
}

export function useOrganizationQuery(organizationId: string | null) {
  return useQuery({ queryKey: organizationId ? queryKeys.organizations.detail(organizationId) : ['organization', 'disabled'], queryFn: () => getOrganization(organizationId as string), enabled: Boolean(organizationId) });
}

export function useUpdateOrganizationMutation(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: UpdateOrganizationInput) => updateOrganization(organizationId as string, input), onSuccess: () => { void client.invalidateQueries({ queryKey: queryKeys.organizations.all }); } });
}
