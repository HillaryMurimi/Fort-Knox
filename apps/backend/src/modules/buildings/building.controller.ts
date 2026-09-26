import type { Request, Response } from 'express';
import { apiResponse } from '../../core/response/apiResponse.js';
import { AppError } from '../../core/errors/AppError.js';
import { Types } from 'mongoose';
import { BuildingService } from './building.service.js';
import { createBuildingSchema, updateBuildingSchema } from './building.schemas.js';
import { PropertyService } from '../properties/property.service.js';
import { requiredParam } from '../../core/http/params.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';

const id = (value: string, name: string): Types.ObjectId => {
  if (!Types.ObjectId.isValid(value)) throw new AppError(400, 'INVALID_PARAMETER', `${name} must be a valid ObjectId`);
  return new Types.ObjectId(value);
};

export async function listByProperty(req: Request, res: Response): Promise<void> {
  const propertyId = requiredParam(req.params.propertyId, 'propertyId');
  const property = await PropertyService.get(req.auth!, propertyId);
  res.json(apiResponse(await BuildingService.list(req.auth!, String(property.organizationId), propertyId)));
}

export async function listByOrganization(req: Request, res: Response): Promise<void> {
  const organizationId = requiredParam(req.params.organizationId, 'organizationId');
  const orgId = id(organizationId, 'organizationId');
  AuthorizationService.assertPermission(req.auth!, 'building.view', orgId);
  res.json(apiResponse(await BuildingService.list(req.auth!, organizationId)));
}

export async function get(req: Request, res: Response): Promise<void> {
  res.json(apiResponse(await BuildingService.get(req.auth!, requiredParam(req.params.buildingId, 'buildingId'))));
}

export async function create(req: Request, res: Response): Promise<void> {
  const organizationId = requiredParam(req.params.organizationId, 'organizationId');
  const data = createBuildingSchema.parse(req.body);
  res.status(201).json(apiResponse(await BuildingService.create(req.auth!, organizationId, data)));
}

export async function update(req: Request, res: Response): Promise<void> {
  const data = updateBuildingSchema.parse(req.body);
  res.json(apiResponse(await BuildingService.update(req.auth!, requiredParam(req.params.buildingId, 'buildingId'), data)));
}

export async function remove(req: Request, res: Response): Promise<void> {
  res.json(apiResponse(await BuildingService.remove(req.auth!, requiredParam(req.params.buildingId, 'buildingId'))));
}
