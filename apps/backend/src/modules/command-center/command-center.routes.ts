import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import * as c from './command-center.controller.js';

export const commandCenterRouter = Router();
commandCenterRouter.use(requireAuth);
commandCenterRouter.get('/organizations/:organizationId/command-center', asyncHandler(c.dashboard));
commandCenterRouter.get('/organizations/:organizationId/properties/:propertyId/health', asyncHandler(c.propertyHealth));
commandCenterRouter.get('/organizations/:organizationId/intelligence/alerts', asyncHandler(c.alerts));
commandCenterRouter.post('/organizations/:organizationId/intelligence/evaluate', asyncHandler(c.evaluate));
commandCenterRouter.patch('/intelligence/alerts/:alertId', asyncHandler(c.updateAlert));
commandCenterRouter.get('/organizations/:organizationId/properties/:propertyId/health/history', asyncHandler(c.history));
