import type { Request, Response } from 'express'; import { apiResponse } from '../../core/response/apiResponse.js'; import * as s from './audit.schemas.js'; import { AuditService } from './audit.service.js';
export async function list(req:Request,res:Response){res.json(apiResponse(await AuditService.list(req.auth!,s.auditQuerySchema.parse(req.query))));}
export async function events(req:Request,res:Response){res.json(apiResponse(await AuditService.listEvents(req.auth!,s.eventQuerySchema.parse(req.query))));}
