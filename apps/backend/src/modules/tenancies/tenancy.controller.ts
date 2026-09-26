import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { apiResponse } from '../../core/response/apiResponse.js';
import { AppError } from '../../core/errors/AppError.js';
import { requiredParam } from '../../core/http/params.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { createTenancySchema, organizationParamsSchema, tenancyParamsSchema, updateTenancySchema } from './tenancy.schemas.js';
import { TenancyService } from './tenancy.service.js';
const objectId = (v: string, n: string): Types.ObjectId => { if (!Types.ObjectId.isValid(v)) throw new AppError(400, 'INVALID_PARAMETER', `${n} must be a valid ObjectId`); return new Types.ObjectId(v); };
export async function list(req: Request, res: Response): Promise<void> { const { organizationId } = organizationParamsSchema.parse({ organizationId: requiredParam(req.params.organizationId, 'organizationId') }); AuthorizationService.assertPermission(req.auth!, 'tenancy.view', objectId(organizationId, 'organizationId')); res.json(apiResponse(await TenancyService.list(req.auth!, organizationId))); }
export async function get(req: Request, res: Response): Promise<void> { const { tenancyId } = tenancyParamsSchema.parse({ tenancyId: requiredParam(req.params.tenancyId, 'tenancyId') }); res.json(apiResponse(await TenancyService.get(req.auth!, tenancyId))); }
export async function create(req: Request, res: Response): Promise<void> { const organizationId = requiredParam(req.params.organizationId, 'organizationId'); const data = createTenancySchema.parse(req.body); res.status(201).json(apiResponse(await TenancyService.create(req.auth!, organizationId, data))); }
export async function update(req: Request, res: Response): Promise<void> { const tenancyId = requiredParam(req.params.tenancyId, 'tenancyId'); const data = updateTenancySchema.parse(req.body); res.json(apiResponse(await TenancyService.update(req.auth!, tenancyId, data))); }
export async function activate(req: Request, res: Response): Promise<void> { const tenancyId = requiredParam(req.params.tenancyId, 'tenancyId'); res.json(apiResponse(await TenancyService.activate(req.auth!, tenancyId))); }
export async function terminate(req: Request, res: Response): Promise<void> { const tenancyId = requiredParam(req.params.tenancyId, 'tenancyId'); res.json(apiResponse(await TenancyService.terminate(req.auth!, tenancyId))); }
