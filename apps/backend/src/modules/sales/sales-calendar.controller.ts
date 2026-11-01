import type { Request, Response } from 'express';
import { AppError } from '../../core/errors/AppError.js';
import { apiResponse } from '../../core/response/apiResponse.js';
import { objectId } from './sales-success.schemas.js';
import { SalesCalendarService } from './sales-calendar.service.js';
function auth(req: Request) { if (!req.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication required'); return req.auth; }
export async function availability(req: Request, res: Response) { res.json(apiResponse(await SalesCalendarService.availability(auth(req), objectId.parse(req.params.id), req.query))); }
export async function command(req: Request, res: Response) { res.status(202).json(apiResponse(await SalesCalendarService.command(auth(req), objectId.parse(req.params.id), objectId.parse(req.params.meetingId), req.body))); }
