import { Types } from 'mongoose';
import { Floor } from '../../database/models/Floor.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { ResourceScopeService } from '../../core/authorization/resource-scope.service.js';
import { AppError } from '../../core/errors/AppError.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import type { CreateFloorInput, UpdateFloorInput } from './floor.schemas.js';
import { Building } from '../../database/models/Building.js';

export class FloorService {
  static async list(auth: AuthenticatedUser, organizationId: string, buildingId?: string) {
    const orgId = new Types.ObjectId(organizationId);
    const ids = await ResourceScopeService.scopedFloorIds(auth, orgId);
    const filter: Record<string, unknown> = { organizationId: orgId };
    if (ids) filter._id = { $in: ids };
    if (buildingId) filter.buildingId = new Types.ObjectId(buildingId);
    return Floor.find(filter).sort({ buildingId: 1, level: 1 }).lean();
  }

  static async get(auth: AuthenticatedUser, floorId: string) {
    const floor = await Floor.findById(floorId);
    if (!floor) throw new AppError(404, 'NOT_FOUND', 'Floor not found');
    await ResourceScopeService.assertFloor(auth, floor, 'floor.view');
    return floor;
  }

  static async create(auth: AuthenticatedUser, organizationId: string, data: CreateFloorInput) {
    const orgId = new Types.ObjectId(organizationId);
    const building = await Building.findOne({ _id: data.buildingId, organizationId: orgId });
    if (!building) throw new AppError(404, 'NOT_FOUND', 'Parent building not found');
    AuthorizationService.assertCan(auth, 'floor.create', { organizationId: orgId, propertyId: building.propertyId, buildingId: building._id });
    return Floor.create({ ...data, organizationId: orgId, propertyId: building.propertyId, buildingId: building._id, createdBy: auth.userId, updatedBy: auth.userId });
  }

  static async update(auth: AuthenticatedUser, floorId: string, data: UpdateFloorInput) {
    const floor = await Floor.findById(floorId);
    if (!floor) throw new AppError(404, 'NOT_FOUND', 'Floor not found');
    await ResourceScopeService.assertFloor(auth, floor, 'floor.update');
    Object.assign(floor, data, { updatedBy: auth.userId });
    await floor.save();
    return floor;
  }

  static async remove(auth: AuthenticatedUser, floorId: string) {
    const floor = await Floor.findById(floorId);
    if (!floor) throw new AppError(404, 'NOT_FOUND', 'Floor not found');
    await ResourceScopeService.assertFloor(auth, floor, 'floor.delete');
    floor.status = 'ARCHIVED';
    floor.updatedBy = auth.userId;
    await floor.save();
    return floor;
  }
}
