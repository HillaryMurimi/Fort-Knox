import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import * as controller from './tenant.controller.js';

export const tenantRouter = Router();
tenantRouter.use(requireAuth);
tenantRouter.get('/organizations/:organizationId/tenants', asyncHandler(controller.list));
tenantRouter.post('/organizations/:organizationId/tenants', asyncHandler(controller.create));
tenantRouter.get('/tenants/:tenantId', asyncHandler(controller.get));
tenantRouter.patch('/tenants/:tenantId', asyncHandler(controller.update));
