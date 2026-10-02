import { Incident } from "../../database/models/Incident.js";
import { assertSalesIndexes } from "./sales-indexes.js";
import { Invitation } from "../../database/models/Invitation.js";
import mongoose, { Types } from "mongoose";
import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { AppError } from "../../core/errors/AppError.js";
import { AuthorizationService } from "../../core/authorization/authorization.service.js";
import type { AuthenticatedUser } from "../../core/types/auth.js";
import { Organization } from "../../database/models/Organization.js";
import { OrganizationMembership } from "../../database/models/OrganizationMembership.js";
import { SalesLead } from "../../database/models/SalesLead.js";
import {
  SalesDemoSession,
  SalesValueEvent,
} from "../../database/models/SalesDemoSession.js";
import { SubscriptionPlan } from "../../database/models/SubscriptionPlan.js";
import { OrganizationSubscription } from "../../database/models/OrganizationSubscription.js";
import { User } from "../../database/models/User.js";
import { Role } from "../../database/models/Role.js";
import { Property } from "../../database/models/Property.js";
import { Unit } from "../../database/models/Unit.js";
import { Tenancy } from "../../database/models/Tenancy.js";
import { RentCharge } from "../../database/models/RentCharge.js";
import { MaintenanceRequest } from "../../database/models/MaintenanceRequest.js";
import { Payment } from "../../database/models/Payment.js";
import { AuditLog } from "../../database/models/AuditLog.js";
import { AuditService } from "../audit/audit.service.js";
import { SalesDemoService, assertSalesAccess } from "./sales-demo.service.js";
import { startPilotSchema, pilotInsightSchema } from "./sales-demo.schemas.js";
import { SalesDemoRepository } from "./sales-demo.repository.js";
import type { DemoSnapshot, DemoProfile } from "./sales-demo.types.js";
export function pilotIsOpen(
  pilot: { expiresAt: Date | string } | null | undefined,
  now = new Date(),
) {
  return !!pilot && new Date(pilot.expiresAt) > now;
}
export function activationReadiness(facts: {
  configured: boolean;
  properties: number;
  units: number;
  tenancies: number;
  charges: number;
  staff: number;
  workflows: number;
}) {
  const checks = [
    {
      key: "workspace",
      label: "Organization configured",
      done: facts.configured,
      href: "/settings",
    },
    {
      key: "property",
      label: "First property configured",
      done: facts.properties > 0,
      href: "/properties/setup",
    },
    {
      key: "units",
      label: "Units loaded",
      done: facts.units > 0,
      href: "/pilot",
    },
    {
      key: "tenancies",
      label: "Tenancies loaded",
      done: facts.tenancies > 0,
      href: "/tenants",
    },
    {
      key: "ledger",
      label: "Rent ledger operational",
      done: facts.charges > 0,
      href: "/finance",
    },
    {
      key: "staff",
      label: "Staff invited or assigned",
      done: facts.staff > 0,
      href: "/pilot#staff",
    },
    {
      key: "workflow",
      label: "Core workflow completed",
      done: facts.workflows > 0,
      href: "/maintenance",
    },
  ];
  return {
    percent: Math.round(
      (checks.filter((c) => c.done).length / checks.length) * 100,
    ),
    complete: checks.every((c) => c.done),
    checks,
    next: checks.find((c) => !c.done) ?? null,
  };
}
export class GuidedPilotService {
  static async start(auth: AuthenticatedUser, demoId: string, raw: unknown) {
    assertSalesAccess(auth);
    await assertSalesIndexes();
    AuditService.assertObjectId(demoId, "demoSessionId");
    const input = startPilotSchema.parse(raw);
    const session = await mongoose.startSession();
    let orgId = "";
    try {
      await session.withTransaction(async () => {
        const demo = await SalesDemoRepository.load(
          demoId,
          auth.userId,
          auth.isPlatformAdmin,
          session,
        );
        const lead = await SalesLead.findById(demo.leadId).session(session);
        const existingOrgId =
          demo.pilotOrganizationId ?? lead?.pilotOrganizationId;
        if (existingOrgId) {
          const org =
            await Organization.findById(existingOrgId).session(session);
          const owner = org?.guidedPilot
            ? await User.findById(org.guidedPilot.ownerUserId)
                .select("email")
                .session(session)
            : null;
          if (
            !owner ||
            owner.email?.toLowerCase() !== input.ownerEmail.toLowerCase()
          )
            throw new AppError(
              409,
              "PILOT_OWNER_CONFLICT",
              "This prospect already has a pilot bound to a different verified owner",
            );
          orgId = String(existingOrgId);
          if (!demo.pilotOrganizationId) {
            await SalesDemoSession.updateOne(
              { _id: demo._id, revision: demo.revision },
              {
                $set: { pilotOrganizationId: existingOrgId },
                $inc: { revision: 1 },
              },
              { session },
            );
            await AuditService.record(
              {
                organizationId: org!._id,
                actorUserId: auth.userId,
                action: "guided.pilot.resumed",
                resourceType: "SalesDemoSession",
                resourceId: demo._id,
                metadata: { dataset: "PILOT" },
              },
              session,
            );
          }
          return;
        }
        const snapshot = demo.snapshot as DemoSnapshot;
        if (!snapshot.history.some((h) => h.action === "pilot.offered"))
          throw new AppError(
            409,
            "PILOT_OFFER_REQUIRED",
            "Complete an outcome and offer a guided pilot first",
          );
        const owner = await User.findOne({
          email: input.ownerEmail.toLowerCase(),
          status: "ACTIVE",
          isPlatformAdmin: false,
        }).session(session);
        if (!owner?.verifiedAt && !owner?.phoneVerifiedAt)
          throw new AppError(
            409,
            "VERIFIED_OWNER_REQUIRED",
            "Ask the prospect to sign up and verify their account before preparing the workspace",
          );
        const role = await Role.findOne({
          key: "LANDLORD",
          system: true,
          organizationId: null,
        }).session(session);
        const plan = await SubscriptionPlan.findOne({
          key: (demo.profile as DemoProfile).plan,
          active: true,
        }).session(session);
        if (!role || !plan)
          throw new AppError(
            503,
            "PILOT_CONFIGURATION_REQUIRED",
            "Configure the existing landlord role and selected plan first",
          );
        if (
          !auth.isPlatformAdmin &&
          input.durationDays !== undefined &&
          input.durationDays !== env.GUIDED_PILOT_DAYS
        )
          throw new AppError(
            403,
            "PILOT_DURATION_ADMIN_ONLY",
            "Only platform administrators can override the configured pilot duration",
          );
        const durationDays = input.durationDays ?? env.GUIDED_PILOT_DAYS,
          now = new Date(),
          organization = new Organization({
            name: input.name,
            slug: `pilot-${randomUUID()}`,
            onboarding: { state: "ACCOUNT_CREATED" },
            guidedPilot: {
              leadId: demo.leadId,
              demoSessionId: demo._id,
              ownerUserId: owner!._id,
              planKey: plan.key,
              startedAt: now,
              expiresAt: new Date(now.getTime() + durationDays * 86400000),
              durationDays,
            },
          });
        await organization.save({ session });
        orgId = String(organization._id);
        await OrganizationMembership.create(
          [
            {
              userId: owner!._id,
              organizationId: organization._id,
              roleIds: [role._id],
              status: "ACTIVE",
              scope: {
                allProperties: true,
                propertyIds: [],
                buildingIds: [],
                unitIds: [],
              },
              invitedBy: auth.userId,
              joinedAt: now,
            },
          ],
          { session },
        );
        const update = await SalesDemoSession.updateOne(
          {
            _id: demo._id,
            revision: demo.revision,
            pilotOrganizationId: { $exists: false },
          },
          {
            $set: { pilotOrganizationId: organization._id },
            $inc: { revision: 1 },
          },
          { session },
        );
        if (update.modifiedCount !== 1)
          throw new AppError(
            409,
            "PILOT_CONFLICT",
            "Pilot creation changed; refresh",
          );
        await SalesLead.updateOne(
          { _id: demo.leadId },
          {
            $set: {
              stage: "Guided pilot started",
              pilotOrganizationId: organization._id,
            },
          },
          { session },
        );
        await SalesValueEvent.create(
          [
            {
              sessionId: demo._id,
              leadId: demo.leadId,
              generation: demo.generation,
              commandId: `pilot-${organization._id}`,
              payloadHash: "pilot",
              kind: "guided.pilot.started",
              resourceId: `demo-pilot-${organization._id}`,
              actorUserId: auth.userId,
              dataset: "PILOT",
            },
          ],
          { session },
        );
        await AuditService.record(
          {
            organizationId: organization._id,
            actorUserId: auth.userId,
            action: "guided.pilot.started",
            resourceType: "Organization",
            resourceId: organization._id,
            metadata: { durationDays, plan: plan.key, dataset: "PILOT" },
          },
          session,
        );
      });
    } finally {
      await session.endSession();
    }
    return {
      organizationId: orgId,
      href: "/pilot",
      commercialHref: "/onboarding",
      demo: await SalesDemoService.view(auth, demoId),
    };
  }
  static async load(
    auth: AuthenticatedUser,
    organizationId: string,
    write = false,
  ) {
    AuditService.assertObjectId(organizationId, "organizationId");
    AuthorizationService.assertCan(
      auth,
      write ? "property.create" : "billing.subscription.view",
      { organizationId },
    );
    const organization = await Organization.findById(organizationId).lean();
    if (!organization?.guidedPilot)
      throw new AppError(404, "PILOT_NOT_FOUND", "Guided pilot not found");
    if (
      !auth.isPlatformAdmin &&
      String(organization.guidedPilot.ownerUserId) !== String(auth.userId)
    )
      throw new AppError(
        403,
        "PILOT_OWNER_REQUIRED",
        "The guided workspace belongs to its verified owner",
      );
    if (write && !pilotIsOpen(organization.guidedPilot))
      throw new AppError(
        410,
        "PILOT_EXPIRED",
        "Pilot expired. Review your commercial activation steps.",
      );
    return organization;
  }
  static async progress(auth: AuthenticatedUser, organizationId: string) {
    const org = await this.load(auth, organizationId),
      since = org.guidedPilot!.startedAt,
      filter = { organizationId: org._id },
      activity = { ...filter, occurredAt: { $gte: since } };
    const staffRoles = await Role.find({
      key: { $in: ["PROPERTY_MANAGER", "CARETAKER", "CONTRACTOR"] },
    })
      .select("_id")
      .lean();
    const staffInvites = await Invitation.countDocuments({
      ...filter,
      role: { $in: ["PROPERTY_MANAGER", "CARETAKER", "CONTRACTOR"] },
      status: "PENDING",
      expiresAt: { $gt: new Date() },
    });
    const activeStaff = await OrganizationMembership.find({
      ...filter,
      userId: { $ne: org.guidedPilot!.ownerUserId },
      roleIds: { $in: staffRoles.map((r) => r._id) },
      status: "ACTIVE",
    })
      .select("userId")
      .lean();
    const securityIncidents =
      org.guidedPilot!.planKey === "FORT_KNOX"
        ? await Incident.countDocuments({
            ...filter,
            createdAt: { $gte: since },
          })
        : undefined;
    const [
      properties,
      units,
      tenancies,
      charges,
      staff,
      repairs,
      payments,
      approvals,
      staffActions,
      priorities,
      insights,
    ] = await Promise.all([
      Property.countDocuments({ ...filter, status: { $ne: "ARCHIVED" } }),
      Unit.countDocuments({ ...filter, status: { $ne: "INACTIVE" } }),
      Tenancy.countDocuments({
        ...filter,
        status: { $in: ["ACTIVE", "NOTICE"] },
      }),
      RentCharge.countDocuments({ ...filter, status: { $ne: "VOID" } }),
      OrganizationMembership.countDocuments({
        ...filter,
        userId: { $ne: org.guidedPilot!.ownerUserId },
        roleIds: { $in: staffRoles.map((r) => r._id) },
        status: "ACTIVE",
      }),
      MaintenanceRequest.countDocuments({
        ...filter,
        createdAt: { $gte: since },
      }),
      Payment.countDocuments({
        ...filter,
        status: "CONFIRMED",
        updatedAt: { $gte: since },
      }),
      MaintenanceRequest.countDocuments({
        ...filter,
        approvedAt: { $gte: since },
        approvedBy: { $exists: true },
      }),
      AuditLog.countDocuments({
        ...activity,
        actorUserId: { $in: activeStaff.map((s) => s.userId) },
        action: { $regex: "^(maintenance|inspection|inventory)\\." },
      }),
      AuditLog.countDocuments({
        ...activity,
        action: "intelligence.alert.resolved",
      }),
      AuditLog.countDocuments({
        ...activity,
        action: {
          $in: [
            "guided.pilot.insight.reviewed",
            "payment.confirmed",
            "maintenance.completed",
            "maintenance.closed",
          ],
        },
      }),
    ]);
    const completedRepairs = await MaintenanceRequest.countDocuments({
      ...filter,
      status: { $in: ["COMPLETED", "VERIFIED", "CLOSED"] },
      updatedAt: { $gte: since },
    });
    const attentionResolved = completedRepairs + priorities;
    const pilotProperties = await Property.find({
      ...filter,
      status: { $ne: "ARCHIVED" },
    })
      .select("_id name")
      .sort({ name: 1 })
      .limit(200)
      .lean();
    const [largestBalance, oldestVacancy] = await Promise.all([
      RentCharge.findOne({
        ...filter,
        balanceAmount: { $gt: 0 },
        status: { $ne: "VOID" },
      })
        .sort({ balanceAmount: -1 })
        .select("_id unitId tenancyId balanceAmountMinor balanceAmount dueDate")
        .lean(),
      Unit.findOne({ ...filter, status: "VACANT" })
        .select("_id code monthlyRent")
        .lean(),
    ]);
    const insight = largestBalance
      ? {
          kind: "RENT",
          resourceId: String(largestBalance._id),
          title: "Investigate your largest outstanding balance",
          amountMinor:
            largestBalance.balanceAmountMinor ??
            Math.round(largestBalance.balanceAmount * 100),
          href: `/tenancies/${largestBalance.tenancyId}`,
        }
      : oldestVacancy
        ? {
            kind: "VACANCY",
            resourceId: String(oldestVacancy._id),
            title: `Review vacant unit ${oldestVacancy.code}`,
            amountMinor: Math.round(oldestVacancy.monthlyRent * 100),
            href: `/units/${oldestVacancy._id}`,
          }
        : null;
    const readiness = activationReadiness({
      configured: !!org.onboarding?.legalName || units > 0,
      properties,
      units,
      tenancies,
      charges,
      staff: staff + staffInvites,
      workflows: completedRepairs + payments,
    });
    if (readiness.complete && !org.guidedPilot!.activationMilestoneAt) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const changed = await Organization.updateOne(
            {
              _id: org._id,
              "guidedPilot.activationMilestoneAt": { $exists: false },
            },
            { $set: { "guidedPilot.activationMilestoneAt": new Date() } },
            { session },
          );
          if (changed.modifiedCount) {
            await AuditService.record(
              {
                organizationId: org._id,
                actorUserId: auth.userId,
                action: "guided.pilot.activation.milestone",
                resourceType: "Organization",
                resourceId: org._id,
                metadata: { dataset: "PILOT" },
              },
              session,
            );
            await SalesValueEvent.create(
              [
                {
                  sessionId: org.guidedPilot!.demoSessionId,
                  leadId: org.guidedPilot!.leadId,
                  generation: 0,
                  commandId: `activation-${org._id}`,
                  payloadHash: "activation",
                  kind: "activation.milestone.reached",
                  resourceId: `demo-pilot-${org._id}`,
                  actorUserId: auth.userId,
                  dataset: "PILOT",
                },
              ],
              { session },
            );
          }
        });
      } finally {
        await session.endSession();
      }
    }
    return {
      organizationId,
      organizationName: org.name,
      plan: org.guidedPilot!.planKey,
      startedAt: since,
      expiresAt: org.guidedPilot!.expiresAt,
      durationDays: org.guidedPilot!.durationDays,
      expired: !pilotIsOpen(org.guidedPilot),
      readiness,
      insight,
      properties: pilotProperties.map((p) => ({
        id: String(p._id),
        name: p.name,
      })),
      value: {
        ...(securityIncidents !== undefined
          ? { securityIncidentsRecorded: securityIncidents }
          : {}),
        unitsConfigured: units,
        tenanciesLoaded: tenancies,
        openingLedgerEntries: charges,
        reconciledPayments: payments,
        maintenanceWorkflows: repairs,
        completedRepairs,
        approvalsCompleted: approvals,
        staffActionsTracked: staffActions,
        attentionItemsResolved: attentionResolved,
        meaningfulInsights: insights,
      },
      commercialState: org.onboarding?.state ?? "ACCOUNT_CREATED",
      commercialHref: "/onboarding",
      nextActions: readiness.checks.filter((c) => !c.done),
    };
  }
  static async reviewInsight(
    auth: AuthenticatedUser,
    organizationId: string,
    raw: unknown,
  ) {
    const org = await this.load(auth, organizationId, true);
    const input = pilotInsightSchema.parse(raw);
    const exists =
      input.kind === "RENT"
        ? await RentCharge.exists({
            _id: input.resourceId,
            organizationId: org._id,
            balanceAmount: { $gt: 0 },
            status: { $ne: "VOID" },
          })
        : await Unit.exists({
            _id: input.resourceId,
            organizationId: org._id,
            status: "VACANT",
          });
    if (!exists)
      throw new AppError(
        404,
        "PILOT_INSIGHT_NOT_FOUND",
        "Current insight is not available in this workspace",
      );
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const commandId = `insight-${org._id}-${input.resourceId}`;
        if (
          await SalesValueEvent.exists({
            sessionId: org.guidedPilot!.demoSessionId,
            commandId,
          }).session(session)
        )
          return;
        await SalesValueEvent.create(
          [
            {
              sessionId: org.guidedPilot!.demoSessionId,
              leadId: org.guidedPilot!.leadId,
              generation: 0,
              commandId,
              payloadHash: "insight",
              kind: "guided.pilot.insight.reviewed",
              resourceId: input.resourceId,
              actorUserId: auth.userId,
              dataset: "PILOT",
            },
          ],
          { session },
        );
        await AuditService.record(
          {
            organizationId: org._id,
            actorUserId: auth.userId,
            action: "guided.pilot.insight.reviewed",
            resourceType: input.kind === "RENT" ? "RentCharge" : "Unit",
            resourceId: new Types.ObjectId(input.resourceId),
            metadata: { dataset: "PILOT", kind: input.kind },
          },
          session,
        );
      });
    } finally {
      await session.endSession();
    }
    return { reviewed: true };
  }
  static async intelligence(auth: AuthenticatedUser, raw: unknown) {
    SalesDemoService.assertAdmin(auth);
    const { page } = (
      await import("./sales-demo.schemas.js")
    ).paginationSchema.parse(raw);
    await AuditService.record({
      actorUserId: auth.userId,
      action: "sales.intelligence.viewed",
      resourceType: "SalesLead",
      metadata: { dataset: "SALES_DEMO", page },
    });
    const [rows, total] = await Promise.all([
      SalesLead.find({ demoProfile: { $exists: true } })
        .select("name demoProfile stage pilotOrganizationId createdAt")
        .sort({ createdAt: -1 })
        .skip((page - 1) * 20)
        .limit(20)
        .lean(),
      SalesLead.countDocuments({ demoProfile: { $exists: true } }),
    ]);
    // Aggregate the same prospect cohort, rather than dividing unrelated calendar totals.
    const grouped = await SalesLead.aggregate([
      { $match: { demoProfile: { $exists: true } } },
      {
        $lookup: {
          from: "salesvalueevents",
          localField: "_id",
          foreignField: "leadId",
          as: "events",
        },
      },
      {
        $lookup: {
          from: "organizations",
          localField: "pilotOrganizationId",
          foreignField: "_id",
          as: "pilot",
        },
      },
      { $unwind: { path: "$pilot", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "organizationsubscriptions",
          localField: "pilotOrganizationId",
          foreignField: "organizationId",
          as: "subscription",
        },
      },
      { $unwind: { path: "$subscription", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "subscriptioninvoices",
          localField: "pilot.onboarding.invoiceId",
          foreignField: "_id",
          as: "activationInvoice",
        },
      },
      {
        $unwind: {
          path: "$activationInvoice",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "subscriptioninvoices",
          let: {
            organization: "$pilotOrganizationId",
            initialEnd: "$activationInvoice.periodEnd",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$organizationId", "$$organization"] },
                    { $eq: ["$status", "PAID"] },
                    { $ne: [{ $ifNull: ["$$initialEnd", null] }, null] },
                    { $gte: ["$periodStart", "$$initialEnd"] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: "paidRenewal",
        },
      },

      {
        $project: {
          pain: "$demoProfile.primaryPain",
          plan: "$demoProfile.plan",
          scenario: "$demoProfile.template",
          events: "$events.kind",
          pilot: {
            $cond: [
              { $ne: [{ $ifNull: ["$pilotOrganizationId", null] }, null] },
              1,
              0,
            ],
          },
          milestone: {
            $cond: [
              {
                $ne: [
                  {
                    $ifNull: ["$pilot.guidedPilot.activationMilestoneAt", null],
                  },
                  null,
                ],
              },
              1,
              0,
            ],
          },
          retained: { $cond: [{ $gt: [{ $size: "$paidRenewal" }, 0] }, 1, 0] },
          paid: {
            $cond: [
              {
                $and: [
                  { $eq: ["$pilot.onboarding.state", "ACTIVE"] },
                  {
                    $ne: [
                      {
                        $ifNull: ["$pilot.onboarding.paymentVerifiedAt", null],
                      },
                      null,
                    ],
                  },
                  { $ne: [{ $ifNull: ["$subscription._id", null] }, null] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
      {
        $group: {
          _id: { pain: "$pain", plan: "$plan", scenario: "$scenario" },
          prospects: { $sum: 1 },
          demos: {
            $sum: { $cond: [{ $in: ["demo.completed", "$events"] }, 1, 0] },
          },
          offered: {
            $sum: { $cond: [{ $in: ["pilot.offered", "$events"] }, 1, 0] },
          },
          pilots: { $sum: "$pilot" },
          activated: { $sum: "$milestone" },
          paid: { $sum: "$paid" },
          retained: { $sum: "$retained" },
        },
      },
      { $sort: { prospects: -1 } },
      { $limit: 100 },
    ]);
    const moments = await SalesValueEvent.aggregate([
      {
        $match: {
          kind: {
            $in: [
              "arrears.exposure.revealed",
              "overdue.tenancy.identified",
              "payment.reconciled",
              "maintenance.problem.resolved",
              "approval.completed",
              "vacancy.exposure.identified",
              "staff.task.escalated",
              "security.incident.investigated",
              "evidence.retrieved",
              "security.incident.resolved",
              "vacancy.action.assigned",
              "staff.task.completed",
              "guided.pilot.insight.reviewed",
              "activation.milestone.reached",
            ],
          },
        },
      },
      { $group: { _id: { leadId: "$leadId", kind: "$kind" } } },
      {
        $lookup: {
          from: "salesleads",
          localField: "_id.leadId",
          foreignField: "_id",
          as: "lead",
        },
      },
      { $unwind: "$lead" },
      {
        $lookup: {
          from: "organizations",
          localField: "lead.pilotOrganizationId",
          foreignField: "_id",
          as: "org",
        },
      },
      { $unwind: { path: "$org", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$_id.kind",
          prospectsReached: { $sum: 1 },
          pilots: {
            $sum: {
              $cond: [
                {
                  $ne: [{ $ifNull: ["$lead.pilotOrganizationId", null] }, null],
                },
                1,
                0,
              ],
            },
          },
          paid: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$org.onboarding.state", "ACTIVE"] },
                    {
                      $ne: [
                        {
                          $ifNull: ["$org.onboarding.paymentVerifiedAt", null],
                        },
                        null,
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { prospectsReached: -1 } },
    ]);
    const items = await Promise.all(
      rows.map(async (lead) => {
        const organization = lead.pilotOrganizationId
          ? await Organization.findById(lead.pilotOrganizationId)
              .select("guidedPilot onboarding")
              .lean()
          : null;
        const readiness = organization?.guidedPilot
          ? (await this.progress(auth, String(organization._id))).readiness
          : null;
        return {
          readinessPercent: readiness?.percent,
          nextAction: readiness?.next?.label,
          id: String(lead._id),
          name: lead.name,
          profile: lead.demoProfile,
          stage: lead.stage,
          pilotOrganizationId: lead.pilotOrganizationId,
          expiresAt: organization?.guidedPilot?.expiresAt,
          activationMilestone: organization?.guidedPilot?.activationMilestoneAt,
          commercialState: organization?.onboarding?.state ?? "NOT_STARTED",
          blocker:
            organization?.onboarding?.attentionCode ??
            (organization?.guidedPilot &&
            organization.onboarding?.state !== "ACTIVE" &&
            !pilotIsOpen(organization.guidedPilot)
              ? "PILOT_EXPIRED"
              : undefined),
        };
      }),
    );
    const totals = await SalesValueEvent.aggregate([
      {
        $match: {
          kind: {
            $in: [
              "demo.prepared",
              "demo.completed",
              "demo.reset",
              "guided.pilot.started",
              "activation.milestone.reached",
            ],
          },
        },
      },
      {
        $group: {
          _id: {
            session: "$sessionId",
            generation: "$generation",
            kind: "$kind",
          },
        },
      },
      { $group: { _id: "$_id.kind", count: { $sum: 1 } } },
    ]);
    const subscriptions = await OrganizationSubscription.countDocuments({
      organizationId: {
        $in: rows
          .map((r) => r.pilotOrganizationId)
          .filter((id): id is Types.ObjectId => !!id),
      },
      status: "ACTIVE",
    });
    return {
      items,
      total,
      page,
      totals,
      cohorts: grouped,
      valueMoments: moments,
      activeSubscriptionsOnPage: subscriptions,
      limitations: [
        "Conversion is prospect-cohort based. Aha association does not establish causation. Paid requires retained verified activation evidence. Retention requires a paid invoice for a subsequent service period; an active status alone is insufficient.",
      ],
    };
  }
}
