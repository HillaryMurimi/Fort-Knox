import type { Request, Response } from "express";
import { apiResponse } from "../../core/response/apiResponse.js";
import { requiredParam } from "../../core/http/params.js";
import { SalesDemoService } from "./sales-demo.service.js";
import { GuidedPilotService } from "./guided-pilot.service.js";
import { PilotImportService } from "./pilot-import.service.js";
const id = (req: Request) => requiredParam(req.params.id, "id");
const org = (req: Request) =>
  requiredParam(req.params.organizationId, "organizationId");
export async function catalog(req: Request, res: Response) {
  res.json(apiResponse(await SalesDemoService.catalog(req.auth!)));
}
export async function list(req: Request, res: Response) {
  res.json(apiResponse(await SalesDemoService.list(req.auth!, req.query)));
}
export async function prepare(req: Request, res: Response) {
  res
    .status(201)
    .json(apiResponse(await SalesDemoService.prepare(req.auth!, req.body)));
}
export async function view(req: Request, res: Response) {
  res.json(apiResponse(await SalesDemoService.view(req.auth!, id(req))));
}
export async function command(req: Request, res: Response) {
  res.json(
    apiResponse(await SalesDemoService.command(req.auth!, id(req), req.body)),
  );
}
export async function startPilot(req: Request, res: Response) {
  res
    .status(201)
    .json(
      apiResponse(await GuidedPilotService.start(req.auth!, id(req), req.body)),
    );
}
export async function pilotProgress(req: Request, res: Response) {
  res.json(apiResponse(await GuidedPilotService.progress(req.auth!, org(req))));
}
export async function importPreview(req: Request, res: Response) {
  res.json(
    apiResponse(
      await PilotImportService.preview(req.auth!, org(req), req.body),
    ),
  );
}
export async function importConfirm(req: Request, res: Response) {
  res
    .status(201)
    .json(
      apiResponse(
        await PilotImportService.confirm(req.auth!, org(req), req.body),
      ),
    );
}
export async function salesIntelligence(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.json(
    apiResponse(await GuidedPilotService.intelligence(req.auth!, req.query)),
  );
}

export const pilotInsight = async (req: Request, res: Response) => {
  res.json(
    apiResponse(
      await GuidedPilotService.reviewInsight(req.auth!, org(req), req.body),
    ),
  );
};
