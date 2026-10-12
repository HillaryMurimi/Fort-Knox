import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { asyncHandler } from "../../core/http/asyncHandler.js";
import * as controller from "./portfolio-onboarding.controller.js";
export const portfolioOnboardingRouter = Router();
const base = "/organizations/:organizationId/portfolio-onboarding";
portfolioOnboardingRouter.use(base, requireAuth);
portfolioOnboardingRouter.get(base, asyncHandler(controller.progress));
portfolioOnboardingRouter.put(base + "/draft", asyncHandler(controller.draft));
portfolioOnboardingRouter.post(
  base + "/dashboard-visit",
  asyncHandler(controller.dashboard),
);
portfolioOnboardingRouter.post(
  base + "/import/preview",
  asyncHandler(controller.preview),
);
portfolioOnboardingRouter.post(
  base + "/import/confirm",
  asyncHandler(controller.confirm),
);
