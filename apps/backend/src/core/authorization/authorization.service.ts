import { Types } from 'mongoose';
import type { AuthenticatedMembership, AuthenticatedUser } from '../types/auth.js';
import { AppError } from '../errors/AppError.js';

export interface ResourceContext {
  organizationId: Types.ObjectId | string;
  propertyId?: Types.ObjectId | string;
  buildingId?: Types.ObjectId | string;
  unitId?: Types.ObjectId | string;
  ownerUserId?: Types.ObjectId | string;
}

const same = (a?: Types.ObjectId | string, b?: Types.ObjectId | string) => !!a && !!b && String(a) === String(b);

export class AuthorizationService {
  static getMembership(auth: AuthenticatedUser, organizationId: Types.ObjectId | string): AuthenticatedMembership {
    const membership = auth.memberships.find((m) => same(m.organizationId, organizationId));
    if (!membership) throw new AppError(403, 'ORGANIZATION_ACCESS_DENIED', 'You do not have access to this organization');
    return membership;
  }

  static assertPilotWrite(auth: AuthenticatedUser, permission: string, organizationId: Types.ObjectId | string): void {
    if (!['.view','.download','.export'].some(suffix=>permission.endsWith(suffix)) && !permission.startsWith('billing.') && auth.readOnlyOrganizationIds?.some(id => same(id, organizationId)))
      throw new AppError(410, 'PILOT_EXPIRED', 'Pilot expired. Review commercial activation; existing records remain readable.');
  }

  static can(auth: AuthenticatedUser, permission: string, resource: ResourceContext): boolean {
    if (!['.view','.download','.export'].some(suffix=>permission.endsWith(suffix)) && !permission.startsWith('billing.') && auth.readOnlyOrganizationIds?.some(id=>same(id,resource.organizationId))) return false;
    if (auth.isPlatformAdmin) return true;
    const membership = auth.memberships.find((m) => same(m.organizationId, resource.organizationId));
    if (!membership || !membership.permissions.includes(permission)) return false;
    if (resource.ownerUserId && membership.roles.includes('TENANT')) {
      if (!same(resource.ownerUserId, auth.userId)) return false;
      if (!resource.propertyId && !resource.buildingId && !resource.unitId) return true;
    }
    if (membership.scope.allProperties) return true;
    if (resource.unitId && membership.scope.unitIds.some((id) => same(id, resource.unitId))) return true;
    if (resource.buildingId && membership.scope.buildingIds.some((id) => same(id, resource.buildingId))) return true;
    if (resource.propertyId && membership.scope.propertyIds.some((id) => same(id, resource.propertyId))) return true;
    return false;
  }

  static assertPermission(auth: AuthenticatedUser, permission: string, organizationId: Types.ObjectId | string): void {
    this.assertPilotWrite(auth, permission, organizationId);
    if (auth.isPlatformAdmin) return;
    const membership = this.getMembership(auth, organizationId);
    if (!membership.permissions.includes(permission)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have the required permission');
    }
  }

  static assertCan(auth: AuthenticatedUser, permission: string, resource: ResourceContext): void {
    this.assertPilotWrite(auth, permission, resource.organizationId);
    if (!this.can(auth, permission, resource)) throw new AppError(403, 'FORBIDDEN', 'You are not authorized to perform this action on this resource');
  }

  static assertPlatformAdmin(auth: AuthenticatedUser): void {
    if (!auth.isPlatformAdmin) throw new AppError(403, 'PLATFORM_ADMIN_REQUIRED', 'Platform administrator access is required');
  }
}
