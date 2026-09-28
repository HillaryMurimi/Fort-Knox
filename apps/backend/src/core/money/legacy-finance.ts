import { AppError } from '../errors/AppError.js';

// Temporary boundary until authoritative finance records are migrated to currency-aware minor units.
export const LEGACY_FINANCE_CURRENCY = 'KES' as const;
export const LEGACY_FINANCE_COUNTRY = 'KE' as const;

export function assertMatchingCurrency(paymentCurrency: string, chargeCurrency: string): void {
  if (paymentCurrency.toUpperCase() !== chargeCurrency.toUpperCase()) {
    throw new AppError(409, 'ALLOCATION_CURRENCY_MISMATCH', 'Payment and rent charge currencies must match');
  }
}
