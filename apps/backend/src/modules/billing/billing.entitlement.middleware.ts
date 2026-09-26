import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../core/errors/AppError.js';
import { BillingService } from './billing.service.js';
import { requiredParam } from '../../core/http/params.js';

export function requireFeature(feature: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const organizationId = requiredParam(req.params.organizationId, 'organizationId');
      await BillingService.assertFeature(organizationId, feature);
      next();
    } catch (error) { next(error); }
  };
}
