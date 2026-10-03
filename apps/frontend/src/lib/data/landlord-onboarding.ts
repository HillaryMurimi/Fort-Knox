import { api } from '../api';

export interface ContractPricing {
  planKey: string; planName: string; currency: string; unitCount: number; monthlyMinor: number;
  totalMinor: number; prepaidMonths: number; billingCycle: string; legalName: string;
  lineItems: Array<{ description: string; quantity: number; unitAmountMinor: number; totalMinor: number }>;
}
export interface LandlordProgress {
  state: string; revision: number; nextStep: 'DETAILS' | 'PLAN' | 'SIGNATURE' | 'PAYMENT' | 'COMPLETE';
  organization: { _id: string; name: string; pilotPrepared?: boolean; legalName?: string; legalIdentifier?: string; billingEmail?: string; unitCount?: number; attentionCode?: string };
  contract: null | { _id: string; body: string; sha256: string; templateId: string; templateVersion: number; status: string; documentId: string; signedDocumentId?: string; snapshot: ContractPricing; signature?: { name: string; signedAt: string } };
  invoice: null | { _id: string; invoiceNumber: string; total: number; currency: string; status: string; documentId?: string; receiptDocumentId?: string; dueDate: string };
  subscription: null | { status: string; providerCheckoutUrl?: string; providerCheckoutReference?: string; currentPeriodEnd: string; renewalState?: string };
}
export interface ContractTemplateVersion { _id: string; templateId: string; name: string; version: number; status: 'DRAFT' | 'ACTIVE' | 'RETIRED'; effectiveAt: string; plans: string[]; body: string; sha256: string }
export const contractVariableNames = ['legalName', 'organizationId', 'legalIdentifier', 'landlordName', 'planName', 'planKey', 'unitCount', 'currency', 'monthlyPrice', 'initialAmount', 'prepaidMonths', 'billingCycle', 'effectiveDate', 'hardwareTerms'];
const base = (org: string) => `/organizations/${org}/landlord-onboarding`;
const command = (method: string, input?: unknown) => ({ method, ...(input ? { body: JSON.stringify(input) } : {}) });
export const landlordOnboardingClient = {
  status: (org: string) => api<LandlordProgress>(base(org)),
  configure: (org: string, input: { legalName: string; legalIdentifier: string; billingEmail: string; unitCount: number }) => api<LandlordProgress>(`${base(org)}/details`, command('PUT', input)),
  quote: (org: string, planKey: string, prepaidMonths: number) => api<ContractPricing>(`${base(org)}/quote?planKey=${encodeURIComponent(planKey)}&prepaidMonths=${prepaidMonths}`),
  generate: (org: string, input: { planKey: string; prepaidMonths: number; expectedRevision: number }) => api<LandlordProgress>(`${base(org)}/contract`, command('POST', input)),
  replace: (org: string, input: { planKey: string; prepaidMonths: number; expectedRevision: number; reason: string; details?: { legalName: string; legalIdentifier: string; billingEmail: string; unitCount: number } }) => api<LandlordProgress>(`${base(org)}/replacement`, command('POST', input)),
  sign: (org: string, input: { contractId: string; documentHash: string; signatoryName: string; authorityConfirmed: true; termsAccepted: true }) => api<LandlordProgress>(`${base(org)}/signature`, command('POST', input)),
  checkout: (org: string) => api<LandlordProgress>(`${base(org)}/checkout`, command('POST')),
  reconcile: (org: string) => api<LandlordProgress>(`${base(org)}/reconcile`, command('POST')),
  oversight: (page: number) => api<{ items: Array<{ _id: string; name: string; onboarding: { state: string; attentionCode?: string; contractId?: string; invoiceId?: string; activatedAt?: string } }>; page: number; total: number }>(`/platform-control/landlord-onboarding?page=${page}`),
  templates: () => api<ContractTemplateVersion[]>('/platform-control/contract-templates'),
  createTemplate: (input: { templateId: string; name: string; version: number; effectiveAt: string; plans: string[]; variables: string[]; body: string }) => api<ContractTemplateVersion>('/platform-control/contract-templates', command('POST', input)),
  templateStatus: (id: string, status: 'ACTIVE' | 'RETIRED') => api<ContractTemplateVersion>(`/platform-control/contract-templates/${id}`, command('PATCH', { status })),
};
export async function downloadArtifact(id: string) {
  const blob = await api<Blob>(`/documents/${id}/pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = `dapinni-${id}.pdf`; anchor.click(); URL.revokeObjectURL(url);
}
export const onboardingStepIndex = (state: LandlordProgress) => state.nextStep === 'DETAILS' ? 0 : state.nextStep === 'PLAN' ? 1 : state.nextStep === 'SIGNATURE' ? 2 : state.nextStep === 'PAYMENT' ? 3 : 4;
