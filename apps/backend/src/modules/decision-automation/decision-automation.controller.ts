import type { Request, Response } from 'express';
import { apiResponse } from '../../core/response/apiResponse.js';
import * as S from './decision-automation.schemas.js';
import { DecisionAutomationService } from './decision-automation.service.js';
import { requiredParam } from '../../core/http/params.js';

export const overview=async(req:Request,res:Response)=>res.json(apiResponse(await DecisionAutomationService.overview(req.auth!,requiredParam(req.params.organizationId,'organizationId'),S.periodSchema.parse(req.query))));
export const evaluate=async(req:Request,res:Response)=>res.status(201).json(apiResponse(await DecisionAutomationService.evaluate(req.auth!,requiredParam(req.params.organizationId,'organizationId'),S.periodSchema.parse(req.body))));
export const bootstrap=async(req:Request,res:Response)=>res.status(201).json(apiResponse(await DecisionAutomationService.bootstrap(req.auth!,requiredParam(req.params.organizationId,'organizationId'))));
export const policy=async(req:Request,res:Response)=>res.json(apiResponse(await DecisionAutomationService.getPolicy(req.auth!,requiredParam(req.params.organizationId,'organizationId'))));
export const updatePolicy=async(req:Request,res:Response)=>res.json(apiResponse(await DecisionAutomationService.updatePolicy(req.auth!,requiredParam(req.params.organizationId,'organizationId'),S.policySchema.parse(req.body))));
export const actions=async(req:Request,res:Response)=>res.json(apiResponse(await DecisionAutomationService.listActions(req.auth!,requiredParam(req.params.organizationId,'organizationId'),S.actionQuerySchema.parse(req.query))));
export const updateAction=async(req:Request,res:Response)=>res.json(apiResponse(await DecisionAutomationService.updateAction(req.auth!,requiredParam(req.params.actionId,'actionId'),S.actionStatusSchema.parse(req.body).status)));
export const tenantRisks=async(req:Request,res:Response)=>res.json(apiResponse(await DecisionAutomationService.listTenantRisks(req.auth!,requiredParam(req.params.organizationId,'organizationId'),S.tenantRiskQuerySchema.parse(req.query))));
export const vacancyForecasts=async(req:Request,res:Response)=>res.json(apiResponse(await DecisionAutomationService.listVacancyForecasts(req.auth!,requiredParam(req.params.organizationId,'organizationId'),S.vacancyQuerySchema.parse(req.query))));
