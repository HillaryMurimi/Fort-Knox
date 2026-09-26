import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { apiResponse } from '../../core/response/apiResponse.js';
import { AppError } from '../../core/errors/AppError.js';
import { createPropertySchema, propertyIdSchema, updatePropertySchema } from './property.schemas.js';
import { PropertyService } from './property.service.js';
import { requiredParam } from '../../core/http/params.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';

const objectId = (value: string, name: string): Types.ObjectId => {
  if (!Types.ObjectId.isValid(value)) throw new AppError(400, 'INVALID_PARAMETER', `${name} must be a valid ObjectId`);
  return new Types.ObjectId(value);
};

export async function list(req: Request, res: Response): Promise<void> {
  const organizationId = requiredParam(req.params.organizationId, 'organizationId');
  AuthorizationService.assertPermission(req.auth!, 'property.view', objectId(organizationId, 'organizationId'));
  res.json(apiResponse(await PropertyService.list(req.auth!, organizationId)));
}

export async function get(req: Request, res: Response): Promise<void> {
  const { propertyId } = propertyIdSchema.parse({ propertyId: requiredParam(req.params.propertyId, 'propertyId') });
  res.json(apiResponse(await PropertyService.get(req.auth!, propertyId)));
}

export async function create(req: Request, res: Response): Promise<void> {
  const organizationId = requiredParam(req.params.organizationId, 'organizationId');
  const orgId = objectId(organizationId, 'organizationId');
  const data = createPropertySchema.parse(req.body);
  AuthorizationService.assertCan(req.auth!, 'property.create', { organizationId: orgId });
  res.status(201).json(apiResponse(await PropertyService.create(req.auth!, organizationId, data)));
}

export async function update(req: Request, res: Response): Promise<void> {
  const propertyId = requiredParam(req.params.propertyId, 'propertyId');
  const data = updatePropertySchema.parse(req.body);
  res.json(apiResponse(await PropertyService.update(req.auth!, propertyId, data)));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const propertyId = requiredParam(req.params.propertyId, 'propertyId');
  res.json(apiResponse(await PropertyService.remove(req.auth!, propertyId)));
}
