export interface Money {
  minorUnits: number;
  currency: string;
}

export function currencyFractionDigits(currency: string): number {
  if (!/^[A-Za-z]{3}$/.test(currency)) throw new Error('INVALID_CURRENCY');
  try {
    const digits = new Intl.NumberFormat('en', { style: 'currency', currency: currency.toUpperCase() }).resolvedOptions().maximumFractionDigits;
    if (digits === undefined) throw new Error('INVALID_CURRENCY');
    return digits;
  } catch {
    throw new Error('INVALID_CURRENCY');
  }
}

export function moneyFromMajorUnits(amount: number, currency: string): Money {
  const normalizedCurrency = currency.toUpperCase();
  const factor = 10 ** currencyFractionDigits(normalizedCurrency);
  const scaled = amount * factor;
  const rounded = Math.round(scaled);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > 1e-7) {
    throw new Error('INVALID_MONEY_AMOUNT');
  }
  return { minorUnits: rounded, currency: normalizedCurrency };
}

export function addMoney(left: Money, right: Money): Money {
  if (left.currency !== right.currency) throw new Error('CURRENCY_MISMATCH');
  const minorUnits = left.minorUnits + right.minorUnits;
  if (!Number.isSafeInteger(left.minorUnits) || !Number.isSafeInteger(right.minorUnits) || !Number.isSafeInteger(minorUnits)) {
    throw new Error('INVALID_MONEY_AMOUNT');
  }
  return { minorUnits, currency: left.currency };
}
