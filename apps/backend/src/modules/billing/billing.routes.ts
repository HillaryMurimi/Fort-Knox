import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import * as c from './billing.controller.js';

export const billingRouter=Router();
billingRouter.use(requireAuth);
billingRouter.get('/plans',asyncHandler(c.plans));
billingRouter.post('/plans',asyncHandler(c.createPlan));
billingRouter.patch('/plans/:planId',asyncHandler(c.updatePlan));
billingRouter.get('/organizations/:organizationId/subscription',asyncHandler(c.getSubscription));
billingRouter.post('/organizations/:organizationId/subscription',asyncHandler(c.subscribe));
billingRouter.post('/organizations/:organizationId/subscription/change-plan',asyncHandler(c.changePlan));
billingRouter.post('/organizations/:organizationId/subscription/cancel',asyncHandler(c.cancel));
billingRouter.get('/organizations/:organizationId/invoices',asyncHandler(c.invoices));
billingRouter.post('/organizations/:organizationId/invoices/:invoiceId/mark-paid',asyncHandler(c.markInvoicePaid));
billingRouter.get('/organizations/:organizationId/usage',asyncHandler(c.usage));
billingRouter.post('/organizations/:organizationId/usage',asyncHandler(c.recordUsage));
billingRouter.get('/organizations/:organizationId/entitlements',asyncHandler(c.entitlements));
