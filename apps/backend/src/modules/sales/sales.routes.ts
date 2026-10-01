import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import * as controller from './sales.controller.js';

export const salesRouter = Router();
salesRouter.post('/demo-requests', asyncHandler(controller.requestDemo));
salesRouter.use(requireAuth);
salesRouter.post('/organizations/:organizationId/property-onboarding-requests', asyncHandler(controller.requestPropertyOnboarding));