import type { ClientSession } from "mongoose";
import type { AuthenticatedUser } from "../../core/types/auth.js";
import { AppError } from "../../core/errors/AppError.js";
import { SalesLead } from "../../database/models/SalesLead.js";
import { salesPermissions } from "./sales-success.schemas.js";
import { SalesMeeting } from '../../database/models/SalesMeeting.js';
import { User } from '../../database/models/User.js';
import { Types } from 'mongoose';

export async function lockSalesRepresentative(id: string, session: ClientSession) {
  const representative = await User.findOneAndUpdate({ _id: id, status: 'ACTIVE' }, { $inc: { salesCalendarRevision: 1 } }, { session });
  if (!representative) throw new AppError(404, 'USER_NOT_FOUND', 'Active representative not found');
  return representative;
}
export async function salesMeetingConflict(representativeId: string, startsAt: Date, endsAt: Date, session: ClientSession, excluding?: string) {
  return SalesMeeting.exists({ representativeId, ...(excluding ? { _id: { $ne: new Types.ObjectId(excluding) } } : {}), $or: [
    { status: 'SCHEDULED', startsAt: { $lt: endsAt }, endsAt: { $gt: startsAt } },
    { 'calendar.status': 'PENDING', 'calendar.operation': { $in: ['CREATE', 'RESCHEDULE'] }, 'calendar.targetStart': { $lt: endsAt }, 'calendar.targetEnd': { $gt: startsAt } },
  ] }).session(session);
}

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
    if (record.mergedInto) throw new AppError(409, 'CUSTOMER_MERGED', 'Customer was merged; use its authorized canonical profile');
    return record;
  },
};
