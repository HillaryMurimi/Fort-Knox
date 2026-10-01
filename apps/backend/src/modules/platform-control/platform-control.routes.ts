import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import * as controller from './platform-control.controller.js';

export const platformControlRouter = Router();
platformControlRouter.use(requireAuth);
platformControlRouter.get('/switches', asyncHandler(controller.list));
platformControlRouter.patch('/switches/:key', asyncHandler(controller.update));