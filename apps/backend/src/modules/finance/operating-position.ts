import { addMinorUnits, legacyMajorUnits } from '../../core/money/legacy-finance.js';

export function reportedOperatingPosition(billedIncomeMinor: number, operatingExpensesMinor: number, currency: string) {
  const marginMinor = addMinorUnits(billedIncomeMinor, -operatingExpensesMinor);
  return {
    basis: 'BILLED_INCOME_LESS_RECORDED_OPEX' as const,
    billedIncomeMinor,
    operatingExpensesMinor,
    reportedOperatingMarginMinor: marginMinor,
    reportedOperatingMargin: legacyMajorUnits(marginMinor, currency),
    operatingExpenseRatio: billedIncomeMinor > 0 ? Number((operatingExpensesMinor / billedIncomeMinor * 100).toFixed(2)) : null,
    cashFlow: null,
    currency,
  };
}
