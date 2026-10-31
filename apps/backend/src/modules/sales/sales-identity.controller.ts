import type { Request, Response } from "express";
import { apiResponse } from "../../core/response/apiResponse.js";
import { AppError } from "../../core/errors/AppError.js";
import { SalesIdentityService } from "./sales-identity.service.js";
import { SalesHistoryService } from "./sales-history.service.js";
import { SalesLifecycleService } from "./sales-lifecycle.service.js";
import { objectId } from "./sales-success.schemas.js";
const auth = (req: Request) => {
  if (!req.auth)
    throw new AppError(401, "AUTH_REQUIRED", "Authentication required");
  return req.auth;
};
export async function matches(req: Request, res: Response) {
  res.json(
    apiResponse(
      await SalesIdentityService.matches(
        auth(req),
        objectId.parse(req.params.id),
      ),
    ),
  );
}
export async function review(req: Request, res: Response) {
  res.json(
    apiResponse(
      await SalesIdentityService.review(
        auth(req),
        objectId.parse(req.params.id),
        req.body,
      ),
    ),
  );
}
export async function proposeMerge(req: Request, res: Response) {
  res
    .status(201)
    .json(
      apiResponse(await SalesIdentityService.proposeMerge(auth(req), req.body)),
    );
}
export async function mergeDecision(req: Request, res: Response) {
  res.json(
    apiResponse(
      await SalesIdentityService.mergeDecision(
        auth(req),
        objectId.parse(req.params.mergeId),
        req.body,
      ),
    ),
  );
}
export async function history(req: Request, res: Response) {
  res.json(
    apiResponse(
      await SalesHistoryService.page(
        auth(req),
        objectId.parse(req.params.id),
        req.query,
      ),
    ),
  );
}
export async function replay(req: Request, res: Response) {
  res
    .status(202)
    .json(apiResponse(await SalesLifecycleService.replay(auth(req), req.body)));
}
export async function projectionHealth(req: Request, res: Response) {
  res.json(
    apiResponse(
      await SalesLifecycleService.health(
        auth(req),
        objectId.parse(req.params.organizationId),
      ),
    ),
  );
}
