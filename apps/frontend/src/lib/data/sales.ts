import { api } from '@/lib/api';

export type PropertyOnboardingItem = {
  name: string;
  location?: string;
  buildings: number;
  units: number;
};

export type PropertyOnboardingRequestInput = {
  properties: PropertyOnboardingItem[];
  preferredDate?: string;
  notes?: string;
};

export type PropertyOnboardingRequestResult = {
  requestId: string;
  status: string;
  requestedAt: string;
  message: string;
};

export const salesClient = {
  requestPropertyOnboarding: (organizationId: string, input: PropertyOnboardingRequestInput) =>
    api<PropertyOnboardingRequestResult>(`/sales/organizations/${organizationId}/property-onboarding-requests`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};