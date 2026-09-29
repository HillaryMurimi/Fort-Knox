import { describe, expect, it } from 'vitest';
import { assertOperatingRail } from './operating-rails.js';

describe('operating rail policy', () => {
  it('allows the existing KE/KES rails, including legacy regional defaults', () => {
    expect(() => assertOperatingRail(undefined, 'KES', 'MPESA')).not.toThrow();
    expect(() => assertOperatingRail({ countryCode: 'KE', baseCurrency: 'KES', allowedCurrencies: ['KES'] }, 'KES', 'PAYSTACK')).not.toThrow();
  });

  it('fails closed for a currency or country without a completed ledger and merchant configuration', () => {
    expect(() => assertOperatingRail({ countryCode: 'GH', baseCurrency: 'GHS', allowedCurrencies: ['GHS'] }, 'GHS', 'PAYSTACK')).toThrow('Payment rail is not available');
    expect(() => assertOperatingRail({ countryCode: 'KE', baseCurrency: 'KES', allowedCurrencies: ['KES', 'USD'] }, 'USD', 'PAYSTACK')).toThrow('Payment rail is not available');
    expect(() => assertOperatingRail({ countryCode: 'KE', baseCurrency: 'KES', allowedCurrencies: [] }, 'KES', 'MPESA')).toThrow('Payment rail is not available');
  });
});
