import { Types } from "mongoose";
import { Organization } from "../../database/models/Organization.js";
import { OrganizationMembership } from "../../database/models/OrganizationMembership.js";
import { Role } from "../../database/models/Role.js";
import { AppError } from "../../core/errors/AppError.js";
import { AuthorizationService } from "../../core/authorization/authorization.service.js";
import { AuditService } from "../audit/audit.service.js";
import type { AuthenticatedUser } from "../../core/types/auth.js";
import type { UpdateOrganizationInput } from "./organization.schemas.js";

export class OrganizationService {
  static async create(
    authUserId: Types.ObjectId,
    data: { name: string; slug: string },
  ) {
    const organization = await Organization.create(data);
    const landlord = await Role.findOne({
      key: "LANDLORD",
      system: true,
      organizationId: null,
    });
    if (!landlord)
      throw new AppError(
        500,
        "SYSTEM_ROLE_MISSING",
        "LANDLORD system role is not configured",
      );
    await OrganizationMembership.create({
      userId: authUserId,
      organizationId: organization._id,
      roleIds: [landlord._id],
      scope: {
        allProperties: true,
        propertyIds: [],
        buildingIds: [],
        unitIds: [],
      },
      joinedAt: new Date(),
    });
    return organization;
  }
  static async list(authUserId: Types.ObjectId, isPlatformAdmin: boolean) {
    if (isPlatformAdmin) return Organization.find().sort({ createdAt: -1 });
    const memberships = await OrganizationMembership.find({
      userId: authUserId,
      status: "ACTIVE",
    })
      .select("organizationId")
      .lean();
    return Organization.find({
      _id: { $in: memberships.map((m) => m.organizationId) },
    }).sort({ createdAt: -1 });
  }
  static async update(
    auth: AuthenticatedUser,
    organizationId: string,
    data: UpdateOrganizationInput,
  ) {
    if (data.name !== undefined || data.slug !== undefined)
      AuthorizationService.assertCan(auth, "organization.update", {
        organizationId,
      });
    if (data.settings !== undefined || data.regionalProfile !== undefined)
      AuthorizationService.assertCan(auth, "organization.settings.manage", {
        organizationId,
      });
    const organization = await Organization.findById(organizationId);
    if (!organization)
      throw new AppError(404, "NOT_FOUND", "Organization not found");
    const before = organization.toObject();
    if (data.name !== undefined) organization.name = data.name;
    if (data.slug !== undefined) organization.slug = data.slug;
    if (data.settings !== undefined)
      organization.settings = {
        ...(organization.settings as Record<string, unknown>),
        ...data.settings,
      };
    if (data.regionalProfile !== undefined) {
      organization.regionalProfile = {
        ...organization.regionalProfile,
        ...data.regionalProfile,
      };
    }
    await organization.save();
    await AuditService.record({
      organizationId: organization._id,
      actorUserId: auth.userId,
      action: "organization.updated",
      resourceType: "Organization",
      resourceId: organization._id,
      before,
      after: organization.toObject(),
      metadata: { settingsChanged: data.settings !== undefined, regionalProfileChanged: data.regionalProfile !== undefined },
    });
    return organization;
  }
  static async addMember(
    auth: NonNullable<Express.Request["auth"]>,
    organizationId: string,
    data: {
      userId: string;
      roleIds: string[];
      scope: {
        allProperties: boolean;
        propertyIds: string[];
        buildingIds: string[];
        unitIds: string[];
      };
    },
  ) {
    AuthorizationService.assertCan(auth, "organization.members.manage", {
      organizationId,
    });
    AuthorizationService.assertCan(auth, "role.assign", { organizationId });
    const roles = await Role.find({
      _id: { $in: data.roleIds },
      $or: [{ organizationId: null, system: true }, { organizationId }],
    }).lean();
    if (roles.length !== data.roleIds.length)
      throw new AppError(
        400,
        "INVALID_ROLES",
        "One or more roles are not assignable in this organization",
      );
    return OrganizationMembership.findOneAndUpdate(
      { userId: data.userId, organizationId },
      {
        roleIds: data.roleIds,
        scope: data.scope,
        status: "ACTIVE",
        invitedBy: auth.userId,
        joinedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  static async removeMember(
    auth: NonNullable<Express.Request["auth"]>,
    organizationId: string,
    userId: string,
  ) {
    AuthorizationService.assertCan(auth, "organization.members.manage", {
      organizationId,
    });
    return OrganizationMembership.findOneAndUpdate(
      { userId, organizationId },
      { status: "REMOVED" },
      { new: true },
    );
  }
}
