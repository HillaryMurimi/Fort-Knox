import { describe, expect, it } from 'vitest';
import { paymentInitiateSchema } from './integration.schemas.js';

describe('provider payment initiation validation',()=>{
  it('accepts the complete Paystack hosted checkout channel catalog',()=>{
    const channels=['card','bank','apple_pay','ussd','qr','mobile_money','bank_transfer','eft','capitec_pay','payattitude'] as const;
    expect(paymentInitiateSchema.parse({provider:'PAYSTACK',email:'tenant@example.com',paystackChannels:channels}).paystackChannels).toEqual(channels);
  });

  it('rejects unsupported channels and empty channel selections',()=>{
    expect(()=>paymentInitiateSchema.parse({provider:'PAYSTACK',email:'tenant@example.com',paystackChannels:[]})).toThrow();
    expect(()=>paymentInitiateSchema.parse({provider:'PAYSTACK',email:'tenant@example.com',paystackChannels:['crypto']})).toThrow();
  });
});
