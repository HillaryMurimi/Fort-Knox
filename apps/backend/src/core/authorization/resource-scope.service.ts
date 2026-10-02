import { Types } from 'mongoose';
import { AuthorizationService } from './authorization.service.js';
import type { ResourceContext } from './authorization.service.js';
import type { AuthenticatedUser } from '../types/auth.js';
import { Property } from '../../database/models/Property.js';
import { Building } from '../../database/models/Building.js';
import { Floor } from '../../database/models/Floor.js';
import { Unit } from '../../database/models/Unit.js';
import { AppError } from '../errors/AppError.js';

const toObjectId = (value: Types.ObjectId | string): Types.ObjectId => new Types.ObjectId(String(value));
const same = (a: Types.ObjectId | string, b: Types.ObjectId | string): boolean => String(a) === String(b);

export class ResourceScopeService {
  static assertCan(auth: AuthenticatedUser, permission: string, resource: ResourceContext): void {
    AuthorizationService.assertCan(auth, permission, resource);
  }

  private static assertPermission(auth: AuthenticatedUser, permission: string, resource: ResourceContext): void {
    AuthorizationService.assertPilotWrite(auth, permission, resource.organizationId);
    const membership = auth.isPlatformAdmin ? undefined : AuthorizationService.getMembership(auth, resource.organizationId);
    if (!auth.isPlatformAdmin && !membership!.permissions.includes(permission)) {
      throw new AppError(403, 'FORBIDDEN', 'You are not authorized to perform this action on this resource');
    }
  }

  static async assertProperty(auth: AuthenticatedUser, property: { _id: Types.ObjectId; organizationId: Types.ObjectId }, permission = 'property.view'): Promise<void> {
    const context: ResourceContext = { organizationId: property.organizationId, propertyId: property._id };
    if (AuthorizationService.can(auth, permission, context)) return;
    this.assertPermission(auth, permission, context);
    if (auth.isPlatformAdmin) return;
    const membership = AuthorizationService.getMembership(auth, property.organizationId);
    if (membership.scope.unitIds.length) {
      const descendant = await Unit.exists({ organizationId: property.organizationId, propertyId: property._id, _id: { $in: membership.scope.unitIds } });
      if (descendant) return;
    }
    if (membership.scope.buildingIds.length) {
      const descendant = await Building.exists({ organizationId: property.organizationId, propertyId: property._id, _id: { $in: membership.scope.buildingIds } });
      if (descendant) return;
    }
    throw new AppError(403, 'FORBIDDEN', 'You are not authorized to perform this action on this resource');
  }

  static async assertBuilding(auth: AuthenticatedUser, building: { _id: Types.ObjectId; organizationId: Types.ObjectId; propertyId: Types.ObjectId }, permission: string): Promise<void> {
    const context: ResourceContext = { organizationId: building.organizationId, propertyId: building.propertyId, buildingId: building._id };
    if (AuthorizationService.can(auth, permission, context)) return;
    this.assertPermission(auth, permission, context);
    if (auth.isPlatformAdmin) return;
    const membership = AuthorizationService.getMembership(auth, building.organizationId);
    if (membership.scope.unitIds.length) {
      const descendant = await Unit.exists({ organizationId: building.organizationId, buildingId: building._id, _id: { $in: membership.scope.unitIds } });
      if (descendant) return;
    }
    throw new AppError(403, 'FORBIDDEN', 'You are not authorized to perform this action on this resource');
  }

  static async assertFloor(auth: AuthenticatedUser, floor: { _id: Types.ObjectId; organizationId: Types.ObjectId; propertyId: Types.ObjectId; buildingId: Types.ObjectId }, permission: string): Promise<void> {
    const context: ResourceContext = { organizationId: floor.organizationId, propertyId: floor.propertyId, buildingId: floor.buildingId };
    if (AuthorizationService.can(auth, permission, context)) return;
    this.assertPermission(auth, permission, context);
    if (auth.isPlatformAdmin) return;
    const membership = AuthorizationService.getMembership(auth, floor.organizationId);
    if (membership.scope.unitIds.length) {
      const descendant = await Unit.exists({ organizationId: floor.organizationId, floorId: floor._id, _id: { $in: membership.scope.unitIds } });
      if (descendant) return;
    }
    throw new AppError(403, 'FORBIDDEN', 'You are not authorized to perform this action on this resource');
  }

  static assertUnit(auth: AuthenticatedUser, unit: { _id: Types.ObjectId; organizationId: Types.ObjectId; propertyId: Types.ObjectId; buildingId: Types.ObjectId }, permission: string, ownerUserId?: Types.ObjectId | null): void {
    const resource: ResourceContext = { organizationId: unit.organizationId, propertyId: unit.propertyId, buildingId: unit.buildingId, unitId: unit._id };
    if (ownerUserId) resource.ownerUserId = ownerUserId;
    AuthorizationService.assertCan(auth, permission, resource);
  }

  static async assertPropertyExistsInOrganization(propertyId: string, organizationId: Types.ObjectId) {
    const property = await Property.findOne({ _id: toObjectId(propertyId), organizationId });
    if (!property) throw new AppError(404, 'NOT_FOUND', 'Property not found in this organization');
    return property;
  }

  static async assertBuildingExistsInOrganization(buildingId: string, organizationId: Types.ObjectId) {
    const building = await Building.findOne({ _id: toObjectId(buildingId), organizationId });
    if (!building) throw new AppError(404, 'NOT_FOUND', 'Building not found in this organization');
    return building;
  }

  static async assertFloorExistsInOrganization(floorId: string, organizationId: Types.ObjectId) {
    const floor = await Floor.findOne({ _id: toObjectId(floorId), organizationId });
    if (!floor) throw new AppError(404, 'NOT_FOUND', 'Floor not found in this organization');
    return floor;
  }

  static async assertUnitExistsInOrganization(unitId: string, organizationId: Types.ObjectId) {
    const unit = await Unit.findOne({ _id: toObjectId(unitId), organizationId });
    if (!unit) throw new AppError(404, 'NOT_FOUND', 'Unit not found in this organization');
    return unit;
  }

  static async scopedPropertyIds(auth: AuthenticatedUser, organizationId: Types.ObjectId): Promise<Types.ObjectId[] | null> {
    if (auth.isPlatformAdmin) return null;
    const membership = AuthorizationService.getMembership(auth, organizationId);
    if (membership.scope.allProperties) return null;
    const ids = new Set<string>(membership.scope.propertyIds.map(String));
    if (membership.scope.buildingIds.length) {
      const buildings = await Building.find({ organizationId, _id: { $in: membership.scope.buildingIds } }).select('propertyId').lean();
      buildings.forEach((building) => ids.add(String(building.propertyId)));
    }
    if (membership.scope.unitIds.length) {
      const units = await Unit.find({ organizationId, _id: { $in: membership.scope.unitIds } }).select('propertyId').lean();
      units.forEach((unit) => ids.add(String(unit.propertyId)));
    }
    return [...ids].map(toObjectId);
  }

  static async scopedBuildingIds(auth: AuthenticatedUser, organizationId: Types.ObjectId): Promise<Types.ObjectId[] | null> {
    if (auth.isPlatformAdmin) return null;
    const membership = AuthorizationService.getMembership(auth, organizationId);
    if (membership.scope.allProperties) return null;
    const ids = new Set<string>(membership.scope.buildingIds.map(String));
    if (membership.scope.propertyIds.length) {
      const buildings = await Building.find({ organizationId, propertyId: { $in: membership.scope.propertyIds } }).select('_id').lean();
      buildings.forEach((building) => ids.add(String(building._id)));
    }
    if (membership.scope.unitIds.length) {
      const units = await Unit.find({ organizationId, _id: { $in: membership.scope.unitIds } }).select('buildingId').lean();
      units.forEach((unit) => ids.add(String(unit.buildingId)));
    }
    return [...ids].map(toObjectId);
  }

  static async scopedFloorIds(auth: AuthenticatedUser, organizationId: Types.ObjectId): Promise<Types.ObjectId[] | null> {
    if (auth.isPlatformAdmin) return null;
    const membership = AuthorizationService.getMembership(auth, organizationId);
    if (membership.scope.allProperties) return null;
    const ids = new Set<string>();
    const buildingIds = await this.scopedBuildingIds(auth, organizationId);
    if (buildingIds?.length) {
      const floors = await Floor.find({ organizationId, buildingId: { $in: buildingIds } }).select('_id').lean();
      floors.forEach((floor) => ids.add(String(floor._id)));
    }
    if (membership.scope.unitIds.length) {
      const units = await Unit.find({ organizationId, _id: { $in: membership.scope.unitIds } }).select('floorId').lean();
      units.forEach((unit) => ids.add(String(unit.floorId)));
    }
    return [...ids].map(toObjectId);
  }

  static async scopedUnitIds(auth: AuthenticatedUser, organizationId: Types.ObjectId): Promise<Types.ObjectId[] | null> {
    if (auth.isPlatformAdmin) return null;
    const membership = AuthorizationService.getMembership(auth, organizationId);
    if (membership.scope.allProperties) return null;
    const ids = new Set<string>(membership.scope.unitIds.map(String));
    const buildingIds = await this.scopedBuildingIds(auth, organizationId);
    if (buildingIds?.length) {
      const units = await Unit.find({ organizationId, buildingId: { $in: buildingIds } }).select('_id').lean();
      units.forEach((unit) => ids.add(String(unit._id)));
    }
    return [...ids].map(toObjectId);
  }

  static assertSameOrganization(actualOrganizationId: Types.ObjectId, expectedOrganizationId: Types.ObjectId): void {
    if (!same(actualOrganizationId, expectedOrganizationId)) throw new AppError(403, 'CROSS_ORGANIZATION_ACCESS_DENIED', 'Resource does not belong to the active organization');
  }
}
