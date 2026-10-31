import { AppError } from "../../core/errors/AppError.js";
import type { Request, Response } from "express";
import { apiResponse } from "../../core/response/apiResponse.js";
import { SalesSuccessService as service } from "./sales-success.service.js";
import { SalesDelegationService } from "./sales-delegation.service.js";
import { objectId } from "./sales-success.schemas.js";
function principal(req: Request) {
  if (!req.auth)
    throw new AppError(401, "AUTH_REQUIRED", "Authentication required");
  return req.auth;
}
const id = (req: Request) => objectId.parse(req.params.id);
export async function list(req: Request, res: Response) {
  res.json(apiResponse(await service.list(principal(req), req.query)));
}
export async function create(req: Request, res: Response) {
  res
    .status(201)
    .json(apiResponse(await service.create(principal(req), req.body)));
}
export async function view(req: Request, res: Response) {
  res.json(apiResponse(await service.view(principal(req), id(req))));
}
export async function update(req: Request, res: Response) {
  res.json(
    apiResponse(await service.update(principal(req), id(req), req.body)),
  );
}
export async function note(req: Request, res: Response) {
  res
    .status(201)
    .json(apiResponse(await service.note(principal(req), id(req), req.body)));
}
export async function assign(req: Request, res: Response) {
  res.json(
    apiResponse(await service.assign(principal(req), id(req), req.body)),
  );
}
export async function link(req: Request, res: Response) {
  res.json(apiResponse(await service.link(principal(req), id(req), req.body)));
}
export async function meeting(req: Request, res: Response) {
  res
    .status(201)
    .json(
      apiResponse(await service.meeting(principal(req), id(req), req.body)),
    );
}
export async function outcome(req: Request, res: Response) {
  res.json(
    apiResponse(
      await service.outcome(
        principal(req),
        id(req),
        objectId.parse(req.params.meetingId),
        req.body,
      ),
    ),
  );
}
export async function monitor(req: Request, res: Response) {
  res.json(apiResponse(await service.monitor(principal(req), id(req))));
}
export async function agents(req: Request, res: Response) {
  res.json(apiResponse(service.agents(principal(req))));
}
export async function context(req: Request, res: Response) {
  res.json(
    apiResponse(await service.context(principal(req), id(req), req.body)),
  );
}
export async function grant(req: Request, res: Response) {
  res.json(
    apiResponse(await SalesDelegationService.grant(principal(req), req.body)),
  );
}
