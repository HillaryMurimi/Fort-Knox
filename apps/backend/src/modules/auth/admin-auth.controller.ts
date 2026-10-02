import type { Request } from 'express';
import { z } from 'zod';
import mongoose, { Types } from 'mongoose';
import { AppError } from '../../core/errors/AppError.js';
import { sendSuccess } from '../../core/response/apiResponse.js';
import { User } from '../../database/models/User.js';
import { RefreshSession } from '../../database/models/RefreshSession.js';
import { AdminAuthFlow } from '../../database/models/AdminAuthFlow.js';
import { AuditService } from '../audit/audit.service.js';
import { verifyAdminMfa, resendAdminMfa } from './admin-mfa.service.js';
import { finishAdminLogin, startAdminStepUp } from './auth.service.js';
import { hashCredential, assertAuthOrigin, assertFreshAdmin, securityAudit } from './admin-security.js';
import { setRefreshCookie } from './auth.controller.js';
import type { RequestHandler } from 'express';
const flowSchema = z.object({ flowToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
const verifySchema = flowSchema.extend({ channel: z.enum(['EMAIL', 'SMS']), code: z.string().regex(/^\d{6}$/) });
const meta = (req: Request) => ({ userAgent: req.get('user-agent'), ipAddress: req.ip, requestId: req.requestId });
export const adminOrigin: RequestHandler = (req, _res, next) => { try { assertAuthOrigin(req.get('origin'), req.get('x-pcc-auth')); next(); } catch (error) { next(error); } };
export const verify: RequestHandler = async (req, res) => {
  const input = verifySchema.parse(req.body);
  const verified = await verifyAdminMfa(input.flowToken, input.channel, input.code, meta(req));
  if (!verified.complete) return sendSuccess(res, verified.challenge);
  if (verified.purpose === 'ENROLLMENT') throw new AppError(403, 'MFA_PURPOSE_DENIED', 'Enrollment requires the authorized host-operator process.');
  const result = await finishAdminLogin(verified.flowId, meta(req));
  setRefreshCookie(res, result.refreshToken);
  const { refreshToken: _secret, sessionId: _sessionId, ...safe } = result;
  sendSuccess(res, safe);
};
export const resend: RequestHandler = async (req, res) => { const input = flowSchema.parse(req.body); sendSuccess(res, await resendAdminMfa(input.flowToken, meta(req))); };
export const stepUp: RequestHandler = async (req, res) => {
  const { password } = z.object({ password: z.string().min(8).max(200) }).strict().parse(req.body);
  if (!req.auth?.isPlatformAdmin || !req.auth.sessionId) throw new AppError(403, 'PLATFORM_ADMIN_REQUIRED', 'Authenticated platform administration is required.');
  sendSuccess(res, await startAdminStepUp(req.auth.userId, req.auth.sessionId, password, meta(req)));
};
export const sessions: RequestHandler = async (req, res) => {
  if (!req.auth?.isPlatformAdmin) throw new AppError(403, 'PLATFORM_ADMIN_REQUIRED', 'Platform administration is required.');
  const auth = req.auth;
  const items = await RefreshSession.find({ userId: auth.userId, privileged: true, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } })
    .select('_id createdAt lastActivityAt expiresAt userAgent').sort({ createdAt: -1 }).limit(50).lean();
  await securityAudit('sessions_viewed', req.auth.userId, meta(req));
  sendSuccess(res, items.map(item => ({ ...item, current: String(item._id) === String(auth.sessionId) })));
};
export const revoke: RequestHandler = async (req, res) => {
  if (!req.auth?.isPlatformAdmin) throw new AppError(403, 'PLATFORM_ADMIN_REQUIRED', 'Platform administration is required.');
  const id = z.string().regex(/^[a-f\d]{24}$/i).parse(req.params.sessionId);
  const item = await RefreshSession.findOneAndUpdate({ _id: id, userId: req.auth.userId, privileged: true, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
  if (!item) throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found.');
  await securityAudit('session_revoked', req.auth.userId, meta(req));
  sendSuccess(res, { revoked: true });
};
export const revokeAll: RequestHandler = async (req, res) => {
  if (!req.auth?.isPlatformAdmin) throw new AppError(403, 'PLATFORM_ADMIN_REQUIRED', 'Platform administration is required.');
  await RefreshSession.updateMany({ userId: req.auth.userId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
  await AdminAuthFlow.updateMany({ userId: req.auth.userId, stage: { $in: ['EMAIL', 'SMS', 'VERIFIED'] } }, { $set: { stage: 'INVALIDATED' } });
  await securityAudit('sessions_revoked', req.auth.userId, meta(req));
  sendSuccess(res, { revoked: true });
};
export const promote: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
  const auth = req.auth;
  assertFreshAdmin(auth);
  const input = z.object({ userId: z.string().regex(/^[a-f\d]{24}$/i), confirm: z.literal(true), reason: z.string().trim().min(10).max(200) }).strict().parse(req.body);
  await mongoose.connection.transaction(async session => {
    const account = await User.findOne({ _id: input.userId, status: 'ACTIVE', isPlatformAdmin: false }).select('+passwordHash').session(session);
    if (!account?.email || !account.phone || !account.passwordHash) throw new AppError(409, 'ADMIN_PROVISIONING_INVALID', 'An existing active password account with both destinations is required.');
    account.isPlatformAdmin = true; account.authVersion = (account.authVersion ?? 0) + 1;
    account.emailVerifiedAt = undefined; account.phoneVerifiedAt = undefined; account.mfaContactsHash = undefined;
    await account.save({ session });
    await RefreshSession.updateMany({ userId: account._id }, { $set: { revokedAt: new Date() } }, { session });
    await AuditService.record({ actorUserId: auth.userId, actorRole: 'SUPER_ADMIN', action: 'auth.super_admin.account_promoted', resourceType: 'User',
      resourceId: new Types.ObjectId(input.userId), requestId: req.requestId, metadata: { enrollmentRequired: true, reasonHash: hashCredential(input.reason) } }, session);
  });
  sendSuccess(res, { userId: input.userId, enrollmentRequired: true }, 201);
};
