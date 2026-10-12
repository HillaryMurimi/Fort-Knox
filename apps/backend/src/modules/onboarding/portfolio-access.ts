import { Organization } from "../../database/models/Organization.js";
import { OrganizationSubscription } from "../../database/models/OrganizationSubscription.js";
import { SubscriptionInvoice } from "../../database/models/SubscriptionInvoice.js";
import { OrganizationContract } from "../../database/models/OrganizationContract.js";
import { EntitlementService } from "../../core/billing/entitlement.service.js";
import { AppError } from "../../core/errors/AppError.js";
import type { AuthenticatedUser } from "../../core/types/auth.js";
import { assertLandlordOwner } from "./landlord-onboarding.service.js";

export async function loadPaidPortfolio(
  auth: AuthenticatedUser,
  organizationId: string,
) {
  assertLandlordOwner(auth, organizationId);
  const organization = await Organization.findById(organizationId)
    .select("+portfolioOnboarding.draft")
    .lean();
  if (!organization || organization.status !== "ACTIVE")
    throw new AppError(
      404,
      "ORGANIZATION_NOT_FOUND",
      "Active workspace not found.",
    );
  const subscription = await OrganizationSubscription.findOne({
    organizationId,
    status: "ACTIVE",
  }).lean();
  if (!subscription)
    throw new AppError(
      402,
      "PAID_ACTIVATION_REQUIRED",
      "Complete verified subscription activation before property onboarding.",
    );
  if (organization.onboarding) {
    const [contract, invoice] = await Promise.all([
      OrganizationContract.exists({
        _id: organization.onboarding.contractId,
        organizationId,
        status: "SIGNED",
      }),
      SubscriptionInvoice.exists({
        _id: organization.onboarding.invoiceId,
        organizationId,
        subscriptionId: subscription._id,
        contractId: organization.onboarding.contractId,
        status: "PAID",
      }),
    ]);
    if (
      organization.onboarding.state !== "ACTIVE" ||
      !organization.onboarding.paymentVerifiedAt ||
      !contract ||
      !invoice
    )
      throw new AppError(
        402,
        "PAID_ACTIVATION_REQUIRED",
        "The signed agreement and backend-verified payment must be complete.",
      );
  }
  // Legacy paid workspaces retain their existing billing authority; new accounts cannot use this path.
  const plan = await EntitlementService.getPlan(organizationId);
  return { organization, subscription, plan };
}
