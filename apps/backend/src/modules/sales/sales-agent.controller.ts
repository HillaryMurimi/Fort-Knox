import type { Request, Response } from "express";
import { AppError } from "../../core/errors/AppError.js";
import { apiResponse } from "../../core/response/apiResponse.js";
import { SalesAgentService as service } from "./sales-agent.service.js";
import { objectId } from "./sales-success.schemas.js";
const auth = (req: Request) => {
  if (!req.auth)
    throw new AppError(401, "AUTH_REQUIRED", "Authentication required");
  return req.auth;
};
export async function configure(req: Request, res: Response) {
  res.json(
    apiResponse(await service.configure(auth(req), req.params.key, req.body)),
  );
}
export async function create(req: Request, res: Response) {
  res.status(201).json(apiResponse(await service.create(auth(req), req.body)));
}
export async function list(req: Request, res: Response) {
  res.json(apiResponse(await service.list(auth(req), req.query)));
}
export async function view(req: Request, res: Response) {
  res.json(
    apiResponse(
      await service.view(auth(req), objectId.parse(req.params.runId)),
    ),
  );
}
export async function control(req: Request, res: Response) {
  res.json(
    apiResponse(
      await service.control(
        auth(req),
        objectId.parse(req.params.runId),
        req.body,
      ),
    ),
  );
}
export async function approvals(req: Request, res: Response) {
  res.json(apiResponse(await service.approvalList(auth(req), req.query)));
}
export async function decide(req: Request, res: Response) {
  res.json(
    apiResponse(
      await service.decide(
        auth(req),
        objectId.parse(req.params.approvalId),
        req.body,
      ),
    ),
  );
}
