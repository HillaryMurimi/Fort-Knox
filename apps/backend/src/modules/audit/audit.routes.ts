import { Router } from 'express'; import { requireAuth } from '../../middleware/auth.middleware.js'; import { asyncHandler } from '../../core/http/asyncHandler.js'; import * as c from './audit.controller.js';
export const auditRouter=Router(); auditRouter.use(requireAuth); auditRouter.get('/audit-logs',asyncHandler(c.list)); auditRouter.get('/domain-events',asyncHandler(c.events));
