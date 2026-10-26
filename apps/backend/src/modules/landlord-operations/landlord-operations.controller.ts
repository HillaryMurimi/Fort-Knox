import type { Request, Response } from 'express';
import { apiResponse } from '../../core/response/apiResponse.js';
import { requiredParam } from '../../core/http/params.js';
import { LandlordOperationsService } from './landlord-operations.service.js';
import type { HydratedDocument } from 'mongoose';
import type { AdminSupportSessionDocument } from '../../database/models/AdminSupportSession.js';

const org = (req: Request) => requiredParam(req.params.organizationId, 'organizationId');
const support = (req: Request) => requiredParam(req.params.supportId, 'supportId');
const publicSupport = (session: HydratedDocument<AdminSupportSessionDocument>) => {
  const { adminSessionId: _adminSessionId, ...visible } = session.toObject();
  return visible;
};

export async function directory(req: Request, res: Response) { res.json(apiResponse(await LandlordOperationsService.directory(req.auth!, req.query))); }
export async function overview(req: Request, res: Response) { res.json(apiResponse(await LandlordOperationsService.overview(req.auth!))); }
export async function createOrganization(req: Request, res: Response) { res.status(201).json(apiResponse(await LandlordOperationsService.createOrganization(req.auth!, req.body))); }
export async function detail(req: Request, res: Response) { res.json(apiResponse(await LandlordOperationsService.detail(req.auth!, org(req)))); }
export async function requestSupport(req: Request, res: Response) { res.status(201).json(apiResponse(publicSupport(await LandlordOperationsService.requestSupport(req.auth!, req.body)))); }
export async function listSupport(req: Request, res: Response) { res.json(apiResponse(await LandlordOperationsService.listSupport(req.auth!, org(req)))); }
export async function approveSupport(req: Request, res: Response) { res.json(apiResponse(publicSupport(await LandlordOperationsService.decideSupport(req.auth!, support(req), true)))); }
export async function rejectSupport(req: Request, res: Response) { res.json(apiResponse(publicSupport(await LandlordOperationsService.decideSupport(req.auth!, support(req), false)))); }
export async function endSupport(req: Request, res: Response) { res.json(apiResponse(publicSupport(await LandlordOperationsService.endSupport(req.auth!, support(req))))); }
export async function addUnit(req: Request, res: Response) { res.status(201).json(apiResponse(await LandlordOperationsService.addUnit(req.auth!, support(req), req.body))); }
export async function createPropertySetup(req: Request, res: Response) { res.status(201).json(apiResponse(await LandlordOperationsService.createPropertySetup(req.auth!, support(req), req.body))); }
export async function grantPilot(req: Request, res: Response) { res.status(201).json(apiResponse(await LandlordOperationsService.grantPilot(req.auth!, org(req), req.body))); }
export async function extendPilot(req: Request, res: Response) { res.json(apiResponse(await LandlordOperationsService.extendPilot(req.auth!, org(req), req.body))); }
export async function terminatePilot(req: Request, res: Response) { res.json(apiResponse(await LandlordOperationsService.terminatePilot(req.auth!, org(req)))); }
export async function prepareConversion(req: Request, res: Response) { res.json(apiResponse(await LandlordOperationsService.prepareConversion(req.auth!, org(req), req.body))); }
