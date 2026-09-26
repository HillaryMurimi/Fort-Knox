import type { Request, Response } from 'express';
import { apiResponse } from '../../core/response/apiResponse.js';
import * as S from './command-center.schemas.js';
import { CommandCenterService } from './command-center.service.js';
import { requiredParam } from '../../core/http/params.js';

export const dashboard = async (req: Request, res: Response) => res.json(apiResponse(await CommandCenterService.dashboard(req.auth!, requiredParam(req.params.organizationId,'organizationId'), S.dashboardQuerySchema.parse(req.query))));
export const propertyHealth = async (req: Request, res: Response) => res.json(apiResponse(await CommandCenterService.propertyHealth(req.auth!, requiredParam(req.params.organizationId,'organizationId'), requiredParam(req.params.propertyId,'propertyId'), S.dashboardQuerySchema.parse(req.query))));
export const alerts = async (req: Request, res: Response) => res.json(apiResponse(await CommandCenterService.listAlerts(req.auth!, requiredParam(req.params.organizationId,'organizationId'), S.alertQuerySchema.parse(req.query))));
export const updateAlert = async (req: Request, res: Response) => res.json(apiResponse(await CommandCenterService.updateAlert(req.auth!, requiredParam(req.params.alertId,'alertId'), S.alertStatusSchema.parse(req.body).status)));
export const evaluate = async (req: Request, res: Response) => res.status(201).json(apiResponse(await CommandCenterService.evaluate(req.auth!, requiredParam(req.params.organizationId,'organizationId'), S.dashboardQuerySchema.parse(req.body))));
export const history = async (req: Request, res: Response) => res.json(apiResponse(await CommandCenterService.healthHistory(req.auth!, requiredParam(req.params.organizationId,'organizationId'), requiredParam(req.params.propertyId,'propertyId'), Number(req.query.limit ?? 30))));
