import { Request, Response } from "express";
import { Types } from "mongoose";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  addMemberSchema,
} from "./organization.schemas.js";
import { OrganizationService } from "./organization.service.js";
import { Organization } from "../../database/models/Organization.js";
import { apiResponse } from "../../core/response/apiResponse.js";
import { AuthorizationService } from "../../core/authorization/authorization.service.js";
import { AppError } from "../../core/errors/AppError.js";
import { requiredParam } from "../../core/http/params.js";

export async function create(req: Request, res: Response) {
  const data = createOrganizationSchema.parse(req.body);
  const org = await OrganizationService.create(req.auth!.userId, data);
  res.status(201).json(apiResponse(org));
}
export async function list(req: Request, res: Response) {
  res.json(
    apiResponse(
      await OrganizationService.list(
        req.auth!.userId,
        req.auth!.isPlatformAdmin,
      ),
    ),
  );
}
export async function get(req: Request, res: Response) {
  const organizationId = requiredParam(
    req.params.organizationId,
    "organizationId",
  );
  const org = await Organization.findById(organizationId);
  if (!org) throw new AppError(404, "NOT_FOUND", "Organization not found");
  AuthorizationService.assertCan(req.auth!, "organization.view", {
    organizationId: org._id,
  });
  res.json(apiResponse(org));
}
export async function update(req: Request, res: Response) {
  const data = updateOrganizationSchema.parse(req.body);
  const organizationId = requiredParam(
    req.params.organizationId,
    "organizationId",
  );
  res.json(
    apiResponse(
      await OrganizationService.update(req.auth!, organizationId, data),
    ),
  );
}
export async function addMember(req: Request, res: Response) {
  const data = addMemberSchema.parse(req.body);
  const organizationId = requiredParam(
    req.params.organizationId,
    "organizationId",
  );
  const result = await OrganizationService.addMember(
    req.auth!,
    organizationId,
    data,
  );
  res.status(201).json(apiResponse(result));
}
export async function removeMember(req: Request, res: Response) {
  const organizationId = requiredParam(
    req.params.organizationId,
    "organizationId",
  );
  const userId = requiredParam(req.params.userId, "userId");
  const result = await OrganizationService.removeMember(
    req.auth!,
    organizationId,
    userId,
  );
  if (!result) throw new AppError(404, "NOT_FOUND", "Membership not found");
  res.json(apiResponse(result));
}
