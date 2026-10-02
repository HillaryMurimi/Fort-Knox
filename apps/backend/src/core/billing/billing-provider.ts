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
  prepaidMonths?: number;
  initialAmount?: number;
  checkoutReference?: string;
  callbackPath?: string;
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
    const response = await requestJson<Envelope<{ subscription_code?: string; email_token?: string; next_payment_date?: string; customer?: { customer_code?: string }; plan?: { plan_code?: string } }>>(`${integrationConfig.paystack.baseUrl}/subscription/${encodeURIComponent(code)}`, {
      headers: { authorization: `Bearer ${secret}` },
    });
    const data = response.data;
    if (!response.status || !data || data.subscription_code !== code || !data.customer?.customer_code || !data.plan?.plan_code) {
      throw new Error('PAYSTACK_SUBSCRIPTION_INVALID');
    }
    return { customerCode: data.customer.customer_code, planCode: data.plan.plan_code, subscriptionCode: data.subscription_code, emailToken: data.email_token, ...(data.next_payment_date ? { nextPaymentAt: data.next_payment_date } : {}) };
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
      amount: String(toPaystackMinorUnits(input.initialAmount ?? input.amount * (input.prepaidMonths ?? 1), input.currency)),
      currency: input.currency.toUpperCase(),
      ...(input.initialAmount === undefined ? { plan: planCode } : {}),
      ...(input.checkoutReference ? { reference: input.checkoutReference } : {}),
      channels: ['card'],
      callback_url: `${env.WEB_ORIGIN}${input.callbackPath ?? '/billing'}`,
      metadata: { organizationId: input.organizationId, planKey: input.planKey, purpose: 'SUBSCRIPTION', prepaidMonths: input.prepaidMonths ?? 1 },
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

  async createPrepaidPlan(input: { name: string; amount: number; currency: string; interval: CreateSubscriptionInput['interval'] }) {
    const plan = await this.request<{ plan_code: string }>('plan', { name: input.name, amount: toPaystackMinorUnits(input.amount, input.currency), currency: input.currency, interval: { MONTH: 'monthly', QUARTER: 'quarterly', YEAR: 'annually' }[input.interval] });
    if (!plan.plan_code) throw new Error('PAYSTACK_PLAN_MISSING');
    return plan.plan_code;
  }

  async scheduleRenewal(input: { customerCode: string; planCode: string; authorizationCode: string; startsAt: Date }) {
    const result = await this.request<{ subscription_code: string; email_token?: string; next_payment_date?: string }>('subscription', { customer: input.customerCode, plan: input.planCode, authorization: input.authorizationCode, start_date: input.startsAt.toISOString() });
    if (!result.subscription_code || !result.next_payment_date || new Date(result.next_payment_date).getTime() < input.startsAt.getTime() - 1000) throw new Error('PAYSTACK_RENEWAL_SCHEDULE_INVALID');
    return result;
  }

  async findRenewal(customerCode: string, planCode: string) {
    const secret = integrationConfig.paystack.secretKey;
    if (!secret) throw new Error('PAYSTACK_NOT_CONFIGURED');
    const response = await requestJson<Envelope<{ subscriptions?: Array<{ subscription_code?: string; email_token?: string; plan?: { plan_code?: string }; next_payment_date?: string }> }>>(`${integrationConfig.paystack.baseUrl}/customer/${encodeURIComponent(customerCode)}`, { headers: { authorization: `Bearer ${secret}` } });
    if (!response.status || !Array.isArray(response.data?.subscriptions)) throw new Error('PAYSTACK_CUSTOMER_SUBSCRIPTIONS_UNAVAILABLE');
    if(response.data.subscriptions.length > 100) throw new Error('PAYSTACK_CUSTOMER_SUBSCRIPTIONS_REQUIRES_REVIEW');
    const matches: Array<{subscription_code:string;email_token?:string;next_payment_date?:string}> = [];
    for(const row of response.data.subscriptions){
      if(!row.subscription_code) throw new Error('PAYSTACK_SUBSCRIPTION_CODE_MISSING');
      const details = await this.fetchSubscription(row.subscription_code);
      if(details.customerCode !== customerCode) throw new Error('PAYSTACK_SUBSCRIPTION_CUSTOMER_MISMATCH');
      if(details.planCode === planCode) matches.push({subscription_code:details.subscriptionCode, email_token:details.emailToken, next_payment_date:details.nextPaymentAt});
    }
    if (matches.length > 1) throw new Error('PAYSTACK_DUPLICATE_RENEWALS');
    return matches[0];
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
