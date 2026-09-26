import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { apiResponse } from '../../core/response/apiResponse.js';
import { AppError } from '../../core/errors/AppError.js';
import { requiredParam } from '../../core/http/params.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { TenantService } from './tenant.service.js';
import { createTenantSchema, organizationParamsSchema, tenantParamsSchema, updateTenantSchema } from './tenant.schemas.js';

const objectId = (value: string, name: string): Types.ObjectId => {
  if (!Types.ObjectId.isValid(value)) throw new AppError(400, 'INVALID_PARAMETER', `${name} must be a valid ObjectId`);
  return new Types.ObjectId(value);
};

export async function list(req: Request, res: Response): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse({ organizationId: requiredParam(req.params.organizationId, 'organizationId') });
  AuthorizationService.assertPermission(req.auth!, 'tenant.view', objectId(organizationId, 'organizationId'));
  res.json(apiResponse(await TenantService.list(req.auth!, organizationId)));
}
export async function get(req: Request, res: Response): Promise<void> {
  const { tenantId } = tenantParamsSchema.parse({ tenantId: requiredParam(req.params.tenantId, 'tenantId') });
  res.json(apiResponse(await TenantService.get(req.auth!, tenantId)));
}
export async function create(req: Request, res: Response): Promise<void> {
  const organizationId = requiredParam(req.params.organizationId, 'organizationId');
  const data = createTenantSchema.parse(req.body);
  res.status(201).json(apiResponse(await TenantService.create(req.auth!, organizationId, data)));
}
export async function update(req: Request, res: Response): Promise<void> {
  const tenantId = requiredParam(req.params.tenantId, 'tenantId');
  const data = updateTenantSchema.parse(req.body);
  res.json(apiResponse(await TenantService.update(req.auth!, tenantId, data)));
}
