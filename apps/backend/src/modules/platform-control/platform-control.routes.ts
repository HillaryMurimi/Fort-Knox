import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import * as controller from './platform-control.controller.js';
import * as business from './platform-business.controller.js';

export const platformControlRouter = Router();
platformControlRouter.use(requireAuth);
platformControlRouter.get('/business-intelligence',asyncHandler(business.businessOverview));
platformControlRouter.get('/business-intelligence/drill-down',asyncHandler(business.businessDrill));
platformControlRouter.post('/morning-briefs',asyncHandler(business.generateBrief));
platformControlRouter.get('/morning-briefs',asyncHandler(business.briefHistory));
platformControlRouter.get('/morning-briefs/:id',asyncHandler(business.getBrief));
platformControlRouter.get('/switches', asyncHandler(controller.list));
platformControlRouter.patch('/switches/:key', asyncHandler(controller.update));
platformControlRouter.get('/launch-readiness', asyncHandler(controller.launchReadiness));
platformControlRouter.patch('/launch-readiness/:key', asyncHandler(controller.updateLaunchReadiness));

platformControlRouter.get('/monitoring', asyncHandler(controller.monitoringOverview));
platformControlRouter.get('/monitoring/alerts', asyncHandler(controller.monitoringAlerts));
platformControlRouter.get('/monitoring/alerts/:id/history', asyncHandler(controller.monitoringHistory));
platformControlRouter.patch('/monitoring/alerts/:id', asyncHandler(controller.monitoringReview));
platformControlRouter.get('/monitoring/maintenance-windows', asyncHandler(controller.monitoringWindows));
platformControlRouter.post('/monitoring/maintenance-windows', asyncHandler(controller.monitoringCreateWindow));
platformControlRouter.post('/monitoring/maintenance-windows/:id/end', asyncHandler(controller.monitoringEndWindow));
