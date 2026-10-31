import mongoose from "mongoose";
import { z } from "zod";
import type { AuthenticatedUser } from "../../core/types/auth.js";
import { assertFreshAdmin } from "../auth/admin-security.js";
import { AppError } from "../../core/errors/AppError.js";
import { Role } from "../../database/models/Role.js";
import { OrganizationMembership } from "../../database/models/OrganizationMembership.js";
import { AuditService } from "../audit/audit.service.js";
import { objectId, salesPermissions } from "./sales-success.schemas.js";

export function isSuccessPermission(permission: string) {
  // Guided-demo delegation predates this module and retains its existing policy.
  return permission.startsWith("sales.") && permission !== "sales.demo.manage";
}
export function assertSalesGrantAuthority(
  auth: AuthenticatedUser,
  permissions: readonly string[],
) {
  if (permissions.some(isSuccessPermission) && !auth.isPlatformAdmin)
    throw new AppError(
      403,
      "SALES_DELEGATION_ADMIN_REQUIRED",
      "Only SUPER_ADMIN can change or assign sales permissions",
    );
}
export class SalesDelegationService {
  static async grant(auth: AuthenticatedUser, raw: unknown) {
    assertFreshAdmin(auth);
    const input = z
      .object({
        organizationId: objectId,
        userId: objectId,
        permissions: z
          .array(z.enum(salesPermissions))
          .max(salesPermissions.length),
      })
      .strict()
      .parse(raw);
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        const membership = await OrganizationMembership.findOne({
          organizationId: input.organizationId,
          userId: input.userId,
          status: "ACTIVE",
        }).session(session);
        if (!membership || !membership.scope?.allProperties)
          throw new AppError(
            400,
            "SALES_MEMBERSHIP_REQUIRED",
            "An active organization-wide staff membership is required",
          );
        const key = `SALES_DELEGATE_${input.userId.toUpperCase()}`;
        const role = await Role.findOneAndUpdate(
          { organizationId: input.organizationId, key, system: false },
          {
            $set: {
              name: "Assigned customer sales access",
              permissions: [...new Set(input.permissions)],
              assignable: false,
            },
          },
          { upsert: true, returnDocument: "after", session },
        );
        if (!membership.roleIds.some((r) => String(r) === String(role._id)))
          membership.roleIds.push(role._id);
        await membership.save({ session });
        await AuditService.record(
          {
            actorUserId: auth.userId,
            organizationId: membership.organizationId,
            action: "sales.permissions.changed",
            resourceType: "User",
            resourceId: membership.userId,
            metadata: {
              permissions: input.permissions,
              roleId: String(role._id),
            },
          },
          session,
        );
        return {
          granted: input.permissions,
          recordScope: "ASSIGNED_CUSTOMERS_ONLY",
        };
      });
    } finally {
      await session.endSession();
    }
  }
}
