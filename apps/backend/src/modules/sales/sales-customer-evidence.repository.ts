import { Types } from "mongoose";
import { AppError } from "../../core/errors/AppError.js";
import { Organization } from "../../database/models/Organization.js";
import { User } from "../../database/models/User.js";
import { Property } from "../../database/models/Property.js";
import { Building } from "../../database/models/Building.js";
import { Floor } from "../../database/models/Floor.js";
import { Unit } from "../../database/models/Unit.js";
import { DomainEvent } from "../../database/models/DomainEvent.js";
import { OrganizationSubscription } from "../../database/models/OrganizationSubscription.js";
import { SubscriptionInvoice } from "../../database/models/SubscriptionInvoice.js";
import { OrganizationContract } from "../../database/models/OrganizationContract.js";
import { onboardingProgress } from "./sales-success.calculations.js";
// Internal read projection. Callers establish customer or system projection scope first.
export const SalesCustomerEvidenceRepository = {
  async monitor(orgId: Types.ObjectId) {
    const org = await Organization.findById(orgId)
      .select("onboarding portfolioOnboarding createdAt")
      .lean();
    if (!org)
      throw new AppError(
        404,
        "ORGANIZATION_NOT_FOUND",
        "Linked organization unavailable",
      );
    const organizationId = org._id;
    const [
      properties,
      buildings,
      floors,
      units,
      subscription,
      invoice,
      contract,
      owner,
      events,
      latestUnit,
      latestProperty,
      latestBuilding,
      latestFloor,
    ] = await Promise.all([
      Property.countDocuments({ organizationId, status: { $ne: "ARCHIVED" } }),
      Building.countDocuments({ organizationId, status: "ACTIVE" }),
      Floor.countDocuments({ organizationId, status: "ACTIVE" }),
      Unit.countDocuments({ organizationId, status: { $ne: "INACTIVE" } }),
      OrganizationSubscription.findOne({ organizationId })
        .select("_id status providerCheckoutReference")
        .lean(),
      org.onboarding?.invoiceId
        ? SubscriptionInvoice.findOne({
            _id: org.onboarding.invoiceId,
            organizationId,
          })
            .select(
              "_id status provider providerInvoiceId subscriptionId contractId paidAt",
            )
            .lean()
        : null,
      org.onboarding?.contractId
        ? OrganizationContract.findOne({
            _id: org.onboarding.contractId,
            organizationId,
          })
            .select("_id status")
            .lean()
        : null,
      org.onboarding?.ownerUserId
        ? User.findById(org.onboarding.ownerUserId)
            .select("emailVerifiedAt lastLoginAt")
            .lean()
        : null,
      DomainEvent.find({ organizationId })
        .select("eventId name occurredAt")
        .sort({ occurredAt: -1 })
        .limit(100)
        .lean(),
      Unit.findOne({ organizationId })
        .select("createdAt")
        .sort({ createdAt: -1 })
        .lean(),
      Property.findOne({ organizationId })
        .select("createdAt")
        .sort({ createdAt: -1 })
        .lean(),
      Building.findOne({ organizationId })
        .select("createdAt")
        .sort({ createdAt: -1 })
        .lean(),
      Floor.findOne({ organizationId })
        .select("createdAt")
        .sort({ createdAt: -1 })
        .lean(),
    ]);
    const verifiedPayment = !!(
      org.onboarding?.paymentVerifiedAt &&
      invoice?.status === "PAID" &&
      invoice.provider === "PAYSTACK" &&
      invoice.providerInvoiceId &&
      contract?.status === "SIGNED" &&
      String(invoice.contractId) === String(contract._id) &&
      subscription &&
      String(invoice.subscriptionId) === String(subscription._id)
    );
    const progress = onboardingProgress(org.onboarding?.unitCount, units);
    const lastActivity = new Date(
      Math.max(
        ...[
          org.createdAt,
          org.portfolioOnboarding?.draftSavedAt,
          org.onboarding?.stateChangedAt,
          latestUnit?.createdAt,
          latestProperty?.createdAt,
          latestBuilding?.createdAt,
          latestFloor?.createdAt,
        ]
          .filter((v): v is Date => v instanceof Date)
          .map(Number),
      ),
    );
    const stalled =
      progress.completionPercent !== 100 &&
      Date.now() - lastActivity.getTime() > 72 * 3600000;
    return {
      linked: true as const,
      organizationId: String(organizationId),
      registered: true,
      emailVerified: !!owner?.emailVerifiedAt,
      lastLoginAt: owner?.lastLoginAt,
      selectedPlan: org.onboarding?.selectedPlanKey ?? null,
      contractStatus: contract?.status ?? "NONE",
      checkoutStarted: !!subscription?.providerCheckoutReference,
      verifiedPayment,
      verificationEvidence: verifiedPayment && invoice && contract && subscription ? {
        invoiceId: invoice._id, contractId: contract._id, subscriptionId: subscription._id,
        verifiedAt: org.onboarding?.paymentVerifiedAt,
      } : null,
      subscriptionStatus: subscription?.status ?? "NONE",
      properties,
      buildings,
      floors,
      ...progress,
      lastActivity,
      stalled,
      stallThresholdHours: 72,
      assistance: stalled
        ? "Review incomplete onboarding and offer assistance after checking consent."
        : null,
      health: {
        type: "RULE_BASED",
        factors: [
          { label: "Email verified", achieved: !!owner?.emailVerifiedAt },
          { label: "Payment verified", achieved: verifiedPayment },
          {
            label: "Subscription active",
            achieved: subscription?.status === "ACTIVE",
          },
          {
            label: "Expected units configured",
            achieved: progress.completionPercent === 100,
          },
          { label: "Onboarding active", achieved: !stalled },
        ],
      },
      events,
      eventLimit: 100,
    };
  },
};
