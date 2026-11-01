import type { Request, Response } from 'express';
import { apiResponse } from '../../core/response/apiResponse.js';
import { SalesCampaignService as service } from './sales-campaign.service.js';
export async function list(req: Request, res: Response) { res.json(apiResponse(await service.list(req.auth!, req.query))); }
export async function create(req: Request, res: Response) { res.status(201).json(apiResponse(await service.create(req.auth!, req.body))); }
export async function update(req: Request, res: Response) { res.json(apiResponse(await service.update(req.auth!, String(req.params.id), req.body))); }
export async function command(req: Request, res: Response) { res.json(apiResponse(await service.command(req.auth!, String(req.params.id), req.body))); }
export async function links(req: Request, res: Response) { res.json(apiResponse(await service.links(req.auth!, String(req.params.id), req.query))); }
export async function createLink(req: Request, res: Response) { res.status(201).json(apiResponse(await service.createLink(req.auth!, String(req.params.id), req.body))); }
export async function revoke(req: Request, res: Response) { res.json(apiResponse(await service.revokeLink(req.auth!, String(req.params.linkId)))); }
export async function resolve(req: Request, res: Response) { res.setHeader('Cache-Control', 'no-store'); res.json(apiResponse(await service.resolve(req.body))); }
export async function visit(req: Request, res: Response) { res.setHeader('Cache-Control', 'no-store'); res.json(apiResponse(await service.visit(req.body))); }
