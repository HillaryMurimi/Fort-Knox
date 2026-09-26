import { Types } from 'mongoose';
import { Building } from '../../database/models/Building.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { ResourceScopeService } from '../../core/authorization/resource-scope.service.js';
import { AppError } from '../../core/errors/AppError.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import type { CreateBuildingInput, UpdateBuildingInput } from './building.schemas.js';
import { Property } from '../../database/models/Property.js';

export class BuildingService {
  static async list(auth: AuthenticatedUser, organizationId: string, propertyId?: string) {
    const orgId = new Types.ObjectId(organizationId);
    const ids = await ResourceScopeService.scopedBuildingIds(auth, orgId);
    const filter: Record<string, unknown> = { organizationId: orgId };
    if (ids) filter._id = { $in: ids };
    if (propertyId) filter.propertyId = new Types.ObjectId(propertyId);
    return Building.find(filter).sort({ propertyId: 1, name: 1 }).lean();
  }

  static async get(auth: AuthenticatedUser, buildingId: string) {
    const building = await Building.findById(buildingId);
    if (!building) throw new AppError(404, 'NOT_FOUND', 'Building not found');
    await ResourceScopeService.assertBuilding(auth, building, 'building.view');
    return building;
  }

  static async create(auth: AuthenticatedUser, organizationId: string, data: CreateBuildingInput) {
    const orgId = new Types.ObjectId(organizationId);
    const property = await ResourceScopeService.assertPropertyExistsInOrganization(data.propertyId, orgId);
    AuthorizationService.assertCan(auth, 'building.create', { organizationId: orgId, propertyId: property._id });
    return Building.create({ ...data, organizationId: orgId, propertyId: property._id, createdBy: auth.userId, updatedBy: auth.userId });
  }

  static async update(auth: AuthenticatedUser, buildingId: string, data: UpdateBuildingInput) {
    const building = await Building.findById(buildingId);
    if (!building) throw new AppError(404, 'NOT_FOUND', 'Building not found');
    await ResourceScopeService.assertBuilding(auth, building, 'building.update');
    Object.assign(building, data, { updatedBy: auth.userId });
    await building.save();
    return building;
  }

  static async remove(auth: AuthenticatedUser, buildingId: string) {
    const building = await Building.findById(buildingId);
    if (!building) throw new AppError(404, 'NOT_FOUND', 'Building not found');
    await ResourceScopeService.assertBuilding(auth, building, 'building.delete');
    building.status = 'ARCHIVED';
    building.updatedBy = auth.userId;
    await building.save();
    return building;
  }
}

