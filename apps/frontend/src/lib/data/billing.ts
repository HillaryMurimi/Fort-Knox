import { api } from '../api';
import type { BillingEntitlements, BillingPlan, BillingSubscription, BillingUsageSnapshot, SubscriptionInvoice, PaginatedInvoices } from './resource-types';

export type BillingProvider = 'INTERNAL' | 'PAYSTACK';
export type InvoiceStatus = 'DRAFT' | 'OPEN' | 'PAID' | 'PAST_DUE' | 'VOID' | 'UNCOLLECTIBLE';

export interface ChangePlanInput { planKey: string; atPeriodEnd: boolean }
export interface SubscribeInput { planKey: string; provider: BillingProvider; email?: string }

export const billingClient = {
  plans: () => api<BillingPlan[]>('/billing/plans'),
  subscription: (organizationId: string) => api<BillingSubscription | null>(`/billing/organizations/${organizationId}/subscription`),
  subscribe: (organizationId: string, input: SubscribeInput) => api<BillingSubscription>(`/billing/organizations/${organizationId}/subscription`, { method: 'POST', body: JSON.stringify(input) }),
  changePlan: (organizationId: string, input: ChangePlanInput) => api<BillingSubscription>(`/billing/organizations/${organizationId}/subscription/change-plan`, { method: 'POST', body: JSON.stringify(input) }),
  cancel: (organizationId: string, atPeriodEnd: boolean) => api<BillingSubscription>(`/billing/organizations/${organizationId}/subscription/cancel`, { method: 'POST', body: JSON.stringify({ atPeriodEnd }) }),
  invoices: (organizationId: string, status?: InvoiceStatus, page = 1, pageSize = 25) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status) params.set('status', status);
    return api<PaginatedInvoices>(`/billing/organizations/${organizationId}/invoices?${params.toString()}`);
  },
  usage: (organizationId: string) => api<BillingUsageSnapshot>(`/billing/organizations/${organizationId}/usage`),
  entitlements: (organizationId: string) => api<BillingEntitlements>(`/billing/organizations/${organizationId}/entitlements`),
};

export type { BillingPlan, BillingSubscription, SubscriptionInvoice, BillingEntitlements, BillingUsageSnapshot };
