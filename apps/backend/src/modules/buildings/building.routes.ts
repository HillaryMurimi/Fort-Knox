import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import * as controller from './building.controller.js';

export const buildingRouter = Router();
buildingRouter.use(requireAuth);
buildingRouter.get('/organizations/:organizationId/buildings', asyncHandler(controller.listByOrganization));
buildingRouter.post('/organizations/:organizationId/buildings', asyncHandler(controller.create));
buildingRouter.get('/properties/:propertyId/buildings', asyncHandler(controller.listByProperty));
buildingRouter.get('/buildings/:buildingId', asyncHandler(controller.get));
buildingRouter.patch('/buildings/:buildingId', asyncHandler(controller.update));
buildingRouter.delete('/buildings/:buildingId', asyncHandler(controller.remove));
