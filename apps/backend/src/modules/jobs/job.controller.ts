import type { Request, Response } from 'express'; import { apiResponse } from '../../core/response/apiResponse.js'; import { AppError } from '../../core/errors/AppError.js'; import { requiredParam } from '../../core/http/params.js'; import * as s from './job.schemas.js'; import { JobService } from './job.service.js';
import { EventDeliveryService } from '../audit/event-delivery.service.js';
export async function list(req:Request,res:Response){res.json(apiResponse(await JobService.list(req.auth!,requiredParam(req.params.organizationId,'organizationId'),s.jobQuerySchema.parse(req.query))));}
export async function enqueue(req:Request,res:Response){res.status(201).json(apiResponse(await JobService.enqueue(req.auth!,s.enqueueJobSchema.parse(req.body))));}
export async function run(req:Request,res:Response){if(!req.auth!.isPlatformAdmin)throw new AppError(403,'FORBIDDEN','Platform admin required');res.json(apiResponse(await JobService.runDueJobs()));}
export async function replayEvent(req:Request,res:Response){const {eventId}=s.replayEventSchema.parse(req.body);res.json(apiResponse(await EventDeliveryService.replay(eventId,req.auth!)));}
