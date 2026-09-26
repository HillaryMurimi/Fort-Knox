import { integrationConfig } from '../integrations/config.js';

export type BillingProviderKey = 'INTERNAL' | 'MPESA' | 'STRIPE' | 'OTHER';

export interface CreateCustomerInput {
  organizationId: string;
  name: string;
  email?: string;
  phone?: string;
}

export interface CreateSubscriptionInput {
  customerReference: string;
  planKey: string;
  currency: string;
  amount: number;
  interval: 'MONTH' | 'QUARTER' | 'YEAR';
}

export interface BillingProviderSubscription {
  providerCustomerId: string;
  providerSubscriptionId: string;
  status: 'ACTIVE' | 'PENDING' | 'FAILED';
}

export interface BillingProvider {
  readonly key: BillingProviderKey;
  createCustomer(input: CreateCustomerInput): Promise<{ providerCustomerId: string }>;
  createSubscription(input: CreateSubscriptionInput): Promise<BillingProviderSubscription>;
  cancelSubscription(providerSubscriptionId: string, atPeriodEnd: boolean): Promise<void>;
}

export class StripeBillingProvider implements BillingProvider {
  readonly key: BillingProviderKey = 'STRIPE';

  private headers() {
    if (!integrationConfig.stripe.secretKey) throw new Error('STRIPE_NOT_CONFIGURED');
    return { authorization: `Bearer ${integrationConfig.stripe.secretKey}`, 'content-type': 'application/x-www-form-urlencoded' };
  }

  private async request<T>(path: string, body?: URLSearchParams, method = 'POST'): Promise<T> {
    const response = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers: this.headers(), body });
    const data = await response.json() as T & { error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message ?? `STRIPE_${response.status}`);
    return data;
  }

  async createCustomer(input: CreateCustomerInput) {
    const body = new URLSearchParams({ name: input.name, 'metadata[organizationId]': input.organizationId });
    if (input.email) body.set('email', input.email);
    if (input.phone) body.set('phone', input.phone);
    const result = await this.request<{ id: string }>('customers', body);
    return { providerCustomerId: result.id };
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<BillingProviderSubscription> {
    const interval = input.interval === 'YEAR' ? 'year' : 'month';
    const intervalCount = input.interval === 'QUARTER' ? 3 : 1;
    const product = await this.request<{ id: string }>('products', new URLSearchParams({ name: `Property Command Center - ${input.planKey}`, 'metadata[planKey]': input.planKey }));
    const priceBody = new URLSearchParams({ currency: input.currency.toLowerCase(), unit_amount: String(Math.round(input.amount * 100)), 'recurring[interval]': interval, 'recurring[interval_count]': String(intervalCount), product: product.id });
    const price = await this.request<{ id: string }>('prices', priceBody);
    const subscription = await this.request<{ id: string; status: string }>('subscriptions', new URLSearchParams({ customer: input.customerReference, 'items[0][price]': price.id }));
    const status = subscription.status === 'active' || subscription.status === 'trialing' ? 'ACTIVE' : subscription.status === 'incomplete' ? 'PENDING' : 'FAILED';
    return { providerCustomerId: input.customerReference, providerSubscriptionId: subscription.id, status };
  }

  async cancelSubscription(providerSubscriptionId: string, atPeriodEnd: boolean) {
    if (atPeriodEnd) {
      await this.request(`subscriptions/${encodeURIComponent(providerSubscriptionId)}`, new URLSearchParams({ cancel_at_period_end: 'true' }), 'POST');
      return;
    }
    await this.request(`subscriptions/${encodeURIComponent(providerSubscriptionId)}`, undefined, 'DELETE');
  }
}

export class UnconfiguredBillingProvider implements BillingProvider {
  readonly key: BillingProviderKey;
  constructor(key: BillingProviderKey = 'INTERNAL') { this.key = key; }
  async createCustomer(_input: CreateCustomerInput) { return { providerCustomerId: `internal_customer_${Date.now()}` }; }
  async createSubscription(_input: CreateSubscriptionInput) { return { providerCustomerId: `internal_customer_${Date.now()}`, providerSubscriptionId: `internal_subscription_${Date.now()}`, status: 'ACTIVE' as const }; }
  async cancelSubscription(_providerSubscriptionId: string, _atPeriodEnd: boolean) { return undefined; }
}

export function getBillingProvider(key: BillingProviderKey): BillingProvider {
  return key === 'STRIPE' ? new StripeBillingProvider() : new UnconfiguredBillingProvider(key);
}
