import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID, createHash, randomInt } from 'node:crypto';
import { Types } from 'mongoose';
import { User } from '../../database/models/User.js';
import { OrganizationMembership } from '../../database/models/OrganizationMembership.js';
import { OtpChallenge } from '../../database/models/OtpChallenge.js';
import { RefreshSession } from '../../database/models/RefreshSession.js';
import { Role } from '../../database/models/Role.js';
import { Organization } from '../../database/models/Organization.js';
import { AppError } from '../../core/errors/AppError.js';
import { env } from '../../config/env.js';
import type { SystemRoleKey } from '../../core/types/auth.js';
import { getSmsProvider } from '../../core/integrations/messaging-providers.js';

export const normalizePhone = (phone: string): string => phone.replace(/[\s()-]/g, '');
const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

function signAccessToken(userId: string, activeOrganizationId?: string) {
  return jwt.sign({ sub: userId, activeOrganizationId, type: 'access' }, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
}

function signRefreshToken(userId: string, sessionId: string) {
  return jwt.sign({ sub: userId, sid: sessionId, type: 'refresh' }, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
}

async function getIdentity(userId: Types.ObjectId) {
  const user = await User.findById(userId).lean();
  if (!user || user.status !== 'ACTIVE') throw new AppError(401, 'ACCOUNT_INACTIVE', 'Account is inactive');
  const memberships = await OrganizationMembership.find({ userId, status: 'ACTIVE' }).lean();
  const roleIds = memberships.flatMap((m) => m.roleIds);
  const roles = await Role.find({ _id: { $in: roleIds } }).lean();
  const membershipData = memberships.map((m) => {
    const rs = roles.filter((r) => m.roleIds.some((id) => String(id) === String(r._id)));
    return {
      organizationId: m.organizationId,
      roles: rs.map((r) => r.key as SystemRoleKey),
      roleIds: m.roleIds,
      permissions: [...new Set(rs.flatMap((r) => r.permissions))],
      scope: { allProperties: !!m.scope?.allProperties, propertyIds: m.scope?.propertyIds ?? [], buildingIds: m.scope?.buildingIds ?? [], unitIds: m.scope?.unitIds ?? [] },
    };
  });
  const allRoles = [...new Set([...(user.isPlatformAdmin ? ['SUPER_ADMIN' as SystemRoleKey] : []), ...membershipData.flatMap((m) => m.roles)])];
  return { user, memberships: membershipData, roles: allRoles };
}

export async function issueSession(userId: Types.ObjectId, meta?: { userAgent?: string; ipAddress?: string }) {
  const identity = await getIdentity(userId);
  if (!identity.user.isPlatformAdmin && identity.memberships.length === 0) throw new AppError(403, 'NO_ORGANIZATION_ACCESS', 'User has no active organization membership');
  const activeOrganizationId = identity.memberships[0]?.organizationId?.toString();
  const sessionId = new Types.ObjectId();
  const refreshToken = signRefreshToken(userId.toString(), sessionId.toString());
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await RefreshSession.create({ _id: sessionId, userId, tokenHash: hashToken(refreshToken), expiresAt, ...(meta?.userAgent ? { userAgent: meta.userAgent } : {}), ...(meta?.ipAddress ? { ipAddress: meta.ipAddress } : {}) });
  return { accessToken: signAccessToken(userId.toString(), activeOrganizationId), refreshToken, user: identity.user, roles: identity.roles, memberships: identity.memberships, expiresAt };
}

export async function requestOtp(phoneInput: string, purpose: 'LOGIN' | 'ONBOARDING' | 'STEP_UP') {
  const phone = normalizePhone(phoneInput);
  const code = env.NODE_ENV === 'development' || env.NODE_ENV === 'test' ? '123456' : String(randomInt(100000, 1_000_000));
  const codeHash = await bcrypt.hash(code, 10);
  await OtpChallenge.deleteMany({ phone, purpose, consumedAt: { $exists: false } });
  await OtpChallenge.create({ phone, codeHash, purpose, expiresAt: new Date(Date.now() + env.OTP_TTL_SECONDS * 1000) });
  if (env.NODE_ENV === 'production') {
    await getSmsProvider().send({
      to: phone,
      body: `Your Property Command Center verification code is ${code}. It expires in ${Math.ceil(env.OTP_TTL_SECONDS / 60)} minutes. Do not share this code.`,
    });
  }
  return { phone, expiresIn: env.OTP_TTL_SECONDS, ...(env.NODE_ENV !== 'production' ? { developmentCode: code } : {}) };
}

export async function loginByPhone(phoneInput: string) {
  const phone = normalizePhone(phoneInput);
  const user = await User.findOne({ phone, status: 'ACTIVE' }).lean();
  if (!user) throw new AppError(403, 'USER_NOT_PROVISIONED', 'This phone number is not provisioned for access');
  const identity = await getIdentity(user._id);
  const fieldRoles: SystemRoleKey[] = ['PROPERTY_MANAGER', 'CARETAKER', 'CONTRACTOR', 'TENANT'];
  if (!identity.roles.some((role) => fieldRoles.includes(role))) throw new AppError(400, 'WRONG_LOGIN_METHOD', 'This account must use email and password');
  return requestOtp(phone, 'LOGIN');
}

export async function loginByEmail(emailInput: string, password: string) {
  const email = emailInput.trim().toLowerCase();
  const user = await User.findOne({ email, status: 'ACTIVE' }).select('+passwordHash').exec();
  if (!user?.passwordHash) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  const identity = await getIdentity(user._id);
  const adminRoles: SystemRoleKey[] = ['SUPER_ADMIN', 'LANDLORD'];
  if (!identity.roles.some((role) => adminRoles.includes(role)) && !user.isPlatformAdmin) throw new AppError(400, 'WRONG_LOGIN_METHOD', 'This account must use phone OTP');
  const otp = await requestOtp(user.phone, 'STEP_UP');
  return { stepUpRequired: true, challenge: otp, user: identity.user };
}

export async function verifyLoginOtp(phoneInput: string, code: string, meta?: { userAgent?: string; ipAddress?: string }) {
  const phone = normalizePhone(phoneInput);
  const challenge = await OtpChallenge.findOne({ phone, purpose: 'LOGIN', consumedAt: { $exists: false }, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  if (!challenge) throw new AppError(401, 'OTP_INVALID', 'The OTP is invalid or expired');
  if (challenge.attempts >= env.OTP_MAX_ATTEMPTS) throw new AppError(429, 'OTP_LOCKED', 'Too many OTP attempts');
  challenge.attempts += 1;
  if (!(await bcrypt.compare(code, challenge.codeHash))) { await challenge.save(); throw new AppError(401, 'OTP_INVALID', 'The OTP is invalid or expired'); }
  challenge.consumedAt = new Date(); await challenge.save();
  const user = await User.findOne({ phone, status: 'ACTIVE' });
  if (!user) throw new AppError(403, 'USER_NOT_PROVISIONED', 'This phone number is not provisioned for access');
  user.lastLoginAt = new Date(); user.verifiedAt ??= new Date(); await user.save();
  return issueSession(user._id, meta);
}

export async function verifyStepUp(emailInput: string, code: string, meta?: { userAgent?: string; ipAddress?: string }) {
  const email = emailInput.trim().toLowerCase();
  const user = await User.findOne({ email, status: 'ACTIVE' });
  if (!user) throw new AppError(401, 'OTP_INVALID', 'The OTP is invalid or expired');
  const challenge = await OtpChallenge.findOne({ phone: user.phone, purpose: 'STEP_UP', consumedAt: { $exists: false }, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  if (!challenge) throw new AppError(401, 'OTP_INVALID', 'The OTP is invalid or expired');
  if (challenge.attempts >= env.OTP_MAX_ATTEMPTS) throw new AppError(429, 'OTP_LOCKED', 'Too many OTP attempts');
  challenge.attempts += 1;
  if (!(await bcrypt.compare(code, challenge.codeHash))) { await challenge.save(); throw new AppError(401, 'OTP_INVALID', 'The OTP is invalid or expired'); }
  challenge.consumedAt = new Date(); await challenge.save();
  user.lastLoginAt = new Date(); user.verifiedAt ??= new Date(); await user.save();
  return issueSession(user._id, meta);
}

export async function refreshSession(refreshToken: string, meta?: { userAgent?: string; ipAddress?: string }) {
  let payload: jwt.JwtPayload;
  try { payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as jwt.JwtPayload; } catch { throw new AppError(401, 'REFRESH_TOKEN_INVALID', 'Refresh token is invalid or expired'); }
  if (payload.type !== 'refresh' || typeof payload.sub !== 'string' || typeof payload.sid !== 'string') throw new AppError(401, 'REFRESH_TOKEN_INVALID', 'Refresh token is invalid');
  const session = await RefreshSession.findOne({ _id: payload.sid, tokenHash: hashToken(refreshToken), revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
  if (!session) throw new AppError(401, 'REFRESH_TOKEN_REVOKED', 'Refresh session is no longer valid');
  const next = await issueSession(new Types.ObjectId(payload.sub), meta);
  const nextPayload = jwt.decode(next.refreshToken) as jwt.JwtPayload;
  session.revokedAt = new Date();
  if (typeof nextPayload?.sid === 'string' && Types.ObjectId.isValid(nextPayload.sid)) session.replacedBySessionId = new Types.ObjectId(nextPayload.sid);
  await session.save();
  return next;
}

export async function revokeRefreshSession(refreshToken: string) {
  await RefreshSession.updateOne({ tokenHash: hashToken(refreshToken), revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
}

export async function bootstrapLandlord(data: { firstName: string; lastName: string; email: string; phone: string; password: string; organization: { name: string; slug?: string } }) {
  const email = data.email.trim().toLowerCase();
  const phone = normalizePhone(data.phone);
  if (await User.exists({ $or: [{ email }, { phone }] })) throw new AppError(409, 'USER_EXISTS', 'An account already exists for this email or phone number');
  let slug = data.organization.slug ?? data.organization.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  if (!slug) slug = `organization-${randomUUID().slice(0, 8)}`;
  if (await Organization.exists({ slug })) throw new AppError(409, 'ORGANIZATION_EXISTS', 'An organization with this slug already exists');
  const role = await Role.findOne({ key: 'LANDLORD', system: true, organizationId: null });
  if (!role) throw new AppError(500, 'SYSTEM_ROLE_MISSING', 'LANDLORD system role is not configured');
  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await User.create({ phone, email, firstName: data.firstName, lastName: data.lastName, passwordHash, verifiedAt: new Date() });
  try {
    const organization = await Organization.create({ name: data.organization.name, slug });
    await OrganizationMembership.create({ userId: user._id, organizationId: organization._id, roleIds: [role._id], scope: { allProperties: true, propertyIds: [], buildingIds: [], unitIds: [] }, joinedAt: new Date() });
    return { userId: user._id, organizationId: organization._id, organization, message: 'Landlord account and organization created. You can now sign in with email and password.' };
  } catch (error) {
    await User.deleteOne({ _id: user._id });
    throw error;
  }
}
