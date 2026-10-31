import type { ClientSession } from "mongoose";
import type { AuthenticatedUser } from "../../core/types/auth.js";
import { AppError } from "../../core/errors/AppError.js";
import { SalesLead } from "../../database/models/SalesLead.js";
import { salesPermissions } from "./sales-success.schemas.js";

export function assertSuccessPermission(
  auth: AuthenticatedUser,
  permission: string,
) {
  if (auth.isPlatformAdmin) return;
  if (
    !salesPermissions.includes(
      permission as (typeof salesPermissions)[number],
    ) ||
    !auth.memberships.some(
      (m) => m.scope.allProperties && m.permissions.includes(permission),
    )
  )
    throw new AppError(
      403,
      "SALES_PERMISSION_REQUIRED",
      "Explicit sales permission is required",
    );
}
export function customerScope(auth: AuthenticatedUser) {
  return auth.isPlatformAdmin ? {} : { assignedTo: auth.userId };
}
export const SuccessRepository = {
  async load(
    auth: AuthenticatedUser,
    id: string,
    permission: string,
    session?: ClientSession,
  ) {
    assertSuccessPermission(auth, permission);
    const record = await SalesLead.findOne({
      _id: id,
      ...customerScope(auth),
    }).session(session ?? null);
    if (!record)
      throw new AppError(
        404,
        "CUSTOMER_NOT_FOUND",
        "Customer not found or not assigned to you",
      );
    return record;
  },
};
