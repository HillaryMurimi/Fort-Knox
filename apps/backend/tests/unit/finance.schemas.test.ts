import { describe, expect, it } from 'vitest';
import { allocationSchema, generateRentSchema, reportSchema } from '../../src/modules/finance/finance.schemas.js';

describe('finance schemas', () => {
  it('rejects a rent period whose end precedes its start', () => {
    expect(() => generateRentSchema.parse({ periodStart: '2026-09-30', periodEnd: '2026-09-01', dueDate: '2026-09-05' })).toThrow();
  });
  it('requires payment allocations to sum to the payment amount at service level', () => {
    const result = allocationSchema.parse({ allocations: [{ rentChargeId: '507f1f77bcf86cd799439011', amount: 1000 }] });
    expect(result.allocations).toHaveLength(1);
  });
  it('rejects an inverted report range', () => {
    expect(() => reportSchema.parse({ from: '2026-10-01', to: '2026-09-01' })).toThrow();
  });
});
