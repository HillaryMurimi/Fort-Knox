import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { integrationConfig } from '../integrations/config.js';
import { PaystackBillingProvider } from './billing-provider.js';

describe('PaystackBillingProvider', () => {
  const original = { ...integrationConfig.paystack };
  beforeEach(() => {
    integrationConfig.paystack.secretKey = 'sk_test_pmcc';
    integrationConfig.paystack.baseUrl = 'https://api.paystack.test';
  });
  afterEach(() => { Object.assign(integrationConfig.paystack, original); vi.unstubAllGlobals(); });

  it('creates a card-backed recurring plan and returns a pending hosted checkout', async () => {
    const responses = [
      { customer_code: 'CUS_123' },
      { plan_code: 'PLN_123' },
      { reference: 'bill_123', authorization_url: 'https://checkout.paystack.com/abc' },
    ];
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ status: true, message: 'ok', data: responses.shift() }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new PaystackBillingProvider();
    const customer = await provider.createCustomer({ organizationId: 'org-1', name: 'Fort Knox', email: 'owner@example.com' });
    const checkout = await provider.createSubscription({ customerReference: customer.providerCustomerId, email: 'owner@example.com', organizationId: 'org-1', planKey: 'CONTROL', currency: 'KES', amount: 1500, interval: 'QUARTER' });
    expect(checkout).toMatchObject({ status: 'PENDING', checkoutReference: 'bill_123', providerPlanCode: 'PLN_123' });
    const planBody = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));
    expect(planBody).toMatchObject({ amount: 150000, currency: 'KES', interval: 'quarterly' });
    const transactionBody = JSON.parse(String((fetchMock.mock.calls[2] as [string, RequestInit])[1].body));
    expect(transactionBody).toMatchObject({ amount: '150000', plan: 'PLN_123', channels: ['card'] });
    expect(transactionBody).not.toHaveProperty('secret');
  });

  it('rejects an untrusted checkout URL', async () => {
    const responses = [{ plan_code: 'PLN_123' }, { reference: 'bill_123', authorization_url: 'https://other.example/checkout' }];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ status: true, message: 'ok', data: responses.shift() }), { status: 200 })));
    await expect(new PaystackBillingProvider().createSubscription({ customerReference: 'CUS_123', email: 'owner@example.com', organizationId: 'org-1', planKey: 'CONTROL', currency: 'KES', amount: 1500, interval: 'MONTH' })).rejects.toThrow('PAYSTACK_CHECKOUT_INVALID');
  });

  it('updates only the dedicated provider plan for existing renewals', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: true, message: 'Plan updated' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await new PaystackBillingProvider().updatePlan('PLN_org1', { planKey: 'FORT_KNOX', amount: 30000, currency: 'KES', interval: 'YEAR' });
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.paystack.test/plan/PLN_org1');
    expect(request.method).toBe('PUT');
    expect(JSON.parse(String(request.body))).toMatchObject({ amount: 3000000, currency: 'KES', interval: 'annually', update_existing_subscriptions: true });
  });

  it('reopens checkout on the existing plan without creating another plan', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: true, message: 'ok', data: { reference: 'retry_1', authorization_url: 'https://checkout.paystack.com/retry' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const retry = await new PaystackBillingProvider().retryCheckout('PLN_org1', { customerReference: 'CUS_org1', email: 'owner@example.com', organizationId: 'org1', planKey: 'CONTROL', currency: 'KES', amount: 1500, interval: 'MONTH' });
    expect(retry.checkoutReference).toBe('retry_1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.paystack.test/transaction/initialize');
    expect(JSON.parse(String(request.body))).toMatchObject({ plan: 'PLN_org1', amount: '150000', channels: ['card'] });
  });

  it('disables a subscription without expecting a data envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: true, message: 'Subscription disabled successfully' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new PaystackBillingProvider().cancelSubscription('SUB_123', 'private-token')).resolves.toBeUndefined();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.paystack.test/subscription/disable');
    expect(JSON.parse(String(request.body))).toEqual({ code: 'SUB_123', token: 'private-token' });
  });

  it('resolves subscription codes and private cancellation token from Paystack', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: true, message: 'ok', data: { subscription_code: 'SUB_123', email_token: 'private-token', customer: { customer_code: 'CUS_123' }, plan: { plan_code: 'PLN_123' } } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new PaystackBillingProvider().fetchSubscription('SUB_123')).resolves.toEqual({ subscriptionCode: 'SUB_123', customerCode: 'CUS_123', planCode: 'PLN_123', emailToken: 'private-token' });
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.paystack.test/subscription/SUB_123');
    expect(request.headers).toMatchObject({ authorization: 'Bearer sk_test_pmcc' });
  });
});
