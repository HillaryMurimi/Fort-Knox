import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../core/errors/AppError.js';
import { AuthorizationService } from '../core/authorization/authorization.service.js';

export const requirePermission = (...required: string[]): RequestHandler => (req, _res, next) => {
  if (!req.auth) return next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required'));
  if (req.auth.isPlatformAdmin) return next();
  const organizationId = req.params.organizationId ?? req.auth.activeOrganizationId;
  const membership = organizationId ? req.auth.memberships.find((m) => String(m.organizationId) === String(organizationId)) : undefined;
  if (!membership || !required.every((p) => membership.permissions.includes(p))) return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action'));
  next();
};

export const requireRole = (...roles: string[]): RequestHandler => (req, _res, next) => {
  if (!req.auth) return next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required'));
  if (req.auth.isPlatformAdmin || req.auth.memberships.some((m) => roles.some((r) => m.roles.includes(r)))) return next();
  next(new AppError(403, 'FORBIDDEN', 'Your role cannot perform this action'));
};

export const requireResourceAccess = (permission: string, source: 'params' | 'body' = 'params'): RequestHandler => (req, _res, next) => {
  try {
    if (!req.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required');
    const data = source === 'body' ? req.body : req.params;
    const organizationId = data.organizationId ?? req.auth.activeOrganizationId;
    if (!organizationId || !Types.ObjectId.isValid(organizationId)) throw new AppError(400, 'ORGANIZATION_REQUIRED', 'A valid organizationId is required');
    AuthorizationService.assertCan(req.auth, permission, { organizationId, propertyId: data.propertyId, buildingId: data.buildingId, unitId: data.unitId, ownerUserId: data.ownerUserId });
    next();
  } catch (error) { next(error); }
};
