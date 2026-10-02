import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { defaultContractDraft } from './contract-default.js';
import type { Request, Response } from 'express';
import { apiResponse } from '../../core/response/apiResponse.js';
import { requiredParam } from '../../core/http/params.js';
import { LandlordOnboardingService as service } from './landlord-onboarding.service.js';
import { ContractTemplateService } from './contract-template.service.js';
import { templateStatusSchema } from './landlord-onboarding.schemas.js';
import { z } from 'zod';
const org = (req: Request) => requiredParam(req.params.organizationId, 'organizationId');
export async function status(req: Request, res: Response) { res.json(apiResponse(await service.status(req.auth!, org(req)))); }
export async function configure(req: Request, res: Response) { res.json(apiResponse(await service.configure(req.auth!, org(req), req.body))); }
export async function generate(req: Request, res: Response) { res.json(apiResponse(await service.generate(req.auth!, org(req), req.body))); }
export async function replace(req: Request, res: Response) { res.json(apiResponse(await service.generate(req.auth!, org(req), req.body, true))); }
export async function sign(req: Request, res: Response) { res.json(apiResponse(await service.sign(req.auth!, org(req), req.body, { requestId: req.requestId, ipAddress: req.ip, userAgent: req.header('user-agent')?.slice(0, 1000) }))); }
export async function checkout(req: Request, res: Response) { res.json(apiResponse(await service.checkout(req.auth!, org(req)))); }
export async function recover(req: Request, res: Response) { res.json(apiResponse(await service.recover(req.auth!, org(req)))); }
export async function oversight(req: Request, res: Response) { const page = z.coerce.number().int().positive().parse(req.query.page ?? 1); res.json(apiResponse(await service.oversight(req.auth!, page))); }
export async function templates(req: Request, res: Response) { res.json(apiResponse(await ContractTemplateService.list(req.auth!))); }
export async function createTemplate(req: Request, res: Response) { res.status(201).json(apiResponse(await ContractTemplateService.create(req.auth!, req.body))); }
export async function templateStatus(req: Request, res: Response) { res.json(apiResponse(await ContractTemplateService.status(req.auth!, requiredParam(req.params.templateVersionId, 'templateVersionId'), templateStatusSchema.parse(req.body).status))); }

export async function quote(req:Request,res:Response){res.json(apiResponse(await service.quote(req.auth!,org(req),String(req.query.planKey),Number(req.query.prepaidMonths))));}

export async function templateDraft(req:Request,res:Response){AuthorizationService.assertPlatformAdmin(req.auth!);res.json(apiResponse(defaultContractDraft));}
