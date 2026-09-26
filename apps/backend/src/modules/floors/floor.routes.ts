import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import * as controller from './floor.controller.js';

export const floorRouter = Router();
floorRouter.use(requireAuth);
floorRouter.get('/organizations/:organizationId/floors', asyncHandler(controller.listByOrganization));
floorRouter.post('/organizations/:organizationId/floors', asyncHandler(controller.create));
floorRouter.get('/buildings/:buildingId/floors', asyncHandler(controller.listByBuilding));
floorRouter.get('/floors/:floorId', asyncHandler(controller.get));
floorRouter.patch('/floors/:floorId', asyncHandler(controller.update));
floorRouter.delete('/floors/:floorId', asyncHandler(controller.remove));
