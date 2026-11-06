import type { Request, Response } from 'express';
import { AppError } from '../../core/errors/AppError.js';
import { apiResponse } from '../../core/response/apiResponse.js';
import { SalesRevenueService } from './sales-revenue.service.js';
import { objectId } from './sales-success.schemas.js';
function auth(req: Request) { if (!req.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication required'); return req.auth; }
export async function overview(req: Request, res: Response) { res.json(apiResponse(await SalesRevenueService.overview(auth(req), req.query))); }
export async function list(req: Request, res: Response) { res.json(apiResponse(await SalesRevenueService.list(auth(req), req.query))); }
export async function view(req: Request, res: Response) { res.json(apiResponse(await SalesRevenueService.view(auth(req), objectId.parse(req.params.targetId)))); }
export async function create(req: Request, res: Response) { res.status(201).json(apiResponse(await SalesRevenueService.create(auth(req), req.body))); }
export async function update(req: Request, res: Response) { res.json(apiResponse(await SalesRevenueService.update(auth(req), objectId.parse(req.params.targetId), req.body))); }
export async function historical(req: Request, res: Response) { res.json(apiResponse(await SalesRevenueService.historical(auth(req), req.query))); }
export async function movements(req: Request, res: Response) { res.json(apiResponse(await SalesRevenueService.movements(auth(req), req.query))); }
export async function movementSource(req: Request, res: Response) { res.json(apiResponse(await SalesRevenueService.movementSource(auth(req), objectId.parse(req.params.movementId)))); }
