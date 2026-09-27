import { Request, Response } from 'express';
import { apiResponse } from '../../core/response/apiResponse.js';
import { AppError } from '../../core/errors/AppError.js';
import { BillingService } from './billing.service.js';
import { cancelSubscriptionSchema, changePlanSchema, createPlanSchema, createSubscriptionSchema, listInvoiceSchema, recordUsageSchema, updatePlanSchema } from './billing.schemas.js';
import { requiredParam } from '../../core/http/params.js';

export async function plans(req: Request,res:Response){ res.json(apiResponse(await BillingService.listPlans(req.query.activeOnly !== 'false'))); }
export async function createPlan(req: Request,res:Response){ res.status(201).json(apiResponse(await BillingService.createPlan(req.auth!, createPlanSchema.parse(req.body)))); }
export async function updatePlan(req: Request,res:Response){ res.json(apiResponse(await BillingService.updatePlan(req.auth!, requiredParam(req.params.planId,'planId'), updatePlanSchema.parse(req.body)))); }
export async function getSubscription(req: Request,res:Response){ res.json(apiResponse(await BillingService.getSubscription(req.auth!,requiredParam(req.params.organizationId,'organizationId')))); }
export async function subscribe(req: Request,res:Response){ const data=createSubscriptionSchema.parse(req.body); res.status(201).json(apiResponse(await BillingService.subscribe(req.auth!,requiredParam(req.params.organizationId,'organizationId'),data.planKey,data.provider,data.email))); }
export async function recoverCheckout(req: Request,res:Response){ res.json(apiResponse(await BillingService.recoverCheckout(req.auth!,requiredParam(req.params.organizationId,'organizationId')))); }
export async function changePlan(req: Request,res:Response){ const data=changePlanSchema.parse(req.body); res.json(apiResponse(await BillingService.changePlan(req.auth!,requiredParam(req.params.organizationId,'organizationId'),data.planKey,data.atPeriodEnd))); }
export async function markInvoicePaid(req: Request,res:Response){ const amount=Number(req.body.amount); if(!Number.isFinite(amount)||amount<0) throw new AppError(400,'INVALID_AMOUNT','Invalid invoice payment amount'); res.json(apiResponse(await BillingService.markInvoicePaid(req.auth!,requiredParam(req.params.organizationId,'organizationId'),requiredParam(req.params.invoiceId,'invoiceId'),amount))); }
export async function cancel(req: Request,res:Response){ const data=cancelSubscriptionSchema.parse(req.body); res.json(apiResponse(await BillingService.cancel(req.auth!,requiredParam(req.params.organizationId,'organizationId'),data.atPeriodEnd))); }
export async function invoices(req: Request,res:Response){ const q=listInvoiceSchema.parse(req.query); res.json(apiResponse(await BillingService.listInvoices(req.auth!,requiredParam(req.params.organizationId,'organizationId'),q))); }
export async function recordUsage(req: Request,res:Response){ res.status(201).json(apiResponse(await BillingService.recordUsage(req.auth!,requiredParam(req.params.organizationId,'organizationId'),recordUsageSchema.parse(req.body)))); }
export async function usage(req: Request,res:Response){ const end=new Date(); const start=new Date(end); start.setUTCMonth(start.getUTCMonth()-1); res.json(apiResponse(await BillingService.usageSnapshot(req.auth!,requiredParam(req.params.organizationId,'organizationId'),start,end))); }
export async function entitlements(req: Request,res:Response){ res.json(apiResponse(await BillingService.entitlements(req.auth!,requiredParam(req.params.organizationId,'organizationId')))); }
