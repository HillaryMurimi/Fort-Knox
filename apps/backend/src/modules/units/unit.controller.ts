import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { apiResponse } from '../../core/response/apiResponse.js';
import { AppError } from '../../core/errors/AppError.js';
import { requiredParam } from '../../core/http/params.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { UnitService } from './unit.service.js';
import { createUnitSchema, updateUnitSchema } from './unit.schemas.js';
import { FloorService } from '../floors/floor.service.js';

const id = (value: string, name: string): Types.ObjectId => {
  if (!Types.ObjectId.isValid(value)) throw new AppError(400, 'INVALID_PARAMETER', `${name} must be a valid ObjectId`);
  return new Types.ObjectId(value);
};

export async function listByFloor(req: Request, res: Response): Promise<void> {
  const floorId = requiredParam(req.params.floorId, 'floorId');
  const floor = await FloorService.get(req.auth!, floorId);
  res.json(apiResponse(await UnitService.list(req.auth!, String(floor.organizationId), floorId)));
}

export async function listByOrganization(req: Request, res: Response): Promise<void> {
  const organizationId = requiredParam(req.params.organizationId, 'organizationId');
  const orgId = id(organizationId, 'organizationId');
  AuthorizationService.assertPermission(req.auth!, 'unit.view', orgId);
  res.json(apiResponse(await UnitService.list(req.auth!, organizationId)));
}

export async function get(req: Request, res: Response): Promise<void> {
  res.json(apiResponse(await UnitService.get(req.auth!, requiredParam(req.params.unitId, 'unitId'))));
}

export async function create(req: Request, res: Response): Promise<void> {
  const data = createUnitSchema.parse(req.body);
  const organizationId = requiredParam(req.params.organizationId, 'organizationId');
  res.status(201).json(apiResponse(await UnitService.create(req.auth!, organizationId, data)));
}

export async function update(req: Request, res: Response): Promise<void> {
  const data = updateUnitSchema.parse(req.body);
  res.json(apiResponse(await UnitService.update(req.auth!, requiredParam(req.params.unitId, 'unitId'), data)));
}

export async function remove(req: Request, res: Response): Promise<void> {
  res.json(apiResponse(await UnitService.remove(req.auth!, requiredParam(req.params.unitId, 'unitId'))));
}
