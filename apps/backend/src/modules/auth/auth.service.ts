import { PRODUCT_NAME } from '../../config/brand.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID, createHash, randomInt } from 'node:crypto';
import mongoose, { Types, type ClientSession } from 'mongoose';
import { User } from '../../database/models/User.js';
import { OrganizationMembership } from '../../database/models/OrganizationMembership.js';
import { OtpChallenge } from '../../database/models/OtpChallenge.js';
import { RefreshSession } from '../../database/models/RefreshSession.js';
import { Role } from '../../database/models/Role.js';
import { Organization } from '../../database/models/Organization.js';
import { AppError } from '../../core/errors/AppError.js';
import { env } from '../../config/env.js';
import type { SystemRoleKey } from '../../core/types/auth.js';
import { AdminAuthFlow } from '../../database/models/AdminAuthFlow.js';
import { NotificationService } from '../notifications/notification.service.js';
import { AuditService } from '../audit/audit.service.js';
import { startAdminMfa, registerAdminFailure } from './admin-mfa.service.js';
import { auditAdminSessionDenial, describeClient, authEvidence, contactsHash, hasAdminSessionProof, securityAudit, type AuthMetadata } from './admin-security.js';
import { getSmsProvider } from '../../core/integrations/messaging-providers.js';

export const normalizePhone = (phone: string): string => phone.replace(/[\s()-]/g, '');
const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

function signAccessToken(userId: string, activeOrganizationId?: string, sessionId?: string, privileged = false) {
  return jwt.sign({ sub: userId, activeOrganizationId, sid: sessionId, privileged, type: 'access' }, env.JWT_ACCESS_SECRET, { expiresIn: (privileged ? '5m' : env.JWT_ACCESS_EXPIRES_IN) as jwt.SignOptions['expiresIn'] });
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
  if (identity.user.isPlatformAdmin) throw new AppError(401, 'ADMIN_MFA_REQUIRED', 'Administrator password and a selected verified-channel OTP are required.');
  if (identity.memberships.length === 0) throw new AppError(403, 'NO_ORGANIZATION_ACCESS', 'User has no active organization membership');
  const activeOrganizationId = identity.memberships[0]?.organizationId?.toString();
  const sessionId = new Types.ObjectId();
  const refreshToken = signRefreshToken(userId.toString(), sessionId.toString());
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await RefreshSession.create({ _id: sessionId, userId, tokenHash: hashToken(refreshToken), expiresAt, ...(meta?.userAgent ? { userAgent: meta.userAgent } : {}), ...(meta?.ipAddress ? { ipAddress: meta.ipAddress } : {}) });
  return { accessToken: signAccessToken(userId.toString(), activeOrganizationId, sessionId.toString()), refreshToken, user: identity.user, roles: identity.roles, memberships: identity.memberships, expiresAt };
}


async function mintAdminSession(userId: Types.ObjectId, proof: { contactsHash: string; authVersion: number; passwordVerifiedAt: Date; mfaChannel: 'EMAIL' | 'SMS' | 'DUAL'; emailVerifiedAt?: Date; smsVerifiedAt?: Date; absoluteExpiresAt?: Date | null }, meta: AuthMetadata, session: ClientSession) {
  const identity = await getIdentity(userId), sessionId = new Types.ObjectId();
  if (!identity.user.isPlatformAdmin || !identity.user.email || contactsHash(identity.user.email, identity.user.phone) !== proof.contactsHash || (identity.user.authVersion ?? 0) !== proof.authVersion)
    throw new AppError(401, 'ADMIN_MFA_REQUIRED', 'Administrator authentication evidence no longer matches the account.');
  if (!hasAdminSessionProof({ ...proof, mfaVerifiedAt: new Date() })) throw new AppError(401, 'ADMIN_MFA_REQUIRED', 'Password and required OTP evidence are missing.');
  const now = new Date(), expiresAt = proof.absoluteExpiresAt ?? new Date(Date.now() + env.ADMIN_SESSION_SECONDS * 1000);
  if (expiresAt <= now) throw new AppError(401, 'ADMIN_SESSION_EXPIRED', 'Administrator session has expired.');
  const refreshToken = jwt.sign({ sub: String(userId), sid: String(sessionId), type: 'refresh', privileged: true }, env.JWT_REFRESH_SECRET, { expiresIn: Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000)) });
  await RefreshSession.create([{ _id: sessionId, userId, tokenHash: hashToken(refreshToken), expiresAt, absoluteExpiresAt: expiresAt,
    privileged: true, contactsHash: proof.contactsHash, authVersion: proof.authVersion, passwordVerifiedAt: proof.passwordVerifiedAt,
    mfaChannel: proof.mfaChannel, ...(proof.emailVerifiedAt ? { emailVerifiedAt: proof.emailVerifiedAt } : {}),
    ...(proof.smsVerifiedAt ? { smsVerifiedAt: proof.smsVerifiedAt } : {}), mfaVerifiedAt: now, lastActivityAt: now,
    ...(meta.userAgent ? { userAgent: describeClient(meta.userAgent) } : {}), ...(meta.ipAddress ? { ipAddress: meta.ipAddress.slice(0, 100) } : {}) }], { session });
  return { accessToken: signAccessToken(String(userId), identity.memberships[0]?.organizationId?.toString(), String(sessionId), true), refreshToken,
    user: identity.user, roles: identity.roles, memberships: identity.memberships, expiresAt, sessionId,
    securityPolicy: { idleTimeoutSeconds: env.ADMIN_IDLE_SECONDS, absoluteTimeoutSeconds: env.ADMIN_SESSION_SECONDS } };
}
export async function finishAdminLogin(flowId: Types.ObjectId, meta: AuthMetadata = {}) {
  let result: Awaited<ReturnType<typeof mintAdminSession>> | undefined;
  await mongoose.connection.transaction(async session => {
    const flow = await AdminAuthFlow.findOneAndUpdate({ _id: flowId, purpose: { $in: ['LOGIN', 'STEP_UP'] }, stage: 'VERIFIED',
      $or: [
        { purpose: 'LOGIN', selectedChannel: 'EMAIL', emailVerifiedAt: { $type: 'date' } },
        { purpose: 'LOGIN', selectedChannel: 'SMS', smsVerifiedAt: { $type: 'date' } },
        { purpose: 'STEP_UP', emailVerifiedAt: { $type: 'date' }, smsVerifiedAt: { $type: 'date' } }
      ], expiresAt: { $gt: new Date() } }, { $set: { stage: 'COMPLETED' } }, { new: true, session });
    if (!flow) throw new AppError(401, 'ADMIN_MFA_REQUIRED', 'Completed password and required OTP verification is required.');
    const user = await User.findOne({ _id: flow.userId, status: 'ACTIVE', isPlatformAdmin: true }).select('+mfaContactsHash').session(session);
    if (!user || user.authFlowGeneration !== flow.userFlowGeneration || user.mfaContactsHash !== flow.contactsHash ||
      !user.emailVerifiedAt || !user.phoneVerifiedAt || (user.authLockedUntil && user.authLockedUntil > new Date()))
      throw new AppError(401, 'ADMIN_MFA_REQUIRED', 'Authentication is no longer valid.');
    let absoluteExpiresAt: Date | undefined;
    if (flow.purpose === 'STEP_UP') {
      const parent = await RefreshSession.findOneAndUpdate({ _id: flow.sessionId, userId: user._id, privileged: true, revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() }, lastActivityAt: { $gt: new Date(Date.now() - env.ADMIN_IDLE_SECONDS * 1000) } }, { $set: { revokedAt: new Date() } }, { new: true, session });
      if (!parent?.absoluteExpiresAt) throw new AppError(401, 'ADMIN_SESSION_EXPIRED', 'The original session is no longer active.');
      absoluteExpiresAt = parent.absoluteExpiresAt;
    }
    const mfaChannel = flow.purpose === 'LOGIN' ? authEvidence(flow.selectedChannel) : 'DUAL';
    const channels = mfaChannel === 'DUAL' ? ['EMAIL', 'SMS'] : [mfaChannel];
    result = await mintAdminSession(flow.userId, { contactsHash: flow.contactsHash, authVersion: flow.authVersion, mfaChannel,
      passwordVerifiedAt: flow.passwordVerifiedAt, ...(flow.emailVerifiedAt ? { emailVerifiedAt: flow.emailVerifiedAt } : {}),
      ...(flow.smsVerifiedAt ? { smsVerifiedAt: flow.smsVerifiedAt } : {}),
      ...(absoluteExpiresAt ? { absoluteExpiresAt } : {}) }, meta, session);
    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date(), authFailureCount: 0 }, $unset: { authLockedUntil: 1, authFailureWindowAt: 1 } }, { session });
    for (const action of ['mfa_completed', flow.purpose === 'STEP_UP' ? 'step_up_completed' : 'login_completed'])
      await AuditService.record({ actorUserId: user._id, actorRole: 'SUPER_ADMIN', action: 'auth.super_admin.' + action, resourceType: 'RefreshSession', resourceId: result.sessionId, ...meta, userAgent: describeClient(meta.userAgent), metadata: { channels, purpose: flow.purpose } }, session);
    const body = 'Administrator authentication completed at ' + new Date().toISOString() +
      '. Password and ' + channels.join(' + ') + ' OTP verification succeeded. Browser/device report (unverified): ' + (describeClient(meta.userAgent)) +
      '. Network address observed by the platform (may be a proxy): ' + (meta.ipAddress ?? 'Unavailable') +
      '. If this was unexpected, revoke your sessions and contact the authorized platform security operator immediately.';
    await NotificationService.enqueuePlatformSecurityLogin(user._id, result.sessionId, body, session);
  });
  if (!result) throw new AppError(401, 'ADMIN_MFA_REQUIRED', 'Administrator authentication was not completed.');
  return result;
}
export async function startAdminStepUp(userId: Types.ObjectId, sessionId: Types.ObjectId, password: string, meta: AuthMetadata) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user?.isPlatformAdmin || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    if (user?.isPlatformAdmin) await registerAdminFailure(user._id, meta, 'PASSWORD');
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid credentials.');
  }
  await securityAudit('step_up_initiated', userId, meta);
  await securityAudit('password_succeeded', userId, meta, { purpose: 'STEP_UP' });
  return startAdminMfa(userId, meta, { purpose: 'STEP_UP', sessionId });
}

export async function requestOtp(phoneInput: string, purpose: 'LOGIN' | 'ONBOARDING' | 'STEP_UP') {
  const phone = normalizePhone(phoneInput);
  if (await User.exists({ phone, isPlatformAdmin: true })) throw new AppError(403, 'ADMIN_MFA_REQUIRED', 'This account must use password and a selected verified-channel OTP.');
  const code = env.NODE_ENV === 'development' || env.NODE_ENV === 'test' ? '123456' : String(randomInt(100000, 1_000_000));
  const codeHash = await bcrypt.hash(code, 10);
  await OtpChallenge.deleteMany({ phone, purpose, consumedAt: { $exists: false } });
  await OtpChallenge.create({ phone, codeHash, purpose, expiresAt: new Date(Date.now() + env.OTP_TTL_SECONDS * 1000) });
  if (env.NODE_ENV === 'production') {
    await getSmsProvider().send({
      to: phone,
      body: `Your ${PRODUCT_NAME} verification code is ${code}. It expires in ${Math.ceil(env.OTP_TTL_SECONDS / 60)} minutes. Do not share this code.`,
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
  if (user.isPlatformAdmin || !identity.roles.some((role) => fieldRoles.includes(role))) throw new AppError(400, 'WRONG_LOGIN_METHOD', 'This account must use email and password');
  return requestOtp(phone, 'LOGIN');
}

export async function loginByEmail(emailInput: string, password: string, meta: AuthMetadata = {}) {
  const email = emailInput.trim().toLowerCase();
  const user = await User.findOne({ email, status: 'ACTIVE' }).select('+passwordHash').exec();
  if (!user?.passwordHash) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  if (user.isPlatformAdmin) {
    await securityAudit('login_initiated', user._id, meta);
    if (user.authLockedUntil && user.authLockedUntil > new Date()) { await securityAudit('lockout_attempt', user._id, meta); throw new AppError(429, 'ADMIN_LOCKED', 'Administrator temporarily locked. Try again later.'); }
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) { if (user.isPlatformAdmin) await registerAdminFailure(user._id, meta, 'PASSWORD'); throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'); }
  if (user.isPlatformAdmin) { await securityAudit('password_succeeded', user._id, meta); return startAdminMfa(user._id, meta); }
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
  if (user.isPlatformAdmin) throw new AppError(403, 'ADMIN_MFA_REQUIRED', 'Administrator password and selected-channel verification are required.');
  user.lastLoginAt = new Date(); user.verifiedAt ??= new Date(); await user.save();
  return issueSession(user._id, meta);
}

export async function verifyStepUp(emailInput: string, code: string, meta?: { userAgent?: string; ipAddress?: string }) {
  const email = emailInput.trim().toLowerCase();
  const user = await User.findOne({ email, status: 'ACTIVE' });
  if (!user) throw new AppError(401, 'OTP_INVALID', 'The OTP is invalid or expired');
  if (user.isPlatformAdmin) throw new AppError(403, 'ADMIN_MFA_REQUIRED', 'Administrator password and selected-channel verification are required.');
  const challenge = await OtpChallenge.findOne({ phone: user.phone, purpose: 'STEP_UP', consumedAt: { $exists: false }, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  if (!challenge) throw new AppError(401, 'OTP_INVALID', 'The OTP is invalid or expired');
  if (challenge.attempts >= env.OTP_MAX_ATTEMPTS) throw new AppError(429, 'OTP_LOCKED', 'Too many OTP attempts');
  challenge.attempts += 1;
  if (!(await bcrypt.compare(code, challenge.codeHash))) { await challenge.save(); throw new AppError(401, 'OTP_INVALID', 'The OTP is invalid or expired'); }
  challenge.consumedAt = new Date(); await challenge.save();
  user.lastLoginAt = new Date(); user.verifiedAt ??= new Date(); await user.save();
  return issueSession(user._id, meta);
}

export async function refreshSession(refreshToken: string, meta: AuthMetadata = {}) {
  let payload: jwt.JwtPayload;
  try { payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as jwt.JwtPayload; } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      const expired = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET, { ignoreExpiration: true }) as jwt.JwtPayload;
      if (expired.privileged && expired.type === 'refresh' && typeof expired.sub === 'string' && Types.ObjectId.isValid(expired.sub) && typeof expired.sid === 'string')
        await auditAdminSessionDenial(new Types.ObjectId(expired.sub), expired.sid, meta, true);
    }
    throw new AppError(401, 'REFRESH_TOKEN_INVALID', 'Refresh token is invalid or expired');
  }
  if (payload.type !== 'refresh' || typeof payload.sub !== 'string' || typeof payload.sid !== 'string' || !Types.ObjectId.isValid(payload.sid))
    throw new AppError(401, 'REFRESH_TOKEN_INVALID', 'Refresh token is invalid');
  const current = await RefreshSession.findOne({ _id: payload.sid, userId: payload.sub, tokenHash: hashToken(refreshToken), revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
  if (!current) {
    const replayed = await RefreshSession.findOne({ _id: payload.sid, userId: payload.sub, tokenHash: hashToken(refreshToken), privileged: true, replacedBySessionId: { $exists: true } }).lean();
    if (replayed) {
      await RefreshSession.updateMany({ userId: replayed.userId, privileged: true, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
      await securityAudit('refresh_replay_sessions_revoked', replayed.userId, meta);
    }
    throw new AppError(401, 'REFRESH_TOKEN_REVOKED', 'Refresh session is no longer valid');
  }
  const user = await User.findById(payload.sub).select('+mfaContactsHash').lean();
  if (!user || user.status !== 'ACTIVE') throw new AppError(401, 'ACCOUNT_INACTIVE', 'Account is inactive');
  if (user.isPlatformAdmin) {
    if (!current.privileged || !hasAdminSessionProof(current) ||
        !user.emailVerifiedAt || !user.phoneVerifiedAt || current.authVersion !== (user.authVersion ?? 0) ||
        !user.email || current.contactsHash !== contactsHash(user.email, user.phone) || current.contactsHash !== user.mfaContactsHash ||
        !current.lastActivityAt || current.lastActivityAt.getTime() <= Date.now() - env.ADMIN_IDLE_SECONDS * 1000 ||
        !current.absoluteExpiresAt || current.absoluteExpiresAt <= new Date())
    {
      await auditAdminSessionDenial(user._id, String(current._id), meta);
      throw new AppError(401, 'ADMIN_SESSION_EXPIRED', 'Administrator session requires full authentication.');
    }
    let result: Awaited<ReturnType<typeof mintAdminSession>> | undefined;
    await mongoose.connection.transaction(async session => {
      const parent = await RefreshSession.findOneAndUpdate({ _id: current._id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } }, { new: true, session });
      if (!parent) throw new AppError(401, 'REFRESH_TOKEN_REVOKED', 'Refresh session is no longer valid');
      result = await mintAdminSession(user._id, { contactsHash: authEvidence(current.contactsHash), authVersion: authEvidence(current.authVersion),
        passwordVerifiedAt: authEvidence(current.passwordVerifiedAt), mfaChannel: current.mfaChannel ?? 'DUAL',
        ...(current.emailVerifiedAt ? { emailVerifiedAt: current.emailVerifiedAt } : {}),
        ...(current.smsVerifiedAt ? { smsVerifiedAt: current.smsVerifiedAt } : {}),
        absoluteExpiresAt: authEvidence(current.absoluteExpiresAt) }, meta, session);
      await RefreshSession.updateOne({ _id: result.sessionId }, { $set: { mfaVerifiedAt: current.mfaVerifiedAt, lastActivityAt: current.lastActivityAt } }, { session });
      await RefreshSession.updateOne({ _id: current._id }, { $set: { replacedBySessionId: result.sessionId } }, { session });
    });
    if (!result) throw new AppError(401, 'REFRESH_TOKEN_REVOKED', 'Refresh session is no longer valid');
    return result;
  }
  const next = await issueSession(new Types.ObjectId(payload.sub), meta);
  const claimed = await RefreshSession.findOneAndUpdate({ _id: current._id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date(), replacedBySessionId: (jwt.decode(next.refreshToken) as jwt.JwtPayload).sid } });
  if (!claimed) { await revokeRefreshSession(next.refreshToken); throw new AppError(401, 'REFRESH_TOKEN_REVOKED', 'Refresh session is no longer valid'); }
  return next;
}

export async function revokeRefreshSession(refreshToken: string, meta: AuthMetadata = {}, action = 'logout') {
  const session = await RefreshSession.findOneAndUpdate({ tokenHash: hashToken(refreshToken), revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
  if (session?.privileged) await securityAudit(action, session.userId, meta);
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
    const organization = await Organization.create({ name: data.organization.name, slug, onboarding: { state: 'ACCOUNT_CREATED' } });
    await OrganizationMembership.create({ userId: user._id, organizationId: organization._id, roleIds: [role._id], scope: { allProperties: true, propertyIds: [], buildingIds: [], unitIds: [] }, joinedAt: new Date() });
    return { userId: user._id, organizationId: organization._id, organization, message: 'Landlord account and organization created. You can now sign in with email and password.' };
  } catch (error) {
    await User.deleteOne({ _id: user._id });
    throw error;
  }
}
