import { describe, expect, it } from 'vitest';
import { loginSchema, bootstrapLandlordSchema } from '../../src/modules/auth/auth.schemas.js';

describe('authentication identity contracts', () => {
  it('accepts the two supported login methods', () => {
    expect(loginSchema.parse({ method: 'email', email: 'owner@example.com', password: 'long-secure-password' }).method).toBe('email');
    expect(loginSchema.parse({ method: 'phone', phone: '+254700000000' }).method).toBe('phone');
  });
  it('requires organization owner bootstrap credentials', () => {
    expect(bootstrapLandlordSchema.safeParse({ firstName: 'A', lastName: 'B', email: 'owner@example.com', phone: '+254700000000', password: 'long-secure-password', organization: { name: 'Acme Estates' } }).success).toBe(true);
  });
});
