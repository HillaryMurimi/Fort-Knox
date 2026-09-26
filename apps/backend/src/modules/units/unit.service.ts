import { Types } from 'mongoose';
import { Unit } from '../../database/models/Unit.js';
import { Floor } from '../../database/models/Floor.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { ResourceScopeService } from '../../core/authorization/resource-scope.service.js';
import { EntitlementService } from '../../core/billing/entitlement.service.js';
import { AppError } from '../../core/errors/AppError.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import type { CreateUnitInput, UpdateUnitInput } from './unit.schemas.js';

export class UnitService {
  static async list(auth: AuthenticatedUser, organizationId: string, floorId?: string) {
    const orgId = new Types.ObjectId(organizationId);
    const ids = await ResourceScopeService.scopedUnitIds(auth, orgId);
    const filter: Record<string, unknown> = { organizationId: orgId };
    if (ids) filter._id = { $in: ids };
    if (floorId) filter.floorId = new Types.ObjectId(floorId);
    return Unit.find(filter).sort({ propertyId: 1, buildingId: 1, floorId: 1, code: 1 }).lean();
  }

  static async get(auth: AuthenticatedUser, unitId: string) {
    const unit = await Unit.findById(unitId);
    if (!unit) throw new AppError(404, 'NOT_FOUND', 'Unit not found');
    ResourceScopeService.assertUnit(auth, unit, 'unit.view');
    return unit;
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
    Object.assign(unit, data, { updatedBy: auth.userId });
    await unit.save();
    return unit;
  }

  static async remove(auth: AuthenticatedUser, unitId: string) {
    const unit = await Unit.findById(unitId);
    if (!unit) throw new AppError(404, 'NOT_FOUND', 'Unit not found');
    ResourceScopeService.assertUnit(auth, unit, 'unit.update');
    unit.status = 'INACTIVE';
    unit.updatedBy = auth.userId;
    await unit.save();
    return unit;
  }
}
