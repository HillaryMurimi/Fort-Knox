import type { PipelineStage, Aggregate } from "mongoose";
import { Types } from "mongoose";
import { Organization } from "../../database/models/Organization.js";
import { OrganizationSubscription } from "../../database/models/OrganizationSubscription.js";
import { SubscriptionInvoice } from "../../database/models/SubscriptionInvoice.js";
import { Property } from "../../database/models/Property.js";
import { Building } from "../../database/models/Building.js";
import { Unit } from "../../database/models/Unit.js";
import { SecurityCamera } from "../../database/models/SecurityCamera.js";
import { Incident } from "../../database/models/Incident.js";
import { Evidence } from "../../database/models/Evidence.js";
import { Job } from "../../database/models/Job.js";
import { Notification } from "../../database/models/Notification.js";
import { IntegrationAttempt } from "../../database/models/IntegrationAttempt.js";
import { BillingEvent } from "../../database/models/BillingEvent.js";
import { AuditLog } from "../../database/models/AuditLog.js";
import {
  DEMO_DATASET,
  type BusinessQuery,
  type BusinessRange,
} from "./platform-business.schemas.js";
import type {
  PlanMetrics,
  RevenueMetrics,
  SecurityMetrics,
} from "./platform-business.types.js";
const within = (field: string, from: Date, to: Date) => ({
  $and: [{ $gte: [field, from] }, { $lt: [field, to] }],
});
const sumIf = (condition: unknown) => ({ $sum: { $cond: [condition, 1, 0] } });
const bucket = (path: unknown) => ({
  $switch: {
    branches: [
      { case: { $in: [path, ["CONTROL", "FORT_KNOX"]] }, then: path },
      { case: { $eq: [{ $ifNull: [path, null] }, null] }, then: "UNASSIGNED" },
    ],
    default: "OTHER",
  },
});
export function organizationScope(query: Pick<BusinessQuery, "dataset">) {
  return {
    "settings.platformDemoDataset":
      query.dataset === "DEMO" ? DEMO_DATASET : { $ne: DEMO_DATASET },
  };
}
export function organizationJoin(query: BusinessQuery): PipelineStage[] {
  return [
    {
      $lookup: {
        from: "organizations",
        let: { id: "$organizationId" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$_id", "$$id"] },
              ...organizationScope(query),
            },
          },
          { $project: { name: 1, status: 1, onboarding: 1 } },
        ],
        as: "organization",
      },
    },
    { $unwind: "$organization" },
  ];
}
export function resourcePipeline(query: BusinessQuery): PipelineStage[] {
  return [
    ...organizationJoin(query),
    {
      $lookup: {
        from: "organizationsubscriptions",
        localField: "organizationId",
        foreignField: "organizationId",
        as: "subscription",
      },
    },
    {
      $lookup: {
        from: "subscriptionplans",
        localField: "subscription.planId",
        foreignField: "_id",
        as: "catalog",
      },
    },
    { $set: { plan: bucket({ $arrayElemAt: ["$catalog.key", 0] }) } },
    ...(query.plan === "ALL" ? [] : [{ $match: { plan: query.plan } }]),
  ];
}
export function cameraPipeline(
  query: BusinessQuery,
  now: Date,
): PipelineStage[] {
  return [
    ...(query.dataset === "LIVE"
      ? [{ $match: { "metadata.simulated": { $ne: true } } }]
      : []),
    ...resourcePipeline(query),
    { $set: { observedAt: { $ifNull: ["$lastHeartbeatAt", "$lastSeenAt"] } } },
    {
      $set: {
        availability: {
          $switch: {
            branches: [
              {
                case: {
                  $or: [
                    { $eq: [{ $ifNull: ["$observedAt", null] }, null] },
                    { $gt: ["$observedAt", now] },
                  ],
                },
                then: "UNKNOWN",
              },
              {
                case: {
                  $or: [
                    { $eq: ["$status", "OFFLINE"] },
                    { $lt: ["$observedAt", new Date(now.getTime() - 300000)] },
                  ],
                },
                then: "OFFLINE",
              },
              { case: { $eq: ["$status", "DEGRADED"] }, then: "DEGRADED" },
              {
                case: {
                  $and: [
                    { $eq: ["$status", "ONLINE"] },
                    { $lte: ["$observedAt", now] },
                  ],
                },
                then: "ONLINE",
              },
            ],
            default: "UNKNOWN",
          },
        },
      },
    },
  ];
}
export async function aggregateSecurity(
  query: BusinessQuery,
  range: BusinessRange,
  now: Date,
): Promise<SecurityMetrics> {
  const fort = { ...query, plan: "FORT_KNOX" as const };
  const [cameras, incidents, evidence, properties, organizations, failures] =
    await Promise.all([
      SecurityCamera.aggregate<{
        cctvProperties: number;
        registeredCameras: number;
        onlineCameras: number;
        offlineCameras: number;
        degradedCameras: number;
        unknownCameras: number;
        simulatedCameras: number;
      }>([
        ...cameraPipeline(fort, now),
        {
          $group: {
            _id: null,
            propertyIds: { $addToSet: "$propertyId" },
            registeredCameras: { $sum: 1 },
            onlineCameras: sumIf({ $eq: ["$availability", "ONLINE"] }),
            offlineCameras: sumIf({ $eq: ["$availability", "OFFLINE"] }),
            degradedCameras: sumIf({ $eq: ["$availability", "DEGRADED"] }),
            unknownCameras: sumIf({ $eq: ["$availability", "UNKNOWN"] }),
            simulatedCameras: sumIf({ $eq: ["$metadata.simulated", true] }),
          },
        },
        { $set: { cctvProperties: { $size: "$propertyIds" } } },
        { $project: { _id: 0, propertyIds: 0 } },
      ])
        .option({ maxTimeMS: 10000 })
        .exec(),
      Incident.aggregate<{
        recentIncidents: number;
        unresolvedIncidents: number;
        criticalIncidents: number;
      }>([
        ...resourcePipeline(fort),
        {
          $group: {
            _id: null,
            recentIncidents: sumIf(within("$reportedAt", range.from, range.to)),
            unresolvedIncidents: sumIf({
              $in: ["$status", ["OPEN", "INVESTIGATING", "CONTAINED"]],
            }),
            criticalIncidents: sumIf({
              $and: [
                { $in: ["$status", ["OPEN", "INVESTIGATING", "CONTAINED"]] },
                { $eq: ["$severity", "CRITICAL"] },
              ],
            }),
          },
        },
      ])
        .option({ maxTimeMS: 10000 })
        .exec(),
      scopedCount(
        Evidence,
        fort,
        { capturedAt: { $gte: range.from, $lt: range.to } },
        now,
      ),
      scopedCount(Property, fort, {}, now),
      Organization.aggregate<{ count: number }>([
        ...organizationPipeline(fort, now),
        { $count: "count" },
      ])
        .option({ maxTimeMS: 10000 })
        .exec(),
      scopedCount(
        IntegrationAttempt,
        fort,
        {
          provider: { $in: ["CCTV", "CCTV_GATEWAY", "NVR"] },
          status: "FAILED",
          createdAt: { $gte: range.from, $lt: range.to },
        },
        now,
      ),
    ]);
  const cameraCounts = cameras.at(0) ?? {
    cctvProperties: 0,
    registeredCameras: 0,
    onlineCameras: 0,
    offlineCameras: 0,
    degradedCameras: 0,
    unknownCameras: 0,
    simulatedCameras: 0,
  };
  const incidentCounts = incidents.at(0) ?? {
    recentIncidents: 0,
    unresolvedIncidents: 0,
    criticalIncidents: 0,
  };
  return {
    organizations: organizations.at(0)?.count ?? 0,
    properties,
    ...cameraCounts,
    ...incidentCounts,
    evidenceEvents: evidence,
    connectivityFailures: failures,
    gatewayHealth: null,
  };
}
export function organizationPipeline(
  query: BusinessQuery,
  now: Date,
): PipelineStage[] {
  return [
    { $match: organizationScope(query) },
    {
      $lookup: {
        from: "organizationsubscriptions",
        localField: "_id",
        foreignField: "organizationId",
        as: "subscription",
      },
    },
    { $set: { subscription: { $arrayElemAt: ["$subscription", 0] } } },
    {
      $lookup: {
        from: "subscriptionplans",
        localField: "subscription.planId",
        foreignField: "_id",
        as: "catalog",
      },
    },
    { $set: { plan: bucket({ $arrayElemAt: ["$catalog.key", 0] }) } },
    ...(query.plan === "ALL" ? [] : [{ $match: { plan: query.plan } }]),
    {
      $set: {
        active: {
          $and: [
            { $eq: ["$status", "ACTIVE"] },
            { $eq: ["$subscription.status", "ACTIVE"] },
            { $gt: ["$subscription.currentPeriodEnd", now] },
            {
              $or: [
                { $eq: [{ $ifNull: ["$onboarding", null] }, null] },
                { $eq: ["$onboarding.state", "ACTIVE"] },
              ],
            },
          ],
        },
        onboardingPending: {
          $and: [
            { $ne: [{ $ifNull: ["$onboarding", null] }, null] },
            { $ne: ["$onboarding.state", "ACTIVE"] },
          ],
        },
        monthlyMinor: {
          $cond: [
            {
              $and: [
                {
                  $isNumber:
                    "$subscription.metadata.commercialSnapshot.monthlyMinor",
                },
                {
                  $gte: [
                    "$subscription.metadata.commercialSnapshot.monthlyMinor",
                    0,
                  ],
                },
              ],
            },
            "$subscription.metadata.commercialSnapshot.monthlyMinor",
            null,
          ],
        },
        currency: "$subscription.metadata.commercialSnapshot.currency",
      },
    },
  ];
}
function portfolioLookup(collection: string, name: string): PipelineStage {
  return {
    $lookup: {
      from: collection,
      let: { org: "$_id" },
      pipeline: [
        { $match: { $expr: { $eq: ["$organizationId", "$$org"] } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            active: sumIf({ $ne: ["$status", "INACTIVE"] }),
          },
        },
      ],
      as: name,
    },
  };
}
export interface OrganizationAggregation {
  plans: PlanMetrics[];
  mrr: Array<{
    _id: { plan: string; currency: string };
    mrrMinor: number;
    activeSubscriptionValueMinor: number;
    pricedOrganizations: number;
    pricedUnits: number;
  }>;
  daily: Array<{
    _id: { day: string; plan: string };
    signups: number;
    activations: number;
  }>;
  previous: Array<{ _id: string; signups: number; activations: number }>;
}
export async function aggregateOrganizations(
  query: BusinessQuery,
  range: BusinessRange,
  now: Date,
) {
  const data = await Organization.aggregate<OrganizationAggregation>([
    ...organizationPipeline(query, now),
    portfolioLookup("properties", "properties"),
    portfolioLookup("buildings", "buildings"),
    portfolioLookup("units", "units"),
    {
      $set: {
        propertyCount: {
          $ifNull: [{ $arrayElemAt: ["$properties.count", 0] }, 0],
        },
        buildingCount: {
          $ifNull: [{ $arrayElemAt: ["$buildings.count", 0] }, 0],
        },
        unitCount: { $ifNull: [{ $arrayElemAt: ["$units.count", 0] }, 0] },
        activeUnitCount: {
          $ifNull: [{ $arrayElemAt: ["$units.active", 0] }, 0],
        },
      },
    },
    {
      $facet: {
        plans: [
          {
            $group: {
              _id: "$plan",
              organizations: { $sum: 1 },
              activeOrganizations: sumIf("$active"),
              onboardingOrganizations: sumIf("$onboardingPending"),
              suspendedOrganizations: sumIf({ $eq: ["$status", "SUSPENDED"] }),
              cancelledOrganizations: sumIf({
                $eq: ["$subscription.status", "CANCELLED"],
              }),
              trialOrganizations: sumIf({
                $eq: ["$subscription.status", "TRIALING"],
              }),
              properties: { $sum: "$propertyCount" },
              buildings: { $sum: "$buildingCount" },
              units: { $sum: "$unitCount" },
              activeUnits: { $sum: "$activeUnitCount" },
              cohortSignups: sumIf(within("$createdAt", range.from, range.to)),
              cohortActivated: sumIf({
                $and: [within("$createdAt", range.from, range.to), "$active"],
              }),
              activations: sumIf(
                within("$onboarding.activatedAt", range.from, range.to),
              ),
              newSubscriptions: sumIf(
                within("$subscription.createdAt", range.from, range.to),
              ),
              stuckOnboarding: sumIf({
                $and: [
                  "$onboardingPending",
                  {
                    $lt: [
                      { $ifNull: ["$onboarding.stateChangedAt", "$updatedAt"] },
                      new Date(now.getTime() - 3 * 86400000),
                    ],
                  },
                ],
              }),
              awaitingConfiguration: sumIf({
                $eq: ["$onboarding.state", "ACCOUNT_CREATED"],
              }),
              awaitingSignature: sumIf({
                $in: [
                  "$onboarding.state",
                  ["CONTRACT_GENERATED", "CONTRACT_PENDING_SIGNATURE"],
                ],
              }),
              awaitingPayment: sumIf({
                $in: [
                  "$onboarding.state",
                  [
                    "CONTRACT_SIGNED",
                    "INVOICE_ISSUED",
                    "PAYMENT_PENDING",
                    "PAYMENT_VERIFIED",
                  ],
                ],
              }),
              requiresAttention: sumIf({
                $ne: [{ $ifNull: ["$onboarding.attentionCode", null] }, null],
              }),
              subscriptionsWithPrice: sumIf({
                $and: ["$active", { $ne: ["$monthlyMinor", null] }],
              }),
              subscriptionsMissingPrice: sumIf({
                $and: ["$active", { $eq: ["$monthlyMinor", null] }],
              }),
            },
          },
          {
            $set: {
              plan: "$_id",
              averageUnits: {
                $cond: [
                  { $gt: ["$organizations", 0] },
                  { $divide: ["$units", "$organizations"] },
                  0,
                ],
              },
              onboardingConversion: {
                $cond: [
                  { $gt: ["$cohortSignups", 0] },
                  { $divide: ["$cohortActivated", "$cohortSignups"] },
                  null,
                ],
              },
            },
          },
          { $project: { _id: 0 } },
        ],
        mrr: [
          {
            $match: {
              active: true,
              monthlyMinor: { $ne: null },
              currency: { $type: "string" },
            },
          },
          {
            $group: {
              _id: { plan: "$plan", currency: "$currency" },
              mrrMinor: { $sum: "$monthlyMinor" },
              activeSubscriptionValueMinor: {
                $sum: "$subscription.metadata.commercialSnapshot.recurringMinor",
              },
              pricedOrganizations: { $sum: 1 },
              pricedUnits: { $sum: "$activeUnitCount" },
            },
          },
        ],
      },
    },
  ])
    .option({ maxTimeMS: 15000 })
    .exec();
  const growth = await aggregateGrowth(query, range, now);
  return {
    ...(data[0] ?? { plans: [], mrr: [], daily: [], previous: [] }),
    daily: growth.daily,
    previous: growth.previous,
  };
}
async function aggregateGrowth(
  query: BusinessQuery,
  range: BusinessRange,
  now: Date,
) {
  const rows = await Organization.aggregate<
    Pick<OrganizationAggregation, "daily" | "previous">
  >([
    {
      $match: {
        $or: [
          { createdAt: { $gte: range.previousFrom, $lt: range.to } },
          {
            "onboarding.activatedAt": {
              $gte: range.previousFrom,
              $lt: range.to,
            },
          },
        ],
      },
    },
    ...organizationPipeline(query, now),
    {
      $facet: {
        daily: [
          {
            $project: {
              plan: 1,
              events: [
                { at: "$createdAt", kind: "signup" },
                { at: "$onboarding.activatedAt", kind: "activation" },
              ],
            },
          },
          { $unwind: "$events" },
          { $match: { "events.at": { $gte: range.from, $lt: range.to } } },
          {
            $group: {
              _id: {
                plan: "$plan",
                day: {
                  $dateToString: {
                    date: "$events.at",
                    format: "%Y-%m-%d",
                    timezone: range.timeZone,
                  },
                },
              },
              signups: sumIf({ $eq: ["$events.kind", "signup"] }),
              activations: sumIf({ $eq: ["$events.kind", "activation"] }),
            },
          },
          { $sort: { "_id.day": 1, "_id.plan": 1 } },
        ],
        previous: [
          {
            $group: {
              _id: "$plan",
              signups: sumIf(
                within("$createdAt", range.previousFrom, range.previousTo),
              ),
              activations: sumIf(
                within(
                  "$onboarding.activatedAt",
                  range.previousFrom,
                  range.previousTo,
                ),
              ),
            },
          },
        ],
      },
    },
  ])
    .option({ maxTimeMS: 10000 })
    .exec();
  return rows.at(0) ?? { daily: [], previous: [] };
}
export function invoicePipeline(
  query: BusinessQuery,
  now: Date,
): PipelineStage[] {
  return [
    ...organizationJoin(query),
    {
      $set: {
        plan: bucket({
          $ifNull: ["$commercialSnapshot.planKey", "$metadata.planKey"],
        }),
        issued: { $ifNull: ["$issuedAt", "$createdAt"] },
        totalValue: {
          $ifNull: [
            "$totalMinor",
            { $round: [{ $multiply: ["$total", 100] }, 0] },
          ],
        },
        paidValue: { $round: [{ $multiply: ["$amountPaid", 100] }, 0] },
      },
    },
    ...(query.plan === "ALL" ? [] : [{ $match: { plan: query.plan } }]),
    {
      $lookup: {
        from: "billingevents",
        let: {
          org: "$organizationId",
          reference: "$providerInvoiceId",
          provider: "$provider",
        },
        pipeline: [
          {
            $match: {
              type: "INVOICE_PAID",
              status: "PROCESSED",
              $expr: {
                $and: [
                  { $ne: [{ $ifNull: ["$$reference", null] }, null] },
                  { $eq: ["$organizationId", "$$org"] },
                  { $eq: ["$externalReference", "$$reference"] },
                  { $eq: ["$provider", "$$provider"] },
                ],
              },
            },
          },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ],
        as: "verifiedEvent",
      },
    },
    {
      $set: {
        verified: {
          $and: [
            { $eq: ["$status", "PAID"] },
            { $gte: ["$paidValue", "$totalValue"] },
            { $gt: [{ $size: "$verifiedEvent" }, 0] },
            { $lte: ["$paidAt", now] },
          ],
        },
        outstanding: {
          $cond: [
            { $in: ["$status", ["OPEN", "PAST_DUE"]] },
            { $max: [0, { $subtract: ["$totalValue", "$paidValue"] }] },
            0,
          ],
        },
      },
    },
  ];
}
export async function aggregateInvoices(
  query: BusinessQuery,
  range: BusinessRange,
  now: Date,
) {
  return SubscriptionInvoice.aggregate<
    RevenueMetrics & { _id: { plan: string; currency: string } }
  >([
    {
      $match: {
        $or: [
          { createdAt: { $gte: range.from, $lt: range.to } },
          { issuedAt: { $gte: range.from, $lt: range.to } },
          { paidAt: { $gte: range.from, $lt: range.to } },
          { status: { $in: ["OPEN", "PAST_DUE"] } },
        ],
      },
    },
    ...invoicePipeline(query, now),
    {
      $group: {
        _id: { plan: "$plan", currency: "$currency" },
        invoicedMinor: {
          $sum: {
            $cond: [
              {
                $and: [
                  within("$issued", range.from, range.to),
                  { $not: [{ $in: ["$status", ["DRAFT", "VOID"]] }] },
                ],
              },
              "$totalValue",
              0,
            ],
          },
        },
        invoicedCount: sumIf({
          $and: [
            within("$issued", range.from, range.to),
            { $not: [{ $in: ["$status", ["DRAFT", "VOID"]] }] },
          ],
        }),
        collectedMinor: {
          $sum: {
            $cond: [
              { $and: ["$verified", within("$paidAt", range.from, range.to)] },
              "$paidValue",
              0,
            ],
          },
        },
        cohortCollectedMinor: {
          $sum: {
            $cond: [
              { $and: ["$verified", within("$issued", range.from, range.to)] },
              "$paidValue",
              0,
            ],
          },
        },
        verifiedPayments: sumIf({
          $and: ["$verified", within("$paidAt", range.from, range.to)],
        }),
        outstandingMinor: { $sum: "$outstanding" },
        outstandingCount: sumIf({ $gt: ["$outstanding", 0] }),
        overdueMinor: {
          $sum: { $cond: [{ $lt: ["$dueDate", now] }, "$outstanding", 0] },
        },
        overdueCount: sumIf({
          $and: [{ $gt: ["$outstanding", 0] }, { $lt: ["$dueDate", now] }],
        }),
        unverifiedPaidMinor: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$status", "PAID"] },
                  { $not: ["$verified"] },
                  within("$paidAt", range.from, range.to),
                ],
              },
              "$paidValue",
              0,
            ],
          },
        },
      },
    },
  ])
    .option({ maxTimeMS: 15000 })
    .exec();
}
export async function aggregateMovements(
  query: BusinessQuery,
  range: BusinessRange,
) {
  const [movements, coverage] = await Promise.all([
    OrganizationSubscription.aggregate<{
      _id: { plan: string; kind: string };
      count: number;
    }>([
      {
        $match: {
          "businessTransitions.at": { $gte: range.from, $lt: range.to },
        },
      },
      ...organizationJoin(query),
      { $unwind: "$businessTransitions" },
      {
        $match: {
          "businessTransitions.at": { $gte: range.from, $lt: range.to },
        },
      },
      { $set: { plan: bucket("$businessTransitions.toPlan") } },
      ...(query.plan === "ALL" ? [] : [{ $match: { plan: query.plan } }]),
      {
        $group: {
          _id: { plan: "$plan", kind: "$businessTransitions.kind" },
          count: { $sum: 1 },
        },
      },
    ])
      .option({ maxTimeMS: 10000 })
      .exec(),
    OrganizationSubscription.aggregate<{ at: Date }>([
      { $match: { businessTrackingStartedAt: { $type: "date" } } },
      ...organizationJoin(query),
      { $group: { _id: null, at: { $min: "$businessTrackingStartedAt" } } },
    ])
      .option({ maxTimeMS: 10000 })
      .exec(),
  ]);
  return [{ movements, coverage }];
}
export async function scopedCount(
  source: { aggregate<T>(pipeline: PipelineStage[]): Aggregate<T[]> },
  query: BusinessQuery,
  match: Record<string, unknown>,
  now: Date,
) {
  const result = await source
    .aggregate<{ count: number }>([
      { $match: match },
      ...organizationJoin(query),
      {
        $lookup: {
          from: "organizationsubscriptions",
          localField: "organizationId",
          foreignField: "organizationId",
          as: "subscription",
        },
      },
      {
        $lookup: {
          from: "subscriptionplans",
          localField: "subscription.planId",
          foreignField: "_id",
          as: "catalog",
        },
      },
      { $set: { plan: bucket({ $arrayElemAt: ["$catalog.key", 0] }) } },
      ...(query.plan === "ALL" ? [] : [{ $match: { plan: query.plan } }]),
      { $count: "count" },
    ])
    .option({ maxTimeMS: 10000 })
    .exec();
  void now;
  return result[0]?.count ?? 0;
}
export const businessSources = {
  Organization,
  OrganizationSubscription,
  SubscriptionInvoice,
  Property,
  Building,
  Unit,
  SecurityCamera,
  Incident,
  Evidence,
  Job,
  Notification,
  IntegrationAttempt,
  AuditLog,
  BillingEvent,
};
export const objectId = (id: string) => new Types.ObjectId(id);
