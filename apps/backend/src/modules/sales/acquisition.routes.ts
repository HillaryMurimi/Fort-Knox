import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { asyncHandler } from "../../core/http/asyncHandler.js";
import * as controller from "./acquisition.controller.js";
export const publicAcquisitionRouter = Router();
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
