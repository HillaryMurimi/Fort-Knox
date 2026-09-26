import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { AppError } from '../core/errors/AppError.js';
import type { AuthenticatedUser } from '../core/types/auth.js';
import { User } from '../database/models/User.js';
import { OrganizationMembership } from '../database/models/OrganizationMembership.js';
import { Role } from '../database/models/Role.js';

interface AccessTokenPayload { sub: string; type: 'access'; activeOrganizationId?: string; }

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required');
    const payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    if (payload.type !== 'access' || !Types.ObjectId.isValid(payload.sub)) throw new Error('Invalid token');
    const user = await User.findById(payload.sub).lean();
    if (!user || user.status !== 'ACTIVE') throw new AppError(401, 'ACCOUNT_INACTIVE', 'Account is inactive');
    const memberships = await OrganizationMembership.find({ userId: user._id, status: 'ACTIVE' }).lean();
    const roleIds = memberships.flatMap((m) => m.roleIds);
    const roles = await Role.find({ _id: { $in: roleIds } }).lean();
    const authContext: AuthenticatedUser = {
      userId: user._id,
      isPlatformAdmin: !!user.isPlatformAdmin,
      memberships: memberships.map((m) => {
        const rs = roles.filter((r) => m.roleIds.some((id) => String(id) === String(r._id)));
        return { organizationId: m.organizationId, roleIds: m.roleIds, roles: rs.map((r) => r.key), permissions: [...new Set(rs.flatMap((r) => r.permissions))], scope: { allProperties: !!m.scope?.allProperties, propertyIds: m.scope?.propertyIds ?? [], buildingIds: m.scope?.buildingIds ?? [], unitIds: m.scope?.unitIds ?? [] } };
      })
    };
    if (payload.activeOrganizationId && Types.ObjectId.isValid(payload.activeOrganizationId)) authContext.activeOrganizationId = new Types.ObjectId(payload.activeOrganizationId);
    req.auth = authContext;
    next();
  } catch (error) { next(error instanceof AppError ? error : new AppError(401, 'INVALID_TOKEN', 'Invalid or expired access token')); }
};
