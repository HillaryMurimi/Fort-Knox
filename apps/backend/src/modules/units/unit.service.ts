import mongoose, { Types } from 'mongoose';
import { Unit } from '../../database/models/Unit.js';
import { Floor } from '../../database/models/Floor.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { ResourceScopeService } from '../../core/authorization/resource-scope.service.js';
import { EntitlementService } from '../../core/billing/entitlement.service.js';
import { AppError } from '../../core/errors/AppError.js';
import { AuditLog } from '../../database/models/AuditLog.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import type { CreateUnitInput, UpdateUnitInput } from './unit.schemas.js';

export class UnitService {
  private static visible(auth: AuthenticatedUser, unit: Record<string, unknown>) {
    if (AuthorizationService.can(auth, 'rent.view', { organizationId: String(unit.organizationId), propertyId: String(unit.propertyId), buildingId: String(unit.buildingId), unitId: String(unit._id) })) return unit;
    const { monthlyRent: _monthlyRent, serviceCharge: _serviceCharge, ...visible } = unit;
    void _monthlyRent; void _serviceCharge;
    return visible;
  }

  static async list(auth: AuthenticatedUser, organizationId: string, floorId?: string) {
    const orgId = new Types.ObjectId(organizationId);
    const ids = await ResourceScopeService.scopedUnitIds(auth, orgId);
    const filter: Record<string, unknown> = { organizationId: orgId };
    if (ids) filter._id = { $in: ids };
    if (floorId) filter.floorId = new Types.ObjectId(floorId);
    const units = await Unit.find(filter).sort({ propertyId: 1, buildingId: 1, floorId: 1, code: 1 }).lean();
    return units.map(unit => this.visible(auth, unit));
  }

  static async get(auth: AuthenticatedUser, unitId: string) {
    const unit = await Unit.findById(unitId);
    if (!unit) throw new AppError(404, 'NOT_FOUND', 'Unit not found');
    ResourceScopeService.assertUnit(auth, unit, 'unit.view');
    return this.visible(auth, unit.toObject());
  }

  static async create(auth: AuthenticatedUser, organizationId: string, data: CreateUnitInput) {
    const orgId = new Types.ObjectId(organizationId);
    const floor = await Floor.findOne({ _id: data.floorId, organizationId: orgId });
    if (!floor) throw new AppError(404, 'NOT_FOUND', 'Parent floor not found');
    AuthorizationService.assertCan(auth, 'unit.create', { organizationId: orgId, propertyId: floor.propertyId, buildingId: floor.buildingId });
    await EntitlementService.assertCapacity(organizationId, 'UNITS');
    return Unit.create({ ...data, organizationId: orgId, propertyId: floor.propertyId, buildingId: floor.buildingId, floorId: floor._id, createdBy: auth.userId, updatedBy: auth.userId });
  }

  static async update(auth: AuthenticatedUser, unitId: string, data: UpdateUnitInput) {
    const unit = await Unit.findById(unitId);
    if (!unit) throw new AppError(404, 'NOT_FOUND', 'Unit not found');
    ResourceScopeService.assertUnit(auth, unit, 'unit.update');
    if (data.monthlyRent !== undefined || data.serviceCharge !== undefined) {
      AuthorizationService.assertCan(auth, 'rent.manage', { organizationId: unit.organizationId, propertyId: unit.propertyId, buildingId: unit.buildingId, unitId: unit._id });
    }
    const before = { name: unit.name, code: unit.code, unitType: unit.unitType, unitTypeLabel: unit.unitTypeLabel, monthlyRent: unit.monthlyRent, status: unit.status };
    Object.assign(unit, data, { updatedBy: auth.userId });
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await unit.save({ session });
        await AuditLog.create([{ organizationId: unit.organizationId, actorUserId: auth.userId, action: 'unit.updated', resourceType: 'Unit', resourceId: unit._id, propertyId: unit.propertyId, buildingId: unit.buildingId, unitId: unit._id, before, after: { name: unit.name, code: unit.code, unitType: unit.unitType, unitTypeLabel: unit.unitTypeLabel, monthlyRent: unit.monthlyRent, status: unit.status }, occurredAt: new Date() }], { session });
      });
    } finally { await session.endSession(); }
    return unit;
  }

  static async remove(auth: AuthenticatedUser, unitId: string) {
    const unit = await Unit.findById(unitId);
    if (!unit) throw new AppError(404, 'NOT_FOUND', 'Unit not found');
    ResourceScopeService.assertUnit(auth, unit, 'unit.update');
    const before = { status: unit.status };
    unit.status = 'INACTIVE';
    unit.updatedBy = auth.userId;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await unit.save({ session });
        await AuditLog.create([{ organizationId: unit.organizationId, actorUserId: auth.userId, action: 'unit.deactivated', resourceType: 'Unit', resourceId: unit._id, propertyId: unit.propertyId, buildingId: unit.buildingId, unitId: unit._id, before, after: { status: unit.status }, occurredAt: new Date() }], { session });
      });
    } finally { await session.endSession(); }
    return unit;
  }
}
