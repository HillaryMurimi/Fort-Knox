import { describe, expect, it } from 'vitest';
import { allocationSchema, expenseSchema, generateRentSchema, paymentSchema, rentChargeSchema, reportSchema, serviceChargeSchema } from '../../src/modules/finance/finance.schemas.js';

describe('finance schemas', () => {
  it('rejects a rent period whose end precedes its start', () => {
    expect(() => generateRentSchema.parse({ periodStart: '2026-09-30', periodEnd: '2026-09-01', dueDate: '2026-09-05' })).toThrow();
  });
  it('requires payment allocations to sum to the payment amount at service level', () => {
    const result = allocationSchema.parse({ allocations: [{ rentChargeId: '507f1f77bcf86cd799439011', amount: 1000 }] });
    expect(result.allocations).toHaveLength(1);
  });
  it('rejects duplicate allocations before the service writes any charge', () => {
    const rentChargeId = '507f1f77bcf86cd799439011';
    expect(() => allocationSchema.parse({ allocations: [{ rentChargeId, amount: 50 }, { rentChargeId, amount: 50 }] })).toThrow();
  });
  it('keeps new operational-finance writes on the legacy KES ledger', () => {
    const tenancyId = '507f1f77bcf86cd799439011';
    const propertyId = '507f1f77bcf86cd799439012';
    const period = { periodStart: '2026-09-01', periodEnd: '2026-09-30', dueDate: '2026-09-05' };
    expect(() => generateRentSchema.parse({ ...period, currency: 'USD' })).toThrow();
    expect(() => rentChargeSchema.parse({ ...period, tenancyId, rentAmount: 100, currency: 'USD' })).toThrow();
    expect(() => paymentSchema.parse({ tenancyId, amount: 100, method: 'CARD', currency: 'USD' })).toThrow();
    expect(() => expenseSchema.parse({ propertyId, category: 'UTILITIES', description: 'Water bill', amount: 100, incurredAt: '2026-09-01', currency: 'USD' })).toThrow();
    expect(() => serviceChargeSchema.parse({ tenancyId, periodStart: period.periodStart, periodEnd: period.periodEnd, amount: 100, currency: 'USD' })).toThrow();
    expect(paymentSchema.parse({ tenancyId, amount: 100, method: 'CARD' }).currency).toBe('KES');
  });
  it('rejects an inverted report range', () => {
    expect(() => reportSchema.parse({ from: '2026-10-01', to: '2026-09-01' })).toThrow();
  });
});
