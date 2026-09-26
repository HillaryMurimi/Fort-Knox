import { Router } from 'express'; import { asyncHandler } from '../../core/http/asyncHandler.js'; import { requireAuth } from '../../middleware/auth.middleware.js'; import { requirePermission } from '../../middleware/authorization.middleware.js'; import * as c from './organization.controller.js';
export const organizationRouter = Router();
organizationRouter.use(requireAuth);
organizationRouter.get('/', asyncHandler(c.list));
organizationRouter.post('/', asyncHandler(c.create));
organizationRouter.get('/:organizationId', asyncHandler(c.get));
organizationRouter.patch('/:organizationId', asyncHandler(c.update));
organizationRouter.post('/:organizationId/members', asyncHandler(c.addMember));
organizationRouter.delete('/:organizationId/members/:userId', asyncHandler(c.removeMember));
