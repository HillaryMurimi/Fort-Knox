import { Organization } from '../database/models/Organization.js';
import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { AppError } from '../core/errors/AppError.js';
import type { AuthenticatedUser } from '../core/types/auth.js';
import { User } from '../database/models/User.js';
import { OrganizationMembership } from '../database/models/OrganizationMembership.js';
import { RefreshSession } from '../database/models/RefreshSession.js';
import { auditAdminSessionDenial, authEvidence, contactsHash, assertFreshAdmin } from '../modules/auth/admin-security.js';
import { Role } from '../database/models/Role.js';

interface AccessTokenPayload { sub: string; type: 'access'; sid?: string; privileged?: boolean; activeOrganizationId?: string; }

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required');
    const payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    if (payload.type !== 'access' || !Types.ObjectId.isValid(payload.sub)) throw new Error('Invalid token');
    const query = User.findById(payload.sub);
    const user = await (query.select ? query.select('+mfaContactsHash') : query).lean();
    if (!user || user.status !== 'ACTIVE') throw new AppError(401, 'ACCOUNT_INACTIVE', 'Account is inactive');
    let privilegedSession: { _id: Types.ObjectId; mfaVerifiedAt?: Date | null } | null = null;
    if (user.isPlatformAdmin) {
      if (!payload.privileged || !payload.sid || !Types.ObjectId.isValid(payload.sid))
        throw new AppError(401, 'ADMIN_MFA_REQUIRED', 'Complete password, email and SMS authentication.');
      const now = new Date();
      const currentHash = user.email ? contactsHash(user.email, user.phone) : '';
      if (!user.emailVerifiedAt || !user.phoneVerifiedAt || user.mfaContactsHash !== currentHash)
        throw new AppError(401, 'ADMIN_MFA_REQUIRED', 'Administrator channels require secure verification.');
      privilegedSession = await RefreshSession.findOneAndUpdate({ _id: payload.sid, userId: user._id, privileged: true,
        revokedAt: { $exists: false }, expiresAt: { $gt: now }, absoluteExpiresAt: { $gt: now },
        passwordVerifiedAt: { $exists: true }, emailVerifiedAt: { $exists: true }, smsVerifiedAt: { $exists: true }, mfaVerifiedAt: { $exists: true },
        authVersion: user.authVersion ?? 0, contactsHash: currentHash, lastActivityAt: { $gt: new Date(Date.now() - env.ADMIN_IDLE_SECONDS * 1000) } },
        { $set: { lastActivityAt: now } }, { new: true });
      if (!privilegedSession) {
        await auditAdminSessionDenial(user._id, payload.sid, { requestId: req.requestId });
        throw new AppError(401, 'ADMIN_SESSION_EXPIRED', 'Administrator session expired or was revoked. Sign in again.');
      }
    }
    const memberships = await OrganizationMembership.find({ userId: user._id, status: 'ACTIVE' }).lean();
    const roleIds = memberships.flatMap((m) => m.roleIds);
    const roles = await Role.find({ _id: { $in: roleIds } }).lean();
    const readOnlyOrganizationIds = memberships.length ? await Organization.find({ _id: { $in: memberships.map(m => m.organizationId) }, 'guidedPilot.expiresAt': { $lte: new Date() }, 'onboarding.state': { $ne: 'ACTIVE' } }).distinct('_id') : [];
    const authContext: AuthenticatedUser = {
      readOnlyOrganizationIds,
      userId: user._id,
      isPlatformAdmin: !!user.isPlatformAdmin,
      ...(privilegedSession ? { sessionId: privilegedSession._id, mfaVerifiedAt: authEvidence(privilegedSession.mfaVerifiedAt) } : {}),
      memberships: memberships.map((m) => {
        const rs = roles.filter((r) => m.roleIds.some((id) => String(id) === String(r._id)));
        return { organizationId: m.organizationId, roleIds: m.roleIds, roles: rs.map((r) => r.key), permissions: [...new Set(rs.flatMap((r) => r.permissions))], scope: { allProperties: !!m.scope?.allProperties, propertyIds: m.scope?.propertyIds ?? [], buildingIds: m.scope?.buildingIds ?? [], unitIds: m.scope?.unitIds ?? [] } };
      })
    };
    if (payload.activeOrganizationId && Types.ObjectId.isValid(payload.activeOrganizationId)) authContext.activeOrganizationId = new Types.ObjectId(payload.activeOrganizationId);
    req.auth = authContext;
    if (user.isPlatformAdmin && (req.method === 'DELETE' || (req.originalUrl.split('?')[0] ?? '').startsWith(env.API_PREFIX + '/platform-control/switches/') && req.method === 'PATCH')) assertFreshAdmin(authContext);
    next();
  } catch (error) { next(error instanceof AppError ? error : new AppError(401, 'INVALID_TOKEN', 'Invalid or expired access token')); }
};
