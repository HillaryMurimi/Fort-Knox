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
});
