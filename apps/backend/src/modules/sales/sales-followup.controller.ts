import type { Request, Response } from 'express';
import { AppError } from '../../core/errors/AppError.js';
import { apiResponse } from '../../core/response/apiResponse.js';
import { objectId } from './sales-success.schemas.js';
import { SalesFollowUpService } from './sales-followup.service.js';
import { SalesFollowUpPolicyService } from './sales-followup-policy.service.js';
function auth(req: Request) { if (!req.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication required'); return req.auth; }
export async function policies(req: Request, res: Response) { res.json(apiResponse(await SalesFollowUpPolicyService.list(auth(req), req.query))); }
export async function createPolicy(req: Request, res: Response) { res.status(201).json(apiResponse(await SalesFollowUpPolicyService.create(auth(req), req.body))); }
export async function decidePolicy(req: Request, res: Response) { res.json(apiResponse(await SalesFollowUpPolicyService.decide(auth(req), objectId.parse(req.params.policyId), req.body))); }
export async function list(req: Request, res: Response) { res.json(apiResponse(await SalesFollowUpService.list(auth(req), objectId.parse(req.params.id), req.query))); }
export async function options(req: Request, res: Response) { res.json(apiResponse(await SalesFollowUpService.options(auth(req), objectId.parse(req.params.id), req.query))); }
export async function enroll(req: Request, res: Response) { res.status(201).json(apiResponse(await SalesFollowUpService.enroll(auth(req), objectId.parse(req.params.id), req.body))); }
export async function control(req: Request, res: Response) { res.json(apiResponse(await SalesFollowUpService.control(auth(req), objectId.parse(req.params.id), objectId.parse(req.params.planId), req.body))); }
