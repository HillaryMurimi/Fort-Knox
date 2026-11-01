import type { Request, Response } from 'express';
import { apiResponse } from '../../core/response/apiResponse.js';
import { AppError } from '../../core/errors/AppError.js';
import { objectId } from './sales-success.schemas.js';
import { SalesOutreachService as service } from './sales-outreach.service.js';
import { SalesConsentService } from './sales-consent.service.js';
import { SalesOutreachWebhookService } from './sales-outreach-webhook.service.js';
const auth = (req: Request) => { if (!req.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication required'); return req.auth; };
export async function capabilities(req: Request, res: Response) { res.json(apiResponse(await service.capabilities(auth(req)))); }
export async function list(req: Request, res: Response) { res.json(apiResponse(await service.list(auth(req), objectId.parse(req.params.id), req.query))); }
export async function view(req: Request, res: Response) { res.json(apiResponse(await service.view(auth(req), objectId.parse(req.params.id), objectId.parse(req.params.messageId)))); }
export async function prepare(req: Request, res: Response) { res.status(201).json(apiResponse(await service.prepare(auth(req), objectId.parse(req.params.id), req.body))); }
export async function decide(req: Request, res: Response) { res.json(apiResponse(await service.decide(auth(req), objectId.parse(req.params.id), objectId.parse(req.params.messageId), req.body))); }
export async function conversation(req: Request, res: Response) { res.json(apiResponse(await service.conversations(auth(req), objectId.parse(req.params.id), req.query))); }
export async function consents(req: Request, res: Response) { res.json(apiResponse(await SalesConsentService.list(auth(req), objectId.parse(req.params.id), req.query))); }
export async function consent(req: Request, res: Response) { res.status(201).json(apiResponse(await SalesConsentService.record(auth(req), objectId.parse(req.params.id), req.body))); }
export async function unsubscribe(req: Request, res: Response) { res.setHeader('Cache-Control', 'no-store'); res.json(apiResponse(await service.unsubscribe(req.body))); }
export async function webhook(req: Request, res: Response) {
  const body = (req as Request & { rawBody?: Buffer }).rawBody;
  const headers = { id: req.get('svix-id'), timestamp: req.get('svix-timestamp'), signature: req.get('svix-signature') };
  res.setHeader('Cache-Control', 'no-store'); res.status(202).json(apiResponse(await SalesOutreachWebhookService.receive(body, headers)));
}
