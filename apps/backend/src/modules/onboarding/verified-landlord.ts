import type { AuthenticatedUser } from "../../core/types/auth.js";
import { User } from "../../database/models/User.js";
import { AppError } from "../../core/errors/AppError.js";
import { assertLandlordOwner } from "./landlord-onboarding.service.js";

export async function assertVerifiedLandlordEmail(
  auth: AuthenticatedUser,
  organizationId: string,
) {
  assertLandlordOwner(auth, organizationId);
  const owner = await User.findOne({ _id: auth.userId, status: "ACTIVE" })
    .select("email emailVerifiedAt")
    .lean();
  if (!owner?.email || !owner.emailVerifiedAt)
    throw new AppError(
      403,
      "VERIFIED_EMAIL_REQUIRED",
      "Verify your registered email before signing or starting checkout.",
    );
  return owner;
}
