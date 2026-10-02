import { Router } from 'express'; import { requireAuth } from '../../middleware/auth.middleware.js'; import { asyncHandler } from '../../core/http/asyncHandler.js'; import * as c from './document.controller.js';
export const documentRouter=Router(); documentRouter.use(requireAuth); documentRouter.get('/organizations/:organizationId/documents',asyncHandler(c.list)); documentRouter.post('/organizations/:organizationId/documents',asyncHandler(c.create)); documentRouter.get('/documents/:documentId',asyncHandler(c.get)); documentRouter.patch('/documents/:documentId',asyncHandler(c.update));

documentRouter.get('/documents/:documentId/pdf',asyncHandler(c.artifact));
