import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { apiResponse } from '../../core/response/apiResponse.js';
import { AppError } from '../../core/errors/AppError.js';
import { requiredParam } from '../../core/http/params.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { initiateMoveOutSchema, inspectMoveOutSchema, moveOutParamsSchema, organizationParamsSchema, reconcileMoveOutSchema } from './move-out.schemas.js';
import { MoveOutService } from './move-out.service.js';
const objectId = (v: string, n: string): Types.ObjectId => { if (!Types.ObjectId.isValid(v)) throw new AppError(400, 'INVALID_PARAMETER', `${n} must be a valid ObjectId`); return new Types.ObjectId(v); };
export async function list(req: Request, res: Response): Promise<void> { const { organizationId } = organizationParamsSchema.parse({ organizationId: requiredParam(req.params.organizationId, 'organizationId') }); AuthorizationService.assertPermission(req.auth!, 'move-out.view', objectId(organizationId, 'organizationId')); res.json(apiResponse(await MoveOutService.list(req.auth!, organizationId))); }
export async function get(req: Request, res: Response): Promise<void> { const { moveOutId } = moveOutParamsSchema.parse({ moveOutId: requiredParam(req.params.moveOutId, 'moveOutId') }); res.json(apiResponse(await MoveOutService.get(req.auth!, moveOutId))); }
export async function initiate(req: Request, res: Response): Promise<void> { const tenancyId = requiredParam(req.params.tenancyId, 'tenancyId'); const data = initiateMoveOutSchema.parse(req.body); res.status(201).json(apiResponse(await MoveOutService.initiate(req.auth!, tenancyId, data))); }
export async function inspect(req: Request, res: Response): Promise<void> { const moveOutId = requiredParam(req.params.moveOutId, 'moveOutId'); const data = inspectMoveOutSchema.parse(req.body); res.json(apiResponse(await MoveOutService.inspect(req.auth!, moveOutId, data))); }
export async function reconcile(req: Request, res: Response): Promise<void> { const moveOutId = requiredParam(req.params.moveOutId, 'moveOutId'); const data = reconcileMoveOutSchema.parse(req.body); res.json(apiResponse(await MoveOutService.reconcile(req.auth!, moveOutId, data))); }
export async function complete(req: Request, res: Response): Promise<void> { const moveOutId = requiredParam(req.params.moveOutId, 'moveOutId'); res.json(apiResponse(await MoveOutService.complete(req.auth!, moveOutId))); }
