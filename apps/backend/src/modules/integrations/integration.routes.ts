import {Router} from 'express'; import {requireAuth} from '../../middleware/auth.middleware.js'; import {asyncHandler} from '../../core/http/asyncHandler.js'; import * as c from './integration.controller.js';
export const integrationRouter=Router();
integrationRouter.post('/webhooks/:provider',asyncHandler(c.webhook));
integrationRouter.use(requireAuth);
integrationRouter.post('/payments/:paymentId/provider-initiate',asyncHandler(c.initiatePayment));
integrationRouter.post('/payments/:paymentId/provider-reconcile',asyncHandler(c.reconcilePayment));
integrationRouter.post('/organizations/:organizationId/storage/signed-url',asyncHandler(c.signedUrl));
integrationRouter.get('/organizations/:organizationId/cctv/provider-health',asyncHandler(c.cctvHealth));
integrationRouter.get('/integrations/health',asyncHandler(c.health));
