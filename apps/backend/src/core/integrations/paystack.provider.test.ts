import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { integrationConfig } from './config.js';
import { PaystackProvider, toPaystackMinorUnits } from './paystack.provider.js';

describe('PaystackProvider', () => {
  const original = { ...integrationConfig.paystack };

  beforeEach(() => {
    integrationConfig.paystack.enabled = true;
    integrationConfig.paystack.baseUrl = 'https://api.paystack.test';
    integrationConfig.paystack.secretKey = 'sk_test_pmcc';
    integrationConfig.paystack.callbackUrl = 'https://pmcc.test/payments/callback';
  });

  afterEach(() => {
    Object.assign(integrationConfig.paystack, original);
    vi.unstubAllGlobals();
  });

  it('initializes a transaction in currency minor units without exposing the secret', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: true,
          message: 'Authorization URL created',
          data: {
            authorization_url: 'https://checkout.paystack.test/abc',
            access_code: 'abc',
            reference: 'pmcc-payment-1',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new PaystackProvider().initiate({
      organizationId: 'org-1',
      paymentId: 'payment-1',
      amount: 30_000.5,
      currency: 'KES',
      email: 'tenant@example.com',
      reference: 'pmcc-payment-1',
      paystackChannels: ['card', 'mobile_money', 'bank_transfer'],
      paystackSubaccountCode: 'ACCT_landlord',
    });

    expect(result).toMatchObject({
      provider: 'PAYSTACK',
      providerTransactionId: 'pmcc-payment-1',
      status: 'PENDING',
      checkoutUrl: 'https://checkout.paystack.test/abc',
      accessCode: 'abc',
    });
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request.headers).toMatchObject({ authorization: 'Bearer sk_test_pmcc' });
    expect(JSON.parse(String(request.body))).toMatchObject({
      amount: '3000050',
      currency: 'KES',
      email: 'tenant@example.com',
      reference: 'pmcc-payment-1',
      channels: ['card', 'mobile_money', 'bank_transfer'],
      subaccount: 'ACCT_landlord',
    });
    expect(JSON.stringify(request.body)).not.toContain('sk_test_pmcc');
  });

  it('creates a Paystack settlement subaccount without returning the API secret', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status:true,message:'Subaccount created',data:{subaccount_code:'ACCT_landlord',business_name:'Dapini Homes',account_name:'Dapini Homes Ltd',account_number:'1234567890',settlement_bank:'Test Bank',currency:'KES',active:true,is_verified:true},
    }),{status:201,headers:{'content-type':'application/json'}}));
    vi.stubGlobal('fetch',fetchMock);
    const result=await new PaystackProvider().createSubaccount({businessName:'Dapini Homes',bankCode:'001',accountNumber:'1234567890'});
    expect(result.subaccount_code).toBe('ACCT_landlord');
    const [url,request]=fetchMock.mock.calls[0] as [string,RequestInit];
    expect(url).toBe('https://api.paystack.test/subaccount');
    expect(JSON.parse(String(request.body))).toMatchObject({business_name:'Dapini Homes',settlement_bank:'001',account_number:'1234567890',percentage_charge:0});
    expect(JSON.stringify(result)).not.toContain('sk_test_pmcc');
  });

  it('normalizes a verified successful transaction with amount and currency evidence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: true,
            message: 'Verification successful',
            data: {
              id: 4099260516,
              status: 'success',
              reference: 'pmcc-payment-1',
              amount: 3000000,
              currency: 'KES',
              paid_at: '2026-09-20T10:00:00.000Z',
              gateway_response: 'Successful',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    await expect(new PaystackProvider().query('pmcc-payment-1')).resolves.toMatchObject({
      providerTransactionId: 'pmcc-payment-1',
      status: 'CONFIRMED',
      amountMinorUnits: 3000000,
      currency: 'KES',
      paidAt: new Date('2026-09-20T10:00:00.000Z'),
    });
  });

  it('requires an email and rejects invalid amounts before calling Paystack', async () => {
    const provider = new PaystackProvider();
    await expect(
      provider.initiate({
        organizationId: 'org-1',
        amount: 100,
        currency: 'KES',
        reference: 'pmcc-payment-1',
      }),
    ).rejects.toThrow('PAYSTACK_EMAIL_REQUIRED');
    expect(() => toPaystackMinorUnits(Number.NaN)).toThrow('PAYSTACK_INVALID_AMOUNT');
  });
});
