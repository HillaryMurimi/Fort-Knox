import type { Request, Response } from "express";
import { apiResponse } from "../../core/response/apiResponse.js";
import { requiredParam } from "../../core/http/params.js";
import { PortfolioOnboardingService as service } from "./portfolio-onboarding.service.js";
import { PilotImportService } from "../sales/pilot-import.service.js";
const org = (req: Request) =>
  requiredParam(req.params.organizationId, "organizationId");
export async function progress(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.json(apiResponse(await service.progress(req.auth!, org(req))));
}
export async function draft(req: Request, res: Response) {
  res.json(apiResponse(await service.saveDraft(req.auth!, org(req), req.body)));
}
export async function dashboard(req: Request, res: Response) {
  res.json(
    apiResponse(await service.dashboardVisited(req.auth!, org(req), req.body)),
  );
}
export async function preview(req: Request, res: Response) {
  res.json(
    apiResponse(
      await PilotImportService.previewPaid(req.auth!, org(req), req.body),
    ),
  );
}
export async function confirm(req: Request, res: Response) {
  res
    .status(201)
    .json(
      apiResponse(
        await PilotImportService.confirmPaid(req.auth!, org(req), req.body),
      ),
    );
}
