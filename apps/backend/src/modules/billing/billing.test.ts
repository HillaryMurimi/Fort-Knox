import { describe, expect, it } from 'vitest';
import { createPlanSchema, createSubscriptionSchema } from './billing.schemas.js';

describe('billing schemas', () => {
  it('accepts a valid plan', () => {
    const result = createPlanSchema.parse({ key:'PRO', name:'Professional', amount:30000, billingInterval:'MONTH', entitlements:{maxProperties:25,maxUnits:750,maxUsers:25,maxTenants:750,features:['finance']} });
    expect(result.currency).toBe('KES');
    expect(result.trialDays).toBe(0);
  });
  it('rejects invalid plan keys', () => { expect(() => createPlanSchema.parse({ key:'bad-key', name:'Bad', amount:1, billingInterval:'MONTH', entitlements:{maxProperties:1,maxUnits:1,maxUsers:1,maxTenants:1,features:[]} })).toThrow(); });
  it('defaults internal billing provider', () => { expect(createSubscriptionSchema.parse({planKey:'PROFESSIONAL'}).provider).toBe('INTERNAL'); });
});
