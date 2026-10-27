import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { reportedOperatingPosition } from '../../src/modules/finance/operating-position.js';
import { expensePaymentSchema, expenseSchema } from '../../src/modules/finance/finance.schemas.js';

describe('reported operating position', () => {
  it('subtracts only selected operating expenses using integer minor units', () => {
    expect(reportedOperatingPosition(50_000_000, 15_000_000, 'KES')).toEqual({
      basis: 'BILLED_INCOME_LESS_RECORDED_OPEX', billedIncomeMinor: 50_000_000,
      operatingExpensesMinor: 15_000_000, reportedOperatingMarginMinor: 35_000_000,
      reportedOperatingMargin: 350_000, operatingExpenseRatio: 30,
      cashFlow: null, currency: 'KES',
    });
  });

  it('does not invent an expense ratio when billed income is zero', () => {
    const result = reportedOperatingPosition(0, 2_000, 'KES');
    expect(result.reportedOperatingMarginMinor).toBe(-2_000);
    expect(result.operatingExpenseRatio).toBeNull();
    expect(result.cashFlow).toBeNull();
  });

  it('requires explicit classification and valid service periods on new expenses', () => {
    const expense = { propertyId: String(new Types.ObjectId()), category: 'MAINTENANCE', description: 'Pump repair', amount: 1200, incurredAt: '2026-09-01' };
    expect(expenseSchema.safeParse(expense).success).toBe(false);
    expect(expenseSchema.safeParse({ ...expense, classification: 'CAPEX' }).success).toBe(true);
    expect(expenseSchema.safeParse({ ...expense, classification: 'OPEX', servicePeriodStart: '2026-09-01' }).success).toBe(false);
  });

  it('requires payment date and basis rather than inferring payment from approval', () => {
    expect(expensePaymentSchema.safeParse({}).success).toBe(false);
    expect(expensePaymentSchema.safeParse({ paidAt: '2026-09-01', paymentBasis: 'Bank statement checked' }).success).toBe(true);
  });
});
