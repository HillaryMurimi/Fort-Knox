import { api } from '../api';
import type { PropertySetupInput, PropertySetupResult } from './property-setup';

const base = '/landlord-operations';
export interface SupportSession {
  _id: string;
  organizationId: string;
  adminUserId: string;
  adminName?: string;
  ownerUserId: string;
  purpose: string;
  permission: 'PROPERTY_SETUP';
  status: 'REQUESTED' | 'ACTIVE' | 'ENDED' | 'REJECTED';
  requestedAt: string;
  requestExpiresAt: string;
  approvedAt?: string;
  expiresAt?: string;
  endedAt?: string;
  useCount: number;
}
export interface LandlordDirectoryItem {
  id: string;
  name: string;
  status: string;
  onboardingState: string;
  declaredUnits: number | null;
  configuredUnits: number;
  properties: number;
  lastActivityAt: string;
  pilot: { planKey: 'CONTROL' | 'FORT_KNOX'; expiresAt: string; active: boolean } | null;
  subscription: string | null;
}
export interface LandlordDetail {
  organization: { _id: string; name: string; status: string; onboarding?: { state: string; unitCount?: number; selectedPlanKey?: string; ownerUserId?: string }; guidedPilot?: { planKey: 'CONTROL' | 'FORT_KNOX'; expiresAt: string; startedAt: string; ownerUserId: string } };
  onboardingState: string;
  outstandingUnits: number;
  configuredUnits: number;
  ownerAccount: { id: string; name: string; email?: string; verified: boolean; status: string } | null;
  properties: Array<{ _id: string; name: string; code: string }>;
  floors: Array<{ _id: string; name: string; code: string; propertyId: string; buildingId: string; configuredUnits: number }>;
  subscription: { status: string; provider: string } | null;
  lastActivity: { action: string; occurredAt: string } | null;
  supportSessions: SupportSession[];
}
export const landlordOperationsClient = {
  overview: () => api<{ totalLandlords: number; activePilots: number; payingOrganizations: number; incompleteOnboarding: number; activeSupportSessions: number }>(`${base}/overview`),
  directory: (search: string, status: string, page: number) => api<{ items: LandlordDirectoryItem[]; total: number; page: number; pageSize: number }>(`${base}/organizations?${new URLSearchParams({ search, status, page: String(page) })}`),
  detail: (organizationId: string) => api<LandlordDetail>(`${base}/organizations/${organizationId}`),
  createOrganization: (name: string, ownerEmail: string) => api<{ organizationId: string; invitationToken: string; expiresAt: string; delivery: string }>(`${base}/organizations`, { method: 'POST', body: JSON.stringify({ name, ownerEmail }) }),
  supportSessions: (organizationId: string) => api<SupportSession[]>(`${base}/organizations/${organizationId}/support-sessions`),
  requestSupport: (organizationId: string, ownerUserId: string, purpose: string) => api<SupportSession>(`${base}/support-sessions`, { method: 'POST', body: JSON.stringify({ organizationId, ownerUserId, purpose, permission: 'PROPERTY_SETUP' }) }),
  approveSupport: (id: string) => api<SupportSession>(`${base}/support-sessions/${id}/approve`, { method: 'POST' }),
  rejectSupport: (id: string) => api<SupportSession>(`${base}/support-sessions/${id}/reject`, { method: 'POST' }),
  endSupport: (id: string) => api<SupportSession>(`${base}/support-sessions/${id}/end`, { method: 'POST' }),
  addUnit: (id: string, input: { floorId: string; name: string; code: string; unitType: string; monthlyRent: number }) => api<{ _id: string }>(`${base}/support-sessions/${id}/units`, { method: 'POST', body: JSON.stringify(input) }),
  createPropertySetup: (id: string, input: PropertySetupInput) => api<PropertySetupResult>(`${base}/support-sessions/${id}/property-setups`, { method: 'POST', body: JSON.stringify(input) }),
  grantPilot: (organizationId: string, ownerUserId: string, planKey: string, durationDays: number) => api<{ expiresAt: string }>(`${base}/organizations/${organizationId}/pilot`, { method: 'POST', body: JSON.stringify({ ownerUserId, planKey, durationDays }) }),
  extendPilot: (organizationId: string, additionalDays: number) => api<{ expiresAt: string }>(`${base}/organizations/${organizationId}/pilot/extend`, { method: 'POST', body: JSON.stringify({ additionalDays }) }),
  terminatePilot: (organizationId: string) => api<{ active: boolean }>(`${base}/organizations/${organizationId}/pilot/terminate`, { method: 'POST' }),
  prepareConversion: (organizationId: string, planKey: string) => api<{ quote: { totalMinor: number; unitCount: number; currency: string }; ownerNextStep: string }>(`${base}/organizations/${organizationId}/pilot/prepare-conversion`, { method: 'POST', body: JSON.stringify({ planKey }) }),
};
