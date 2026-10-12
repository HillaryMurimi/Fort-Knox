import mongoose from "mongoose";
import type { AuthenticatedUser } from "../../core/types/auth.js";
import { AppError } from "../../core/errors/AppError.js";
import { Organization } from "../../database/models/Organization.js";
import { Property } from "../../database/models/Property.js";
import { Unit } from "../../database/models/Unit.js";
import { Tenant } from "../../database/models/Tenant.js";
import { Tenancy } from "../../database/models/Tenancy.js";
import { TenantOnboarding } from "../../database/models/TenantOnboarding.js";
import { OrganizationMembership } from "../../database/models/OrganizationMembership.js";
import { Role } from "../../database/models/Role.js";
import { AuditLog } from "../../database/models/AuditLog.js";
import { AuditService } from "../audit/audit.service.js";
import { loadPaidPortfolio } from "./portfolio-access.js";
import {
  portfolioDraftSchema,
  dashboardVisitSchema,
} from "./portfolio-onboarding.schemas.js";

export class PortfolioOnboardingService {
  static async progress(auth: AuthenticatedUser, organizationId: string) {
    const { organization: org, plan } = await loadPaidPortfolio(
      auth,
      organizationId,
    );
    const filter = { organizationId: org._id },
      now = new Date();
    const staffRoles = await Role.find({
      key: { $in: ["CARETAKER", "PROPERTY_MANAGER"] },
      system: true,
    })
      .select("_id")
      .lean();
    const [
      properties,
      propertyCount,
      unitGroups,
      tenants,
      pendingTenants,
      unverifiedTenants,
      staff,
      tenancyFacts,
      firstImport,
    ] = await Promise.all([
      Property.find({ ...filter, status: { $ne: "ARCHIVED" } })
        .select("_id name code createdAt")
        .sort({ createdAt: 1 })
        .limit(50)
        .lean(),
      Property.countDocuments({ ...filter, status: { $ne: "ARCHIVED" } }),
      Unit.aggregate([
        { $match: { ...filter, status: { $ne: "INACTIVE" } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Tenant.countDocuments({ ...filter, status: { $ne: "INACTIVE" } }),
      TenantOnboarding.countDocuments({
        ...filter,
        status: { $in: ["PRE_REGISTERED", "OTP_SENT", "VERIFIED"] },
        expiresAt: { $gt: now },
      }),
      Tenant.aggregate([
        { $match: { ...filter, status: { $ne: "INACTIVE" } } },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "contact",
          },
        },
        { $unwind: "$contact" },
        {
          $match: {
            "contact.emailVerifiedAt": { $eq: null },
            "contact.phoneVerifiedAt": { $eq: null },
          },
        },
        { $count: "count" },
      ]),
      OrganizationMembership.countDocuments({
        ...filter,
        status: "ACTIVE",
        roleIds: { $in: staffRoles.map((role) => role._id) },
      }),
      Tenancy.aggregate([
        {
          $match: {
            ...filter,
            status: { $in: ["ACTIVE", "NOTICE"] },
            startDate: { $lte: now },
            $or: [
              { endDate: { $exists: false } },
              { endDate: null },
              { endDate: { $gte: now } },
            ],
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            rentMinor: {
              $sum: { $round: [{ $multiply: ["$monthlyRent", 100] }, 0] },
            },
          },
        },
      ]),
      AuditLog.findOne({ ...filter, action: "portfolio.bulk_import.completed" })
        .select("occurredAt")
        .sort({ occurredAt: 1 })
        .lean(),
    ]);
    const count = (status: string) =>
      Number(unitGroups.find((group) => group._id === status)?.count ?? 0);
    const units = unitGroups.reduce(
        (sum, group) => sum + Number(group.count),
        0,
      ),
      occupied = count("OCCUPIED"),
      vacant = count("VACANT");
    const knownTenancies = Number(tenancyFacts[0]?.count ?? 0),
      firstDashboardAt = org.portfolioOnboarding?.firstDashboardAt;
    const checks = [
      {
        key: "profile",
        label: "Business profile and verified activation",
        done: true,
        required: true,
        href: "/onboarding?review=1",
      },
      {
        key: "property",
        label: "Add a property",
        done: propertyCount > 0,
        required: true,
        href: "/get-started?step=PROPERTY",
      },
      {
        key: "units",
        label: "Add or import units",
        done: units > 0,
        required: true,
        href: "/get-started?step=UNITS",
      },
      {
        key: "people",
        label: "Add tenants or a caretaker (optional)",
        done: tenants + staff > 0,
        required: false,
        href: "/get-started?step=PEOPLE",
      },
      {
        key: "dashboard",
        label: "Open your first real portfolio dashboard",
        done: !!firstDashboardAt,
        required: true,
        href: "/dashboard",
      },
    ];
    const required = checks.filter((check) => check.required),
      next = required.find((check) => !check.done);
    const paidAt = org.onboarding?.paymentVerifiedAt,
      firstValueMs =
        paidAt && firstDashboardAt
          ? firstDashboardAt.getTime() - paidAt.getTime()
          : null;
    return {
      organizationId,
      name: org.name,
      business: {
        legalName: org.onboarding?.legalName ?? org.name,
        billingEmail: org.onboarding?.billingEmail,
        planKey: plan.key,
      },
      revision: org.portfolioOnboarding?.revision ?? 0,
      draft: org.portfolioOnboarding?.draft ?? null,
      lastStage: org.portfolioOnboarding?.lastStage,
      properties,
      checks,
      complete: required.every((check) => check.done),
      percent: Math.round(
        (required.filter((check) => check.done).length / required.length) * 100,
      ),
      nextStage:
        next?.key === "property"
          ? "PROPERTY"
          : next?.key === "units"
            ? "UNITS"
            : "DASHBOARD",
      facts: {
        properties: propertyCount,
        units,
        occupied,
        vacant,
        otherUnits: units - occupied - vacant,
        tenants,
        pendingTenantActivations:
          pendingTenants + Number(unverifiedTenants[0]?.count ?? 0),
        staff,
        currentTenancies: knownTenancies,
        knownMonthlyRentMinor: knownTenancies
          ? Number(tenancyFacts[0].rentMinor)
          : null,
        rentCoverageComplete: occupied > 0 && knownTenancies >= occupied,
        currency: "KES",
      },
      milestones: {
        paymentVerifiedAt: paidAt,
        firstPropertyAt: properties[0]?.createdAt,
        firstImportAt: firstImport?.occurredAt,
        firstDashboardAt,
        timeToFirstValueMs:
          firstValueMs !== null && firstValueMs >= 0 ? firstValueMs : null,
      },
      brief: {
        factsSource: "Saved property, unit and current tenancy records",
        predictions: [],
        predictionStatus:
          "Use the existing predictive-learning and model-serving readiness checks; no prediction is inferred from setup progress.",
        recommendations: checks
          .filter((check) => !check.done)
          .map((check) => ({ label: check.label, href: check.href })),
      },
    };
  }
  static async saveDraft(
    auth: AuthenticatedUser,
    organizationId: string,
    raw: unknown,
  ) {
    await loadPaidPortfolio(auth, organizationId);
    const input = portfolioDraftSchema.parse(raw),
      { expectedRevision, ...draft } = input;
    // Drafts are bounded and private. Completion always comes from operational records.
    if (Buffer.byteLength(JSON.stringify(draft)) > 750000)
      throw new AppError(
        400,
        "DRAFT_TOO_LARGE",
        "Save at most 500 import rows at a time.",
      );
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const revisionFilter =
          expectedRevision === 0
            ? {
                $or: [
                  { "portfolioOnboarding.revision": 0 },
                  { "portfolioOnboarding.revision": { $exists: false } },
                ],
              }
            : { "portfolioOnboarding.revision": expectedRevision };
        const changed = await Organization.updateOne(
          { _id: organizationId, ...revisionFilter },
          {
            $set: {
              "portfolioOnboarding.draft": draft,
              "portfolioOnboarding.lastStage": input.stage,
              "portfolioOnboarding.draftSavedAt": new Date(),
            },
            $inc: { "portfolioOnboarding.revision": 1 },
          },
          { session },
        );
        if (!changed.modifiedCount)
          throw new AppError(
            409,
            "ONBOARDING_DRAFT_CONFLICT",
            "Your saved setup changed in another tab. Refresh before saving.",
          );
        await AuditService.record(
          {
            organizationId: new mongoose.Types.ObjectId(organizationId),
            actorUserId: auth.userId,
            action: "portfolio.onboarding.draft.saved",
            resourceType: "Organization",
            resourceId: new mongoose.Types.ObjectId(organizationId),
            metadata: { stage: input.stage, revision: expectedRevision + 1 },
          },
          session,
        );
      });
    } finally {
      await session.endSession();
    }
    return this.progress(auth, organizationId);
  }
  static async dashboardVisited(
    auth: AuthenticatedUser,
    organizationId: string,
    raw: unknown,
  ) {
    dashboardVisitSchema.parse(raw);
    const { organization } = await loadPaidPortfolio(auth, organizationId);
    if (
      !(await Property.exists({
        organizationId,
        status: { $ne: "ARCHIVED" },
      })) ||
      !(await Unit.exists({ organizationId, status: { $ne: "INACTIVE" } }))
    )
      throw new AppError(
        409,
        "FIRST_VALUE_DATA_REQUIRED",
        "Add a property and units before recording a meaningful dashboard visit.",
      );
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const changed = await Organization.updateOne(
          {
            _id: organizationId,
            "portfolioOnboarding.firstDashboardAt": { $exists: false },
          },
          { $set: { "portfolioOnboarding.firstDashboardAt": new Date() } },
          { session },
        );
        if (changed.modifiedCount) {
          await AuditService.record(
            {
              organizationId: organization._id,
              actorUserId: auth.userId,
              action: "portfolio.first_dashboard.visited",
              resourceType: "Organization",
              resourceId: organization._id,
              metadata: { dataset: "LIVE" },
            },
            session,
          );
          await AuditService.publish(
            {
              organizationId: organization._id,
              name: "portfolio.first_value.reached",
              aggregateType: "Organization",
              aggregateId: organization._id,
              payload: {},
            },
            session,
          );
        }
      });
    } finally {
      await session.endSession();
    }
    return { recorded: true };
  }
}
