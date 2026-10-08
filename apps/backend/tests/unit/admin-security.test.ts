import { Types } from 'mongoose';
import { describe, it, expect } from 'vitest';
import { env } from '../../src/config/env.js';
import { adminOtpDigest, contactsHash, maskEmail, maskPhone, assertFreshAdmin, assertAuthOrigin } from '../../src/modules/auth/admin-security.js';
describe('SUPER_ADMIN security primitives', () => {
  it('masks registered destinations', () => { expect(maskEmail('security@example.test')).toBe('s***@example.test'); expect(maskPhone('+254700123456')).toBe('+254 *** *** **'); });
  it('binds OTP digests to flow and independent channel', () => { const first = adminOtpDigest('flow-a', 'EMAIL', '000000'); expect(first).not.toBe(adminOtpDigest('flow-a', 'SMS', '000000')); expect(first).not.toBe(adminOtpDigest('flow-b', 'EMAIL', '000000')); });
  it('normalizes the authoritative contact snapshot', () => { expect(contactsHash(' ADMIN@example.test ', '+254 700 000 001')).toBe(contactsHash('admin@example.test', '+254700000001')); });
  it('requires fresh server-side assurance for sensitive actions', () => {
    const auth = { userId: new Types.ObjectId(), isPlatformAdmin: true, memberships: [] };
    expect(() => assertFreshAdmin(auth)).toThrow('Verify your password');
    expect(() => assertFreshAdmin({ ...auth, sessionId: new Types.ObjectId(), mfaVerifiedAt: new Date(), adminDualChannel: true })).not.toThrow();
    expect(() => assertFreshAdmin({ ...auth, sessionId: new Types.ObjectId(), mfaVerifiedAt: new Date(0), adminDualChannel: true })).toThrow();
    expect(() => assertFreshAdmin({ ...auth, sessionId: new Types.ObjectId(), mfaVerifiedAt: new Date(), adminDualChannel: false })).toThrow();
  });
  it('rejects organization roles independent of their frontend labels', () => { expect(() => assertFreshAdmin({ userId: new Types.ObjectId(), isPlatformAdmin: false, memberships: [] })).toThrow('Platform administrator'); });
  it('requires configured Origin and the custom authentication header', () => {
    expect(() => assertAuthOrigin(env.WEB_ORIGIN, '1')).not.toThrow();
    expect(() => assertAuthOrigin('https://foreign.example.test', '1')).toThrow();
    expect(() => assertAuthOrigin(env.WEB_ORIGIN, undefined)).toThrow();
  });
});
