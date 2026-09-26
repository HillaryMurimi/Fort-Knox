import { Types } from 'mongoose';
import { Tenancy } from '../../database/models/Tenancy.js';
import { Tenant } from '../../database/models/Tenant.js';
import { Unit } from '../../database/models/Unit.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { ResourceScopeService } from '../../core/authorization/resource-scope.service.js';
import { AppError } from '../../core/errors/AppError.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import type { CreateTenancyInput, UpdateTenancyInput } from './tenancy.schemas.js';

const ACTIVE_STATUSES = { $in: ['ACTIVE', 'NOTICE'] as const };

export class TenancyService {
  static async list(auth: AuthenticatedUser, organizationId: string) {
    const orgId = new Types.ObjectId(organizationId);
    const ids = await ResourceScopeService.scopedUnitIds(auth, orgId);
    const filter: Record<string, unknown> = { organizationId: orgId };
    if (ids) filter.unitId = { $in: ids };
    return Tenancy.find(filter).populate('tenantId').populate('unitId').sort({ startDate: -1 }).lean();
  }

  static async get(auth: AuthenticatedUser, tenancyId: string) {
    const tenancy = await Tenancy.findById(tenancyId).populate('tenantId').populate('unitId');
    if (!tenancy) throw new AppError(404, 'NOT_FOUND', 'Tenancy not found');
    const tenant = await Tenant.findById(tenancy.tenantId).lean();
    ResourceScopeService.assertUnit(auth, tenancy, 'tenancy.view', tenant?.userId);
    return tenancy;
  }

  static async create(auth: AuthenticatedUser, organizationId: string, data: CreateTenancyInput) {
    const orgId = new Types.ObjectId(organizationId);
    const unit = await Unit.findOne({ _id: data.unitId, organizationId: orgId });
    if (!unit) throw new AppError(404, 'UNIT_NOT_FOUND', 'Unit not found in this organization');
    const tenant = await Tenant.findOne({ _id: data.tenantId, organizationId: orgId });
    if (!tenant) throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant not found in this organization');
    ResourceScopeService.assertUnit(auth, unit, 'tenancy.create');
    if (unit.status === 'INACTIVE' || unit.status === 'MAINTENANCE') throw new AppError(409, 'UNIT_UNAVAILABLE', 'Unit is not available for tenancy');
    const existing = await Tenancy.exists({ organizationId: orgId, unitId: unit._id, status: ACTIVE_STATUSES });
    if (existing) throw new AppError(409, 'UNIT_OCCUPIED', 'Unit already has an active tenancy');
    const tenantExisting = await Tenancy.exists({ organizationId: orgId, tenantId: tenant._id, status: ACTIVE_STATUSES });
    if (tenantExisting) throw new AppError(409, 'TENANT_ALREADY_HOUSED', 'Tenant already has an active tenancy');
    const tenancy = await Tenancy.create({ ...data, organizationId: orgId, propertyId: unit.propertyId, buildingId: unit.buildingId, floorId: unit.floorId, status: 'PENDING', createdBy: auth.userId, updatedBy: auth.userId });
    return tenancy;
  }

  static async update(auth: AuthenticatedUser, tenancyId: string, data: UpdateTenancyInput) {
    const tenancy = await Tenancy.findById(tenancyId);
    if (!tenancy) throw new AppError(404, 'NOT_FOUND', 'Tenancy not found');
    const tenant = await Tenant.findById(tenancy.tenantId).lean();
    ResourceScopeService.assertUnit(auth, tenancy, 'tenancy.update', tenant?.userId);
    if (['MOVED_OUT', 'TERMINATED'].includes(tenancy.status)) throw new AppError(409, 'TENANCY_CLOSED', 'Closed tenancies cannot be edited');
    Object.assign(tenancy, data, { updatedBy: auth.userId });
    await tenancy.save();
    return tenancy;
  }

  static async activate(auth: AuthenticatedUser, tenancyId: string) {
    const tenancy = await Tenancy.findById(tenancyId);
    if (!tenancy) throw new AppError(404, 'NOT_FOUND', 'Tenancy not found');
    const tenant = await Tenant.findById(tenancy.tenantId);
    if (!tenant) throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant profile not found');
    ResourceScopeService.assertUnit(auth, tenancy, 'tenancy.activate', tenant.userId);
    if (!['DRAFT', 'PENDING'].includes(tenancy.status)) throw new AppError(409, 'INVALID_TRANSITION', 'Only draft or pending tenancies can be activated');
    const unit = await Unit.findById(tenancy.unitId);
    if (!unit || unit.status === 'INACTIVE' || unit.status === 'MAINTENANCE') throw new AppError(409, 'UNIT_UNAVAILABLE', 'Unit is not available');
    const active = await Tenancy.exists({ _id: { $ne: tenancy._id }, organizationId: tenancy.organizationId, unitId: tenancy.unitId, status: ACTIVE_STATUSES });
    if (active) throw new AppError(409, 'UNIT_OCCUPIED', 'Unit already has an active tenancy');
    tenancy.status = 'ACTIVE'; tenancy.activatedAt = new Date(); tenancy.updatedBy = auth.userId;
    unit.status = 'OCCUPIED'; unit.updatedBy = auth.userId;
    tenant.status = 'ACTIVE'; tenant.updatedBy = auth.userId;
    await Promise.all([tenancy.save(), unit.save(), tenant.save()]);
    return tenancy;
  }

  static async terminate(auth: AuthenticatedUser, tenancyId: string) {
    const tenancy = await Tenancy.findById(tenancyId);
    if (!tenancy) throw new AppError(404, 'NOT_FOUND', 'Tenancy not found');
    const tenant = await Tenant.findById(tenancy.tenantId);
    if (!tenant) throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant profile not found');
    ResourceScopeService.assertUnit(auth, tenancy, 'tenancy.terminate', tenant.userId);
    if (!['ACTIVE', 'NOTICE'].includes(tenancy.status)) throw new AppError(409, 'INVALID_TRANSITION', 'Only active or notice tenancies can be terminated');
    tenancy.status = 'TERMINATED'; tenancy.terminatedAt = new Date(); tenancy.updatedBy = auth.userId;
    const unit = await Unit.findById(tenancy.unitId);
    if (unit) { unit.status = 'VACANT'; unit.updatedBy = auth.userId; await unit.save(); }
    tenant.status = 'INACTIVE'; tenant.updatedBy = auth.userId;
    await Promise.all([tenancy.save(), tenant.save()]);
    return tenancy;
  }
}
