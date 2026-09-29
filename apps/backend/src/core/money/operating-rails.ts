import { AppError } from '../errors/AppError.js';

export type OperatingProvider = 'MPESA' | 'PAYSTACK';
export interface OperatingRegion {
  countryCode?: string;
  baseCurrency?: string;
  allowedCurrencies?: string[];
}

// Checkout is limited to this verified ledger/merchant market until the
// minor-unit storage and per-market settlement cutover is complete.
const OPERATING_RAILS: Readonly<Record<string, Readonly<Record<string, readonly OperatingProvider[]>>>> = {
  KE: { KES: ['MPESA', 'PAYSTACK'] },
};

export function assertOperatingRail(region: OperatingRegion | null | undefined, currency: string, provider: OperatingProvider): void {
  const country = (region?.countryCode ?? 'KE').toUpperCase();
  const baseCurrency = (region?.baseCurrency ?? 'KES').toUpperCase();
  const paymentCurrency = currency.toUpperCase();
  const allowed = region?.allowedCurrencies ?? [baseCurrency];
  if (baseCurrency !== paymentCurrency || !allowed.includes(paymentCurrency) || !OPERATING_RAILS[country]?.[paymentCurrency]?.includes(provider)) {
    throw new AppError(409, 'PAYMENT_RAIL_UNAVAILABLE', 'Payment rail is not available for this organization and currency');
  }
}
