import type { Request, Response } from 'express';
import { apiResponse } from '../../core/response/apiResponse.js';
import { requiredParam } from '../../core/http/params.js';
import { createInvitationSchema } from './invitation.schemas.js';
import { InvitationService } from './invitation.service.js';
export async function create(req: Request, res: Response) { const organizationId = requiredParam(req.params.organizationId, 'organizationId'); const data = createInvitationSchema.parse(req.body); res.status(201).json(apiResponse(await InvitationService.create(req.auth!, organizationId, data))); }
export async function list(req: Request, res: Response) { const organizationId = requiredParam(req.params.organizationId, 'organizationId'); res.json(apiResponse(await InvitationService.list(req.auth!, organizationId))); }
export async function revoke(req: Request, res: Response) { const organizationId = requiredParam(req.params.organizationId, 'organizationId'); const invitationId = requiredParam(req.params.invitationId, 'invitationId'); res.json(apiResponse(await InvitationService.revoke(req.auth!, organizationId, invitationId))); }
