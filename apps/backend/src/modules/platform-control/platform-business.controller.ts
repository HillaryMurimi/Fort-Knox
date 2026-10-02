import type { Request, Response } from "express";
import { apiResponse } from "../../core/response/apiResponse.js";
import { AppError } from "../../core/errors/AppError.js";
import { requiredParam } from "../../core/http/params.js";
import { PlatformBusinessService as service } from "./platform-business.service.js";
const principal = (req: Request) => {
  if (!req.auth)
    throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
  return req.auth;
};
export async function businessOverview(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.json(apiResponse(await service.overview(principal(req), req.query)));
}
export async function businessDrill(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.json(apiResponse(await service.drill(principal(req), req.query)));
}
export async function generateBrief(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res
    .status(201)
    .json(apiResponse(await service.generateBrief(principal(req), req.body)));
}
export async function briefHistory(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.json(apiResponse(await service.history(principal(req), req.query)));
}
export async function getBrief(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.json(
    apiResponse(
      await service.brief(
        principal(req),
        requiredParam(req.params.id, "id"),
        req.query,
      ),
    ),
  );
}
