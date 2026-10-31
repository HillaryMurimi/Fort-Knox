import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { asyncHandler } from "../../core/http/asyncHandler.js";
import * as controller from "./acquisition.controller.js";
import * as campaigns from './sales-campaign.controller.js';
export const publicAcquisitionRouter = Router();
const trackingLimit = rateLimit({ windowMs: 60000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false });
publicAcquisitionRouter.post('/acquisition/referrals/resolve', trackingLimit, asyncHandler(campaigns.resolve));
publicAcquisitionRouter.post('/acquisition/referrals/visits', trackingLimit, asyncHandler(campaigns.visit));
publicAcquisitionRouter.get(
  "/acquisition/plans",
  asyncHandler(controller.plans),
);
publicAcquisitionRouter.post(
  "/acquisition/events",
  rateLimit({
    windowMs: 60000,
    limit: 40,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
  asyncHandler(controller.event),
);

publicAcquisitionRouter.get(
  "/platform-control/acquisition-funnel",
  requireAuth,
  asyncHandler(controller.funnel),
);
