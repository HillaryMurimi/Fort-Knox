import { integrationConfig } from '../integrations/config.js';
import { requestJson } from '../integrations/http.js';
import { toPaystackMinorUnits } from '../integrations/paystack.provider.js';
import { env } from '../../config/env.js';

export type BillingProviderKey = 'INTERNAL' | 'PAYSTACK';

export interface CreateCustomerInput {
  organizationId: string;
  name: string;
  email?: string;
}

export interface CreateSubscriptionInput {
  customerReference: string;
  email: string;
  planKey: string;
  organizationId: string;
  currency: string;
  amount: number;
  interval: 'MONTH' | 'QUARTER' | 'YEAR';
}

export interface BillingProviderSubscription {
  providerCustomerId: string;
  checkoutReference: string;
  checkoutUrl: string;
  providerPlanCode: string;
  status: 'PENDING';
}

interface Envelope<T> { status: boolean; message: string; data?: T }

export class PaystackBillingProvider {
  readonly key = 'PAYSTACK' as const;

  async fetchSubscription(code: string) {
    const secret = integrationConfig.paystack.secretKey;
    if (!secret) throw new Error('PAYSTACK_NOT_CONFIGURED');
    const response = await requestJson<Envelope<{ subscription_code?: string; email_token?: string; customer?: { customer_code?: string }; plan?: { plan_code?: string } }>>(`${integrationConfig.paystack.baseUrl}/subscription/${encodeURIComponent(code)}`, {
      headers: { authorization: `Bearer ${secret}` },
    });
    const data = response.data;
    if (!response.status || !data || data.subscription_code !== code || !data.customer?.customer_code || !data.plan?.plan_code) {
      throw new Error('PAYSTACK_SUBSCRIPTION_INVALID');
    }
    return { customerCode: data.customer.customer_code, planCode: data.plan.plan_code, subscriptionCode: data.subscription_code, emailToken: data.email_token };
  }

  private async request<T>(path: string, body: Record<string, unknown>, method: 'POST' | 'PUT' = 'POST'): Promise<T> {
    const secret = integrationConfig.paystack.secretKey;
    if (!secret) throw new Error('PAYSTACK_NOT_CONFIGURED');
    const response = await requestJson<Envelope<T>>(`${integrationConfig.paystack.baseUrl}/${path}`, {
      method,
      headers: { authorization: `Bearer ${secret}` },
      body: JSON.stringify(body),
    });
    if (!response.status) throw new Error(`PAYSTACK_BILLING_FAILED:${response.message}`);
    return response.data as T;
  }

  async createCustomer(input: CreateCustomerInput) {
    if (!input.email) throw new Error('BILLING_EMAIL_REQUIRED');
    const customer = await this.request<{ customer_code: string }>('customer', {
      email: input.email,
      metadata: { organizationId: input.organizationId, name: input.name },
    });
    if (!customer.customer_code) throw new Error('PAYSTACK_CUSTOMER_MISSING');
    return { providerCustomerId: customer.customer_code };
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<BillingProviderSubscription> {
    const amount = toPaystackMinorUnits(input.amount, input.currency);
    const plan = await this.request<{ plan_code: string }>('plan', {
      name: `PMCC ${input.planKey}`,
      amount,
      currency: input.currency.toUpperCase(),
      interval: { MONTH: 'monthly', QUARTER: 'quarterly', YEAR: 'annually' }[input.interval],
    });
    if (!plan.plan_code) throw new Error('PAYSTACK_PLAN_MISSING');
    const transaction = await this.initializeCheckout(plan.plan_code, input);
    return {
      providerCustomerId: input.customerReference,
      checkoutReference: transaction.reference,
      checkoutUrl: transaction.authorization_url,
      providerPlanCode: plan.plan_code,
      status: 'PENDING',
    };
  }

  private async initializeCheckout(planCode: string, input: CreateSubscriptionInput) {
    const transaction = await this.request<{ authorization_url: string; reference: string }>('transaction/initialize', {
      email: input.email,
      amount: String(toPaystackMinorUnits(input.amount, input.currency)),
      currency: input.currency.toUpperCase(),
      plan: planCode,
      channels: ['card'],
      callback_url: `${env.WEB_ORIGIN}/billing`,
      metadata: { organizationId: input.organizationId, planKey: input.planKey, purpose: 'SUBSCRIPTION' },
    });
    if (!transaction.reference || !transaction.authorization_url.startsWith('https://checkout.paystack.com/')) {
      throw new Error('PAYSTACK_CHECKOUT_INVALID');
    }
    return transaction;
  }

  async retryCheckout(planCode: string, input: CreateSubscriptionInput) {
    const transaction = await this.initializeCheckout(planCode, input);
    return { checkoutReference: transaction.reference, checkoutUrl: transaction.authorization_url };
  }

  async updatePlan(planCode: string, input: { planKey: string; amount: number; currency: string; interval: CreateSubscriptionInput['interval'] }) {
    await this.request(`plan/${encodeURIComponent(planCode)}`, {
      name: `PMCC ${input.planKey}`,
      amount: toPaystackMinorUnits(input.amount, input.currency),
      currency: input.currency.toUpperCase(),
      interval: { MONTH: 'monthly', QUARTER: 'quarterly', YEAR: 'annually' }[input.interval],
      update_existing_subscriptions: true,
    }, 'PUT');
  }

  async cancelSubscription(code: string, token: string): Promise<void> {
    await this.request('subscription/disable', { code, token });
  }
}
