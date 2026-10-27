import { describe, expect, it } from 'vitest';
import { normalizeFinancialReport } from './finance';

describe('finance report presentation', () => {
  it('maps live nested API totals and keeps confirmation sources distinct', () => {
    const report = normalizeFinancialReport({
      revenue: { rentBilled: 100, serviceChargesBilled: 0, totalBilled: 100, totalCollected: 70,
        providerConfirmed: 40, manualAcknowledged: 20, legacyUnclassified: 10, collectionRate: 70, outstanding: 30 },
      expenses: { total: 5, byCategory: [{ _id: 'UTILITIES', amount: 5 }] },
      profitAndLoss: { accrual: 95, cash: 65 }, arrears: { amount: 30, chargeCount: 1 },
      serviceCharges: { assessed: 0 }, occupancy: { activeTenancies: 1 }, payments: { count: 3 },
    });
    expect(report).toMatchObject({ totalCollected: 70, providerConfirmed: 40, manualAcknowledged: 20,
      legacyUnclassified: 10, totalExpenses: 5, expensesByCategory: { UTILITIES: 5 }, cashPnl: 65 });
  });
});
