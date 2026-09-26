import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import * as c from './invitation.controller.js';
export const invitationRouter = Router();
invitationRouter.use(requireAuth);
invitationRouter.post('/organizations/:organizationId/invitations', asyncHandler(c.create));
invitationRouter.get('/organizations/:organizationId/invitations', asyncHandler(c.list));
invitationRouter.delete('/organizations/:organizationId/invitations/:invitationId', asyncHandler(c.revoke));
