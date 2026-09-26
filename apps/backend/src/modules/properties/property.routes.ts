import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import * as controller from './property.controller.js';

export const propertyRouter = Router();
propertyRouter.use(requireAuth);
propertyRouter.get('/organizations/:organizationId/properties', asyncHandler(controller.list));
propertyRouter.post('/organizations/:organizationId/properties', asyncHandler(controller.create));
propertyRouter.get('/properties/:propertyId', asyncHandler(controller.get));
propertyRouter.patch('/properties/:propertyId', asyncHandler(controller.update));
propertyRouter.delete('/properties/:propertyId', asyncHandler(controller.remove));
