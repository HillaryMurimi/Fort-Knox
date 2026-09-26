import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { OperationsService } from './operations.service.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';

export const operationsRouter = Router();

operationsRouter.get('/readiness', asyncHandler(async (_req, res) => {
  const result = await OperationsService.readiness();
  return res.status(result.status === 'ready' ? 200 : 503).json({ success: result.status === 'ready', data: result });
}));

operationsRouter.get('/diagnostics', requireAuth, asyncHandler(async (req, res) => {
  AuthorizationService.assertPlatformAdmin(req.auth!);
  return res.json({ success: true, data: await OperationsService.diagnostics() });
}));
