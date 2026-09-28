import { api } from '../api';
import type { Organization } from '../../types/organization';

export async function listOrganizations(): Promise<Organization[]> {
  return api<Organization[]>('/organizations', { method: 'GET' });
}

export async function getOrganization(organizationId: string): Promise<Organization> {
  return api<Organization>(`/organizations/${organizationId}`, { method: 'GET' });
}

export type UpdateOrganizationInput = Partial<Pick<Organization, 'name' | 'slug'>> & {
  settings?: NonNullable<Organization['settings']>;
  regionalProfile?: Partial<Pick<NonNullable<Organization['regionalProfile']>, 'locale' | 'timeZone'>>;
};

export async function updateOrganization(organizationId: string, input: UpdateOrganizationInput): Promise<Organization> {
  return api<Organization>(`/organizations/${organizationId}`, { method: 'PATCH', body: JSON.stringify(input) });
}
