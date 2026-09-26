import { Types } from 'mongoose';
import { Tenant } from '../../database/models/Tenant.js';
import { User } from '../../database/models/User.js';
import { Tenancy } from '../../database/models/Tenancy.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { ResourceScopeService } from '../../core/authorization/resource-scope.service.js';
import { EntitlementService } from '../../core/billing/entitlement.service.js';
import { AppError } from '../../core/errors/AppError.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import type { CreateTenantInput, UpdateTenantInput } from './tenant.schemas.js';

export class TenantService {
  static async list(auth: AuthenticatedUser, organizationId: string) {
    const orgId = new Types.ObjectId(organizationId);
    const ids = await ResourceScopeService.scopedUnitIds(auth, orgId);
    const tenantIds = ids ? await Tenancy.find({ organizationId: orgId, unitId: { $in: ids }, status: { $in: ['ACTIVE', 'NOTICE'] } }).distinct('tenantId') : null;
    const filter: Record<string, unknown> = { organizationId: orgId };
    if (tenantIds) filter._id = { $in: tenantIds };
    return Tenant.find(filter).populate('userId', 'phone email firstName lastName status').sort({ createdAt: -1 }).lean();
  }

  static async get(auth: AuthenticatedUser, tenantId: string) {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) throw new AppError(404, 'NOT_FOUND', 'Tenant not found');
    const activeTenancy = await Tenancy.findOne({ organizationId: tenant.organizationId, tenantId: tenant._id, status: { $in: ['ACTIVE', 'NOTICE'] } }).lean();
    if (activeTenancy) {
      ResourceScopeService.assertUnit(auth, { _id: activeTenancy.unitId, organizationId: activeTenancy.organizationId, propertyId: activeTenancy.propertyId, buildingId: activeTenancy.buildingId }, 'tenant.view', tenant.userId);
    } else {
      AuthorizationService.assertCan(auth, 'tenant.view', { organizationId: tenant.organizationId, ownerUserId: tenant.userId });
    }
    return tenant.populate('userId', 'phone email firstName lastName status');
  }

  static async create(auth: AuthenticatedUser, organizationId: string, data: CreateTenantInput) {
    const orgId = new Types.ObjectId(organizationId);
    AuthorizationService.assertPermission(auth, 'tenant.create', orgId);
    await EntitlementService.assertCapacity(organizationId, 'TENANTS');
    const user = await User.findById(data.userId);
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    const existing = await Tenant.findOne({ organizationId: orgId, userId: user._id });
    if (existing) throw new AppError(409, 'TENANT_EXISTS', 'A tenant profile already exists for this user in this organization');
    return Tenant.create({ ...data, organizationId: orgId, createdBy: auth.userId, updatedBy: auth.userId });
  }

  static async update(auth: AuthenticatedUser, tenantId: string, data: UpdateTenantInput) {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) throw new AppError(404, 'NOT_FOUND', 'Tenant not found');
    const tenancy = await Tenancy.findOne({ organizationId: tenant.organizationId, tenantId: tenant._id, status: { $in: ['ACTIVE', 'NOTICE'] } }).lean();
    if (tenancy) ResourceScopeService.assertUnit(auth, tenancy, 'tenant.update', tenant.userId);
    else AuthorizationService.assertCan(auth, 'tenant.update', { organizationId: tenant.organizationId, ownerUserId: tenant.userId });
    Object.assign(tenant, data, { updatedBy: auth.userId });
    await tenant.save();
    return tenant;
  }
}
