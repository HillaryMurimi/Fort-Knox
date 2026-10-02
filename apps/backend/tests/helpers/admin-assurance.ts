import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { vi } from 'vitest';
import { env } from '../../src/config/env.js';
import { User } from '../../src/database/models/User.js';
import { RefreshSession } from '../../src/database/models/RefreshSession.js';
import { contactsHash } from '../../src/modules/auth/admin-security.js';
// Trusted completed-session fixtures for unrelated domain tests. Actual MFA
// is exercised through HTTP and random delivery capture in admin-auth E2E.
export function mockAdminAssurance(userId: Types.ObjectId) {
  const sid = new Types.ObjectId(), now = new Date(), email = 'assurance@example.test', phone = '+254700009900';
  vi.spyOn(User, 'findById').mockReturnValue({ select() { return this; }, lean: async () => ({ _id: userId, status: 'ACTIVE', isPlatformAdmin: true,
    email, phone, emailVerifiedAt: now, phoneVerifiedAt: now, mfaContactsHash: contactsHash(email, phone), authVersion: 0 }) } as never);
  vi.spyOn(RefreshSession, 'findOneAndUpdate').mockResolvedValue({ _id: sid, mfaVerifiedAt: now } as never);
  return jwt.sign({ sub: String(userId), sid: String(sid), privileged: true, type: 'access' }, env.JWT_ACCESS_SECRET);
}
export async function completedAdminFixture(userId: Types.ObjectId) {
  const user = await User.findById(userId);
  if (!user?.email) throw new Error('Administrator fixture requires destinations');
  const now = new Date(), hash = contactsHash(user.email, user.phone), sid = new Types.ObjectId();
  await User.updateOne({ _id: userId }, { $set: { emailVerifiedAt: now, phoneVerifiedAt: now, mfaContactsHash: hash, authVersion: 0 } });
  await RefreshSession.create({ _id: sid, userId, tokenHash: String(new Types.ObjectId()), privileged: true, authVersion: 0,
    contactsHash: hash, passwordVerifiedAt: now, emailVerifiedAt: now, smsVerifiedAt: now, mfaVerifiedAt: now, lastActivityAt: now,
    expiresAt: new Date(Date.now() + env.ADMIN_SESSION_SECONDS * 1000), absoluteExpiresAt: new Date(Date.now() + env.ADMIN_SESSION_SECONDS * 1000) });
  return jwt.sign({ sub: String(userId), sid: String(sid), privileged: true, type: 'access' }, env.JWT_ACCESS_SECRET, { expiresIn: '5m' });
}
