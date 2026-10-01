import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { apiResponse } from '../../core/response/apiResponse.js';
import { requiredParam } from '../../core/http/params.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { demoRequestSchema, organizationParamsSchema, propertyOnboardingRequestSchema } from './sales.schemas.js';
import { SalesService } from './sales.service.js';

export async function requestDemo(req: Request, res: Response): Promise<void> {
  const input = demoRequestSchema.parse(req.body);
  res.status(201).json(apiResponse(await SalesService.requestDemo(input)));
}

export async function requestPropertyOnboarding(req: Request, res: Response): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse({ organizationId: requiredParam(req.params.organizationId, 'organizationId') });
  const orgId = new Types.ObjectId(organizationId);
  AuthorizationService.assertPermission(req.auth!, 'property.create', orgId);
  const input = propertyOnboardingRequestSchema.parse(req.body);
  res.status(201).json(apiResponse(await SalesService.requestPropertyOnboarding(req.auth!, organizationId, input)));
}