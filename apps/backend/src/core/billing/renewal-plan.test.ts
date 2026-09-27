import { describe, expect, it } from 'vitest';
import { choosePaidRenewalPlan } from './renewal-plan.js';

const current = { key: 'CONTROL', amount: 30000, currency: 'KES' };
const pending = { key: 'FORT_KNOX', amount: 45000, currency: 'KES' };

describe('choosePaidRenewalPlan', () => {
  it('keeps current entitlements when the provider still charged the old plan', () => {
    expect(choosePaidRenewalPlan(current, pending, 3000000, 'KES')).toEqual({ plan: current, applyPending: false });
  });
  it('applies a queued plan only for the matching paid renewal', () => {
    expect(choosePaidRenewalPlan(current, pending, 4500000, 'KES')).toEqual({ plan: pending, applyPending: true });
  });
  it('rejects mismatched amount and currency', () => {
    expect(() => choosePaidRenewalPlan(current, pending, 4500000, 'USD')).toThrowError(/Renewal charge/);
    expect(() => choosePaidRenewalPlan(current, null, 1, 'KES')).toThrowError(/Renewal charge/);
  });
});
