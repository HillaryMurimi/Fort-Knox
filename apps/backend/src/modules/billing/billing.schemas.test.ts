import { describe, expect, it } from 'vitest';
import { createSubscriptionSchema } from './billing.schemas.js';

describe('createSubscriptionSchema', () => {
  it('defaults to Paystack and rejects legacy providers', () => {
    expect(createSubscriptionSchema.parse({ planKey: 'CONTROL' }).provider).toBe('PAYSTACK');
    expect(() => createSubscriptionSchema.parse({ planKey: 'CONTROL', provider: 'STRIPE' })).toThrow();
    expect(() => createSubscriptionSchema.parse({ planKey: 'CONTROL', provider: 'MPESA' })).toThrow();
  });
});
