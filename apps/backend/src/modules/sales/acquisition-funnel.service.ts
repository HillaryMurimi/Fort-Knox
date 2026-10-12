import type { PipelineStage } from "mongoose";
import { recoveryEnabled } from "../onboarding/onboarding-recovery.service.js";
import { z } from "zod";
import { AuthorizationService } from "../../core/authorization/authorization.service.js";
import type { AuthenticatedUser } from "../../core/types/auth.js";
import { Organization } from "../../database/models/Organization.js";
import { AcquisitionJourney } from "../../database/models/AcquisitionJourney.js";
import { AuditService } from "../audit/audit.service.js";

const querySchema = z
  .object({
    days: z.coerce.number().int().min(1).max(365).default(30),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict();
const has = (field: string) => ({ $ne: [{ $ifNull: [field, null] }, null] });
export class AcquisitionFunnelService {
  static async report(auth: AuthenticatedUser, raw: unknown) {
    AuthorizationService.assertPlatformAdmin(auth);
    const { days, page } = querySchema.parse(raw),
      to = new Date(),
      from = new Date(to.getTime() - days * 86400000);
    const publicCohort = await AcquisitionJourney.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: null,
          sessions: { $sum: 1 },
          landing: { $sum: { $cond: [has("$landingAt"), 1, 0] } },
          demoStarted: { $sum: { $cond: [has("$demoStartedAt"), 1, 0] } },
          demoCompleted: { $sum: { $cond: [has("$demoCompletedAt"), 1, 0] } },
          planSelected: { $sum: { $cond: [has("$planSelectedAt"), 1, 0] } },
          signupStarted: { $sum: { $cond: [has("$signupStartedAt"), 1, 0] } },
        },
      },
      { $project: { _id: 0 } },
    ]);
    const joins: PipelineStage[] = [
      {
        $match: {
          createdAt: { $gte: from, $lte: to },
          "onboarding.ownerUserId": { $type: "objectId" },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "onboarding.ownerUserId",
          foreignField: "_id",
          as: "owner",
        },
      },
      { $unwind: { path: "$owner", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "organizationsubscriptions",
          localField: "_id",
          foreignField: "organizationId",
          as: "subscription",
        },
      },
      { $unwind: { path: "$subscription", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "subscriptioninvoices",
          localField: "onboarding.invoiceId",
          foreignField: "_id",
          as: "invoice",
        },
      },
      { $unwind: { path: "$invoice", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "organizationcontracts",
          localField: "onboarding.contractId",
          foreignField: "_id",
          as: "contract",
        },
      },
      { $unwind: { path: "$contract", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "acquisitionjourneys",
          localField: "onboarding.acquisitionJourneyId",
          foreignField: "_id",
          as: "journey",
        },
      },
      { $unwind: { path: "$journey", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "properties",
          let: { org: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$organizationId", "$$org"] },
                    { $ne: ["$status", "ARCHIVED"] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                firstAt: { $min: "$createdAt" },
              },
            },
          ],
          as: "properties",
        },
      },
      {
        $lookup: {
          from: "units",
          let: { org: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$organizationId", "$$org"] },
                    { $ne: ["$status", "INACTIVE"] },
                  ],
                },
              },
            },
            { $count: "count" },
          ],
          as: "units",
        },
      },
      {
        $lookup: {
          from: "auditlogs",
          let: { org: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$organizationId", "$$org"] },
                    { $eq: ["$action", "portfolio.bulk_import.completed"] },
                  ],
                },
              },
            },
            { $sort: { occurredAt: 1 } },
            { $limit: 1 },
            { $project: { occurredAt: 1 } },
          ],
          as: "imports",
        },
      },
      {
        $set: {
          emailVerified: has("$owner.emailVerifiedAt"),
          checkoutStarted: has("$subscription.providerCheckoutReference"),
          verifiedPayment: {
            $and: [
              { $eq: ["$invoice.status", "PAID"] },
              { $eq: ["$invoice.provider", "PAYSTACK"] },
              has("$onboarding.paymentVerifiedAt"),
              { $eq: ["$invoice.contractId", "$contract._id"] },
              { $eq: ["$invoice.subscriptionId", "$subscription._id"] },
              { $eq: ["$invoice.organizationId", "$_id"] },
              { $eq: ["$contract.organizationId", "$_id"] },
              { $eq: ["$contract.status", "SIGNED"] },
              has("$invoice.providerInvoiceId"),
            ],
          },
          propertyCount: {
            $ifNull: [{ $arrayElemAt: ["$properties.count", 0] }, 0],
          },
          unitCount: { $ifNull: [{ $arrayElemAt: ["$units.count", 0] }, 0] },
          imported: { $gt: [{ $size: "$imports" }, 0] },
          dashboardRecorded: has("$portfolioOnboarding.firstDashboardAt"),
          monthlyMinor: {
            $ifNull: [
              "$subscription.metadata.commercialSnapshot.monthlyMinor",
              "$contract.snapshot.monthlyMinor",
            ],
          },
          currency: {
            $ifNull: [
              "$subscription.metadata.commercialSnapshot.currency",
              "$contract.snapshot.currency",
            ],
          },
          source: { $ifNull: ["$journey.source", "UNATTRIBUTED"] },
        },
      },
      {
        $set: {
          activated: {
            $and: ["$verifiedPayment", has("$onboarding.activatedAt")],
          },
          activePaid: {
            $and: [
              "$verifiedPayment",
              { $eq: ["$subscription.status", "ACTIVE"] },
              { $gt: ["$subscription.currentPeriodEnd", to] },
            ],
          },
          timeToFirstValueMs: {
            $cond: [
              { $and: ["$verifiedPayment", "$dashboardRecorded"] },
              {
                $subtract: [
                  "$portfolioOnboarding.firstDashboardAt",
                  "$onboarding.paymentVerifiedAt",
                ],
              },
              null,
            ],
          },
          stage: {
            $switch: {
              branches: [
                {
                  case: { $not: ["$emailVerified"] },
                  then: "EMAIL_VERIFICATION",
                },
                {
                  case: { $ne: ["$contract.status", "SIGNED"] },
                  then: "AGREEMENT_AND_PLAN",
                },
                { case: { $not: ["$verifiedPayment"] }, then: "PAYMENT" },
                {
                  case: { $eq: ["$propertyCount", 0] },
                  then: "FIRST_PROPERTY",
                },
                { case: { $eq: ["$unitCount", 0] }, then: "UNITS" },
                {
                  case: { $not: ["$dashboardRecorded"] },
                  then: "FIRST_DASHBOARD",
                },
              ],
              default: "SETUP_COMPLETE",
            },
          },
        },
      },
      {
        $project: {
          name: 1,
          createdAt: 1,
          source: 1,
          stage: 1,
          emailVerified: 1,
          checkoutStarted: 1,
          verifiedPayment: 1,
          activated: 1,
          activePaid: 1,
          propertyCount: 1,
          unitCount: 1,
          imported: 1,
          dashboardRecorded: 1,
          timeToFirstValueMs: 1,
          monthlyMinor: 1,
          currency: 1,
          attentionCode: "$onboarding.attentionCode",
        },
      },
    ];
    const result = await Organization.aggregate([
      ...joins,
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                accounts: { $sum: 1 },
                verified: { $sum: { $cond: ["$emailVerified", 1, 0] } },
                checkouts: { $sum: { $cond: ["$checkoutStarted", 1, 0] } },
                verifiedPayments: {
                  $sum: { $cond: ["$verifiedPayment", 1, 0] },
                },
                activations: { $sum: { $cond: ["$activated", 1, 0] } },
                properties: {
                  $sum: { $cond: [{ $gt: ["$propertyCount", 0] }, 1, 0] },
                },
                units: { $sum: { $cond: [{ $gt: ["$unitCount", 0] }, 1, 0] } },
                imports: { $sum: { $cond: ["$imported", 1, 0] } },
                firstValue: {
                  $sum: {
                    $cond: [
                      { $and: ["$verifiedPayment", "$dashboardRecorded"] },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ],
          blockers: [
            { $group: { _id: "$stage", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
          sources: [
            {
              $group: {
                _id: "$source",
                accounts: { $sum: 1 },
                verifiedPayments: {
                  $sum: { $cond: ["$verifiedPayment", 1, 0] },
                },
                activations: { $sum: { $cond: ["$activated", 1, 0] } },
              },
            },
          ],
          revenue: [
            {
              $match: {
                activePaid: true,
                monthlyMinor: { $type: "number", $gt: 0 },
              },
            },
            {
              $group: {
                _id: "$currency",
                mrr: { $sum: { $toDecimal: "$monthlyMinor" } },
                organizations: { $sum: 1 },
              },
            },
            {
              $project: {
                _id: 0,
                currency: "$_id",
                organizations: 1,
                mrrMinor: { $toString: "$mrr" },
                arrMinor: { $toString: { $multiply: ["$mrr", 12] } },
              },
            },
          ],
          firstValue: [
            {
              $match: {
                verifiedPayment: true,
                timeToFirstValueMs: { $gte: 0 },
              },
            },
            {
              $group: {
                _id: null,
                observations: { $sum: 1 },
                meanMs: { $avg: "$timeToFirstValueMs" },
                minimumMs: { $min: "$timeToFirstValueMs" },
                maximumMs: { $max: "$timeToFirstValueMs" },
              },
            },
          ],
          items: [
            { $sort: { createdAt: -1, _id: 1 } },
            { $skip: (page - 1) * 20 },
            { $limit: 20 },
            { $project: { monthlyMinor: 0, currency: 0 } },
          ],
        },
      },
    ]);
    const data = result[0],
      totals = data?.totals[0] ?? {
        accounts: 0,
        verified: 0,
        checkouts: 0,
        verifiedPayments: 0,
        activations: 0,
        properties: 0,
        units: 0,
        imports: 0,
        firstValue: 0,
      };
    const ratio = (numerator: number, denominator: number) =>
      denominator ? Math.round((numerator / denominator) * 10000) / 100 : null;
    await AuditService.record({
      actorUserId: auth.userId,
      action: "acquisition.funnel.viewed",
      resourceType: "Organization",
      metadata: { days, page, accounts: totals.accounts },
    });
    return {
      window: { days, from, to },
      public: publicCohort[0] ?? {
        sessions: 0,
        landing: 0,
        demoStarted: 0,
        demoCompleted: 0,
        planSelected: 0,
        signupStarted: 0,
      },
      accounts: totals,
      conversion: {
        verifiedAccountRate: ratio(totals.verified, totals.accounts),
        visitorToPaidRate: null,
        accountToPaidRate: ratio(totals.verifiedPayments, totals.accounts),
        activationRate: ratio(totals.activations, totals.accounts),
        firstValueRate: ratio(totals.firstValue, totals.activations),
      },
      linkedVisitorConversion: await this.linkedVisitorConversion(from, to),
      bottlenecks: data?.blockers ?? [],
      sources: data?.sources ?? [],
      revenue: data?.revenue ?? [],
      timeToFirstValue: data?.firstValue[0] ?? null,
      items: data?.items ?? [],
      page,
      total: totals.accounts,
      recovery: {
        enabled: recoveryEnabled(),
        operationalApprovalRequired: true,
      },
      limitations: [
        "Public milestones are first-party, anonymous session reports, not verified people or proof of payment. Anonymous unlinked records expire after 30 days.",
        "Account conversion uses the same signup cohort. Payment and activation require signed agreement and retained Paystack invoice evidence. Demo and pilot simulations contribute no revenue.",
        "Self-service cohorts cover accounts with the new owner tracking field; legacy and seller-led pilots retain their existing business intelligence.",
        "MRR/ARR is normalized contracted recurring revenue for currently active verified subscriptions, grouped by currency. It is not cash received or a forecast.",
        "First value is an authenticated dashboard request with a saved property and units. Times are server recorded; missing or reversed timestamps remain unavailable.",
        "Recovery emails remain disabled until approved operational configuration and customer consent are present.",
      ],
    };
  }
  private static async linkedVisitorConversion(from: Date, to: Date) {
    const result = await AcquisitionJourney.aggregate([
      {
        $match: {
          createdAt: { $gte: from, $lte: to },
          landingAt: { $type: "date" },
        },
      },
      {
        $lookup: {
          from: "organizations",
          localField: "organizationId",
          foreignField: "_id",
          as: "organization",
        },
      },
      { $unwind: { path: "$organization", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "subscriptioninvoices",
          localField: "organization.onboarding.invoiceId",
          foreignField: "_id",
          as: "invoice",
        },
      },
      { $unwind: { path: "$invoice", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "organizationcontracts",
          localField: "organization.onboarding.contractId",
          foreignField: "_id",
          as: "contract",
        },
      },
      { $unwind: { path: "$contract", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "organizationsubscriptions",
          localField: "organization._id",
          foreignField: "organizationId",
          as: "subscription",
        },
      },
      { $unwind: { path: "$subscription", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: null,
          sessions: { $sum: 1 },
          paid: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$invoice.status", "PAID"] },
                    { $eq: ["$invoice.provider", "PAYSTACK"] },
                    has("$invoice.providerInvoiceId"),
                    { $eq: ["$invoice.contractId", "$contract._id"] },
                    { $eq: ["$contract.status", "SIGNED"] },
                    { $eq: ["$contract.organizationId", "$organization._id"] },
                    { $eq: ["$invoice.subscriptionId", "$subscription._id"] },
                    { $eq: ["$invoice.organizationId", "$organization._id"] },
                    has("$organization.onboarding.paymentVerifiedAt"),
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);
    const row = result[0];
    return {
      sessions: row?.sessions ?? 0,
      verifiedPaid: row?.paid ?? 0,
      rate: row?.sessions
        ? Math.round((row.paid / row.sessions) * 10000) / 100
        : null,
    };
  }
}
