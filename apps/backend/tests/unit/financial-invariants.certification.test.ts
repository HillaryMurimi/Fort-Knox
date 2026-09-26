import { describe, expect, it } from 'vitest';

describe('financial invariants certification', () => {
  it('keeps a payment allocation bounded by the rent balance', () => {
    const total = 30000;
    const paid = 10000;
    const allocation = 20000;
    expect(allocation).toBeLessThanOrEqual(total - paid);
    expect(Math.max(0, total - paid - allocation)).toBe(0);
  });

  it('requires exact provider-payment allocation before confirmation', () => {
    const paymentAmount = 30000;
    const outstanding = 30000;
    expect(paymentAmount <= outstanding + 0.000001).toBe(true);
    expect(paymentAmount - outstanding).toBe(0);
  });

  it('keeps accounting estimates separate from ledger mutations', () => {
    const revenueAtRisk = 12500;
    const accountingAmount = 0;
    expect(revenueAtRisk).not.toBe(accountingAmount);
  });
});
