import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { apiResponse } from '../../core/response/apiResponse.js';
import { AppError } from '../../core/errors/AppError.js';
import { requiredParam } from '../../core/http/params.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { FloorService } from './floor.service.js';
import { createFloorSchema, updateFloorSchema } from './floor.schemas.js';
import { BuildingService } from '../buildings/building.service.js';

const id = (value: string, name: string): Types.ObjectId => {
  if (!Types.ObjectId.isValid(value)) throw new AppError(400, 'INVALID_PARAMETER', `${name} must be a valid ObjectId`);
  return new Types.ObjectId(value);
};

export async function listByBuilding(req: Request, res: Response): Promise<void> {
  const buildingId = requiredParam(req.params.buildingId, 'buildingId');
  const building = await BuildingService.get(req.auth!, buildingId);
  res.json(apiResponse(await FloorService.list(req.auth!, String(building.organizationId), buildingId)));
}

export async function listByOrganization(req: Request, res: Response): Promise<void> {
  const organizationId = requiredParam(req.params.organizationId, 'organizationId');
  const orgId = id(organizationId, 'organizationId');
  AuthorizationService.assertPermission(req.auth!, 'floor.view', orgId);
  res.json(apiResponse(await FloorService.list(req.auth!, organizationId)));
}

export async function get(req: Request, res: Response): Promise<void> {
  res.json(apiResponse(await FloorService.get(req.auth!, requiredParam(req.params.floorId, 'floorId'))));
}

export async function create(req: Request, res: Response): Promise<void> {
  const data = createFloorSchema.parse(req.body);
  const organizationId = requiredParam(req.params.organizationId, 'organizationId');
  res.status(201).json(apiResponse(await FloorService.create(req.auth!, organizationId, data)));
}

export async function update(req: Request, res: Response): Promise<void> {
  const data = updateFloorSchema.parse(req.body);
  res.json(apiResponse(await FloorService.update(req.auth!, requiredParam(req.params.floorId, 'floorId'), data)));
}

export async function remove(req: Request, res: Response): Promise<void> {
  res.json(apiResponse(await FloorService.remove(req.auth!, requiredParam(req.params.floorId, 'floorId'))));
}
