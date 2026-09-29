import mongoose, { Types } from 'mongoose';
import { Property } from '../../database/models/Property.js';
import { Building } from '../../database/models/Building.js';
import { Floor } from '../../database/models/Floor.js';
import { Unit } from '../../database/models/Unit.js';
import { AuditLog } from '../../database/models/AuditLog.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { EntitlementService } from '../../core/billing/entitlement.service.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import type { PropertySetupInput } from './property-setup.schemas.js';
import { addMinorUnits, legacyMinorUnits } from '../../core/money/legacy-finance.js';

export class PropertySetupService {
  static async create(auth: AuthenticatedUser, organizationId: string, input: PropertySetupInput) {
    const orgId = new Types.ObjectId(organizationId);
    for (const permission of ['property.create', 'building.create', 'floor.create', 'unit.create']) {
      AuthorizationService.assertCan(auth, permission, { organizationId: orgId });
    }
    const unitCount = input.buildings.reduce((total, building) => total + building.floors.reduce((sum, floor) => sum + floor.units.length, 0), 0);
    await EntitlementService.assertCapacity(organizationId, 'PROPERTIES');
    await EntitlementService.assertCapacity(organizationId, 'UNITS', unitCount);

    const propertyId = new Types.ObjectId();
    const actorId = new Types.ObjectId(auth.userId);
    const buildingRows: Record<string, unknown>[] = [];
    const floorRows: Record<string, unknown>[] = [];
    const unitRows: Record<string, unknown>[] = [];
    const auditRows: Record<string, unknown>[] = [];
    const occurredAt = new Date();
    const auditBase = { organizationId: orgId, actorUserId: actorId, propertyId, occurredAt };
    let estimatedMonthlyRentMinor = 0;

    for (const building of input.buildings) {
      const buildingId = new Types.ObjectId();
      buildingRows.push({ _id: buildingId, organizationId: orgId, propertyId, name: building.name, code: building.code, totalFloors: building.floors.length, totalUnits: building.floors.reduce((sum, floor) => sum + floor.units.length, 0), createdBy: actorId, updatedBy: actorId });
      auditRows.push({ ...auditBase, action: 'building.created', resourceType: 'Building', resourceId: buildingId, buildingId, after: { name: building.name, code: building.code } });
      for (const floor of building.floors) {
        const floorId = new Types.ObjectId();
        floorRows.push({ _id: floorId, organizationId: orgId, propertyId, buildingId, name: floor.name, code: floor.code, level: floor.level, totalUnits: floor.units.length, createdBy: actorId, updatedBy: actorId });
        auditRows.push({ ...auditBase, action: 'floor.generated', resourceType: 'Floor', resourceId: floorId, buildingId, after: { name: floor.name, code: floor.code, level: floor.level } });
        for (const unit of floor.units) {
          estimatedMonthlyRentMinor = addMinorUnits(estimatedMonthlyRentMinor, legacyMinorUnits(unit.monthlyRent, 'KES'));
          unitRows.push({ ...unit, organizationId: orgId, propertyId, buildingId, floorId, createdBy: actorId, updatedBy: actorId });
        }
      }
      auditRows.push({ ...auditBase, action: 'units.bulk_created', resourceType: 'Building', resourceId: buildingId, buildingId, after: { count: building.floors.reduce((sum, floor) => sum + floor.units.length, 0) } });
    }
    auditRows.push({ ...auditBase, action: 'property.setup_completed', resourceType: 'Property', resourceId: propertyId, after: { buildingCount: buildingRows.length, floorCount: floorRows.length, unitCount } });

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await Property.create([{ _id: propertyId, ...input.property, organizationId: orgId, totalUnits: unitCount, metadata: { structureMode: input.structureMode }, createdBy: actorId, updatedBy: actorId }], { session });
        await Building.insertMany(buildingRows, { session });
        await Floor.insertMany(floorRows, { session });
        await Unit.insertMany(unitRows, { session });
        await AuditLog.insertMany(auditRows, { session });
      });
    } finally {
      await session.endSession();
    }
    return { propertyId: String(propertyId), buildingCount: buildingRows.length, floorCount: floorRows.length, unitCount, estimatedMonthlyRent: estimatedMonthlyRentMinor / 100 };
  }
}
