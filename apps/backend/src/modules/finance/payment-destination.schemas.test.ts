import { describe, expect, it } from 'vitest';
import { paymentDestinationSchema } from './finance.schemas.js';

describe('payment destination validation',()=>{
  it('accepts Paystack, M-Pesa, and crypto onboarding destinations',()=>{
    expect(paymentDestinationSchema.parse({provider:'PAYSTACK',label:'Rent bank',businessName:'Dapini Homes',bankCode:'001',accountNumber:'1234567890'}).currency).toBe('KES');
    expect(paymentDestinationSchema.parse({provider:'MPESA',label:'Rent paybill',shortCode:'123456'}).currency).toBe('KES');
    expect(paymentDestinationSchema.parse({provider:'CRYPTO',label:'USDC treasury',asset:'USDC',network:'BASE',walletAddress:'0x1234567890123456789012345678901234567890'}).currency).toBe('USDC');
  });

  it('rejects malformed settlement details',()=>{
    expect(()=>paymentDestinationSchema.parse({provider:'PAYSTACK',label:'Bank',businessName:'Dapini',bankCode:'001',accountNumber:'not-a-bank-account'})).toThrow();
    expect(()=>paymentDestinationSchema.parse({provider:'MPESA',label:'Till',shortCode:'12'})).toThrow();
    expect(()=>paymentDestinationSchema.parse({provider:'CRYPTO',label:'Wallet',asset:'DOGE',network:'BASE',walletAddress:'short'})).toThrow();
  });
});
