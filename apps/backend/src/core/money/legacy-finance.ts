import { AppError } from '../errors/AppError.js';
import { currencyFractionDigits, moneyFromMajorUnits } from './money.js';

// Temporary boundary until authoritative finance records are migrated to currency-aware minor units.
export const LEGACY_FINANCE_CURRENCY = 'KES' as const;
export const LEGACY_FINANCE_COUNTRY = 'KE' as const;

export function assertMatchingCurrency(paymentCurrency: string, chargeCurrency: string): void {
  if (paymentCurrency.toUpperCase() !== chargeCurrency.toUpperCase()) {
    throw new AppError(409, 'ALLOCATION_CURRENCY_MISMATCH', 'Payment and rent charge currencies must match');
  }
}

export function legacyMinorUnits(amount: number, currency: string): number {
  try { return moneyFromMajorUnits(amount, currency).minorUnits; }
  catch { throw new AppError(409, 'INVALID_FINANCIAL_AMOUNT', 'Amount is not representable in currency minor units'); }
}

export function isLegacyKesAmount(amount: number): boolean {
  try { moneyFromMajorUnits(amount, LEGACY_FINANCE_CURRENCY); return true; }
  catch { return false; }
}

export function legacyMajorUnits(minorUnits: number, currency: string): number {
  if (!Number.isSafeInteger(minorUnits)) throw new AppError(409, 'INVALID_FINANCIAL_AMOUNT', 'Minor-unit total is outside the safe integer range');
  return minorUnits / (10 ** currencyFractionDigits(currency));
}

export function addMinorUnits(left: number, right: number): number {
  const total = left + right;
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || !Number.isSafeInteger(total)) {
    throw new AppError(409, 'INVALID_FINANCIAL_AMOUNT', 'Minor-unit total is outside the safe integer range');
  }
  return total;
}
