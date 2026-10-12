import type { Request, Response } from "express";
import { apiResponse } from "../../core/response/apiResponse.js";
import { AcquisitionFunnelService } from "./acquisition-funnel.service.js";
import { AcquisitionService } from "./acquisition.service.js";
export async function plans(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.json(apiResponse(await AcquisitionService.catalog(req.query)));
}
export async function event(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.json(apiResponse(await AcquisitionService.recordPublic(req.body)));
}

export async function funnel(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.json(
    apiResponse(await AcquisitionFunnelService.report(req.auth!, req.query)),
  );
}
