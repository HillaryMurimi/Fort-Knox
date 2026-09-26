import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import * as controller from './unit.controller.js';

export const unitRouter = Router();
unitRouter.use(requireAuth);
unitRouter.get('/organizations/:organizationId/units', asyncHandler(controller.listByOrganization));
unitRouter.post('/organizations/:organizationId/units', asyncHandler(controller.create));
unitRouter.get('/floors/:floorId/units', asyncHandler(controller.listByFloor));
unitRouter.get('/units/:unitId', asyncHandler(controller.get));
unitRouter.patch('/units/:unitId', asyncHandler(controller.update));
unitRouter.delete('/units/:unitId', asyncHandler(controller.remove));
