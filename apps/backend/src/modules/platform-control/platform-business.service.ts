import mongoose, { type Aggregate, type PipelineStage } from "mongoose";
import { createHash } from "node:crypto";
import { env } from "../../config/env.js";
import { AuthorizationService } from "../../core/authorization/authorization.service.js";
import type { AuthenticatedUser } from "../../core/types/auth.js";
import { AppError } from "../../core/errors/AppError.js";
import { monitoringEnvironment } from "../../core/observability/platform-telemetry.js";
import {
  PlatformHeartbeat,
  PlatformMonitorAlert,
} from "../../database/models/PlatformMonitoring.js";
import { WebhookEvent } from "../../database/models/WebhookEvent.js";
import { PlatformBrief } from "../../database/models/PlatformBrief.js";
import { AuditService } from "../audit/audit.service.js";
import {
  aggregateOrganizations,
  aggregateInvoices,
  aggregateMovements,
  aggregateSecurity,
  scopedCount,
  businessSources as sources,
  organizationPipeline,
  invoicePipeline,
  cameraPipeline,
  resourcePipeline,
  objectId,
} from "./platform-business.repository.js";
import {
  businessQuery,
  drillQuery,
  briefRequest,
  resolveBusinessRange,
  type BusinessQuery,
  type BusinessRange,
} from "./platform-business.schemas.js";
import type {
  BusinessOverview,
  BusinessAction,
  PlanMetrics,
  RevenueMetrics,
  OperationalMetric,
} from "./platform-business.types.js";

const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
type AggregateSource = {
  aggregate<T>(pipeline: PipelineStage[]): Aggregate<T[]>;
};
export interface DrillItem {
  _id: string;
  organizationId?: string;
  organizationName?: string;
  name?: string;
  plan?: string;
  status?: string;
  state?: string;
  attentionCode?: string;
  invoiceNumber?: string;
  totalMinor?: number;
  currency?: string;
  dueDate?: string;
  contractId?: string;
  documentId?: string;
  propertyId?: string;
  cameraCode?: string;
  availability?: string;
  severity?: string;
  title?: string;
  kind?: string;
  at?: string;
  fromPlan?: string;
  toPlan?: string;
}
export function requireBusinessDataset(query: Pick<BusinessQuery, "dataset">) {
  if (
    query.dataset === "DEMO" &&
    !["development", "test"].includes(env.NODE_ENV)
  )
    throw new AppError(
      403,
      "DEMO_DATA_UNAVAILABLE",
      "Simulated analytics are available only in development and test",
    );
}
async function auditRead(
  auth: AuthenticatedUser,
  action: string,
  metadata: Record<string, unknown>,
  organizationId?: string,
) {
  await AuditService.record({
    actorUserId: auth.userId,
    actorRole: "SUPER_ADMIN",
    action,
    resourceType: "PlatformBusinessIntelligence",
    ...(organizationId ? { organizationId: objectId(organizationId) } : {}),
    metadata,
  });
}
async function paged(
  source: AggregateSource,
  pipeline: PipelineStage[],
  projection: Record<string, unknown>,
  page: number,
  pageSize: number,
  sort: Record<string, 1 | -1>,
) {
  const data = await source
    .aggregate<{ items: DrillItem[]; total: Array<{ count: number }> }>([
      ...pipeline,
      {
        $facet: {
          items: [
            { $sort: sort },
            { $skip: (page - 1) * pageSize },
            { $limit: pageSize },
            { $project: projection },
          ],
          total: [{ $count: "count" }],
        },
      },
    ])
    .option({ maxTimeMS: 15000 })
    .exec();
  return {
    items: data[0]?.items ?? [],
    total: data[0]?.total[0]?.count ?? 0,
    page,
    pageSize,
  };
}
const emptyPlan = (plan: string): PlanMetrics => ({
  plan,
  organizations: 0,
  activeOrganizations: 0,
  onboardingOrganizations: 0,
  suspendedOrganizations: 0,
  cancelledOrganizations: 0,
  trialOrganizations: 0,
  properties: 0,
  buildings: 0,
  units: 0,
  activeUnits: 0,
  averageUnits: 0,
  cohortSignups: 0,
  cohortActivated: 0,
  onboardingConversion: null,
  activations: 0,
  newSubscriptions: 0,
  stuckOnboarding: 0,
  awaitingConfiguration: 0,
  awaitingSignature: 0,
  awaitingPayment: 0,
  requiresAttention: 0,
  subscriptionsWithPrice: 0,
  subscriptionsMissingPrice: 0,
});
export function combineRevenue(
  mrr: Awaited<ReturnType<typeof aggregateOrganizations>>["mrr"],
  invoices: Awaited<ReturnType<typeof aggregateInvoices>>,
): RevenueMetrics[] {
  const rows = new Map<string, RevenueMetrics>();
  const row = (plan: string, currency: string) => {
    const key = plan + ":" + currency;
    let current = rows.get(key);
    if (!current) {
      current = {
        plan,
        currency,
        mrrMinor: 0,
        arrMinor: 0,
        activeSubscriptionValueMinor: 0,
        pricedOrganizations: 0,
        pricedUnits: 0,
        invoicedMinor: 0,
        collectedMinor: 0,
        cohortCollectedMinor: 0,
        outstandingMinor: 0,
        overdueMinor: 0,
        unverifiedPaidMinor: 0,
        invoicedCount: 0,
        verifiedPayments: 0,
        outstandingCount: 0,
        overdueCount: 0,
        collectionRate: null,
        averageRevenuePerOrganizationMinor: null,
        averageRevenuePerUnitMinor: null,
        revenueContribution: null,
      };
      rows.set(key, current);
    }
    return current;
  };
  for (const value of mrr) {
    const { _id, ...amounts } = value;
    Object.assign(row(_id.plan, _id.currency), amounts);
  }
  for (const value of invoices) {
    const { _id, ...amounts } = value;
    Object.assign(row(_id.plan, _id.currency), amounts);
  }
  const result = [...rows.values()];
  for (const value of result) {
    value.arrMinor = value.mrrMinor * 12;
    value.collectionRate = value.invoicedMinor
      ? value.cohortCollectedMinor / value.invoicedMinor
      : null;
    value.averageRevenuePerOrganizationMinor = value.pricedOrganizations
      ? value.mrrMinor / value.pricedOrganizations
      : null;
    value.averageRevenuePerUnitMinor = value.pricedUnits
      ? value.mrrMinor / value.pricedUnits
      : null;
    const total = result
      .filter((r) => r.currency === value.currency)
      .reduce((sum, r) => sum + r.mrrMinor, 0);
    value.revenueContribution = total ? value.mrrMinor / total : null;
  }
  return result;
}
export const sortActions = (actions: BusinessAction[]) =>
  actions.sort(
    (a, b) =>
      ["CRITICAL", "HIGH", "MEDIUM", "INFORMATIONAL"].indexOf(a.severity) -
        ["CRITICAL", "HIGH", "MEDIUM", "INFORMATIONAL"].indexOf(b.severity) ||
      b.count - a.count ||
      a.id.localeCompare(b.id),
  );
export function actionLink(
  query: BusinessQuery,
  kind: string,
  organizationId?: string,
) {
  const params = new URLSearchParams({
    tab: "plan performance",
    kind,
    ...query,
  });
  if (organizationId) params.set("organizationId", organizationId);
  return "/platform?" + params.toString();
}

async function operations(
  query: BusinessQuery,
  range: BusinessRange,
  now: Date,
) {
  const period = { createdAt: { $gte: range.from, $lt: range.to } };
  const definitions = [
    {
      key: "failedJobs",
      label: "Failed / dead-letter jobs",
      source: sources.Job,
      match: { status: { $in: ["FAILED", "DEAD_LETTER"] } },
      window: "CURRENT" as const,
    },
    {
      key: "queueBacklog",
      label: "Over-age queued jobs",
      source: sources.Job,
      match: {
        status: "QUEUED",
        availableAt: {
          $lt: new Date(
            now.getTime() - env.MONITORING_QUEUE_AGE_SECONDS * 1000,
          ),
        },
      },
      window: "CURRENT" as const,
    },
    {
      key: "expiredLeases",
      label: "Expired running-job leases",
      source: sources.Job,
      match: { status: "RUNNING", leaseExpiresAt: { $lt: now } },
      window: "CURRENT" as const,
    },
    {
      key: "failedBillingEvents",
      label: "Failed billing event processing",
      source: sources.BillingEvent,
      match: { ...period, status: "FAILED" },
      window: "PERIOD" as const,
    },
    {
      key: "failedPayments",
      label: "Failed / reversed payment events",
      source: sources.BillingEvent,
      match: {
        ...period,
        type: { $in: ["PAYMENT_FAILED", "INVOICE_FAILED", "PAYMENT_REVERSED"] },
      },
      window: "PERIOD" as const,
    },
    {
      key: "integrationFailures",
      label: "Failed integration attempts",
      source: sources.IntegrationAttempt,
      match: { ...period, status: "FAILED" },
      window: "PERIOD" as const,
    },
    {
      key: "notificationFailures",
      label: "Failed notifications",
      source: sources.Notification,
      match: { ...period, status: "FAILED" },
      window: "PERIOD" as const,
    },
    {
      key: "switchChanges",
      label: "Service-switch changes",
      source: sources.AuditLog,
      match: {
        occurredAt: { $gte: range.from, $lt: range.to },
        action: {
          $in: ["platform.switch.enabled", "platform.switch.disabled"],
        },
      },
      window: "PERIOD" as const,
    },
  ];
  const data: OperationalMetric[] = await Promise.all(
    definitions.map(async (d) => ({
      key: d.key,
      label: d.label,
      value: await scopedCount(d.source, query, d.match, now),
      source: d.source.modelName,
      window: d.window,
    })),
  );
  // Platform-global observations cannot be attributed to a tier or mixed into a demo dataset.
  if (query.dataset === "LIVE" && query.plan === "ALL") {
    const [webhooks, switches, worker] = await Promise.all([
      WebhookEvent.countDocuments({
        status: "FAILED",
        receivedAt: { $gte: range.from, $lt: range.to },
      }),
      sources.AuditLog.countDocuments({
        organizationId: { $exists: false },
        occurredAt: { $gte: range.from, $lt: range.to },
        action: {
          $in: ["platform.switch.enabled", "platform.switch.disabled"],
        },
      }),
      PlatformHeartbeat.findOne({
        environment: monitoringEnvironment(),
        kind: "WORKER",
        expiresAt: { $gt: now },
      })
        .sort({ lastAt: -1 })
        .select("lastAt stoppedAt")
        .lean(),
    ]);
    data.push({
      key: "webhookFailures",
      label: "Failed webhook events",
      value: webhooks,
      source: "WebhookEvent (platform-wide)",
      window: "PERIOD",
    });
    const switchMetric = data.find((r) => r.key === "switchChanges");
    if (switchMetric) switchMetric.value = (switchMetric.value ?? 0) + switches;
    data.push({
      key: "workerStale",
      label: "Stale worker heartbeat",
      value: worker
        ? Number(
            Boolean(worker.stoppedAt) ||
              now.getTime() - worker.lastAt.getTime() >
                env.MONITORING_HEARTBEAT_STALE_SECONDS * 1000,
          )
        : null,
      source: "PlatformHeartbeat; no expected fleet inferred",
      window: "CURRENT",
    });
    for (const definition of definitions) {
      if (definition.key === "switchChanges") continue;
      const rows = await definition.source
        .aggregate<{ count: number }>([
          {
            $match: {
              ...definition.match,
              organizationId: { $exists: false },
              "metadata.simulated": { $ne: true },
              "payload.simulated": { $ne: true },
            },
          },
          { $count: "count" },
        ])
        .option({ maxTimeMS: 10000 })
        .exec();
      const metric = data.find((row) => row.key === definition.key);
      if (metric) metric.value = (metric.value ?? 0) + (rows[0]?.count ?? 0);
    }
  } else
    data.push({
      key: "webhookFailures",
      label: "Failed webhooks / worker heartbeat",
      value: null,
      source: "Global data is not attributable to this tier/demo selection",
      window: "PERIOD",
    });
  return data;
}

export class PlatformBusinessService {
  static async overview(
    auth: AuthenticatedUser,
    raw: unknown,
    now = new Date(),
  ) {
    AuthorizationService.assertPlatformAdmin(auth);
    const query = businessQuery.parse(raw);
    requireBusinessDataset(query);
    const range = resolveBusinessRange(query, now);
    const result = await this.collect(query, range, now);
    await auditRead(auth, "platform.business.viewed", {
      query,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    });
    return result;
  }
  static async collect(
    query: BusinessQuery,
    range: BusinessRange,
    now: Date,
  ): Promise<BusinessOverview> {
    const unavailableSources: string[] = [],
      warnings = [
        "Stocks (active organizations, MRR, portfolio, outstanding and overdue) describe generation time. The period filter applies to flows and invoice cohorts.",
        "Signups/conversion use the signup cohort and current tier; activations use persisted onboarding.activatedAt. Legacy activation timestamps may be absent.",
        "MRR uses saved contracted monthly price for unexpired ACTIVE subscriptions. Legacy subscriptions without a commercial snapshot are excluded and disclosed.",
        "Collections require PAID invoice state and a matching PROCESSED billing payment event. Manual/unsupported legacy settlements are disclosed, not counted as verified.",
        "Churn rate and historical MRR are unavailable without complete opening subscription cohorts and recorded snapshots. Movement tracking is prospective.",
        "Camera availability uses recorded observations (five-minute freshness). Registry defaults are UNKNOWN without a timestamp. Gateway probe history is unavailable.",
      ];
    if (query.dataset === "DEMO")
      warnings.unshift(
        "SIMULATED DEMO DATA — not production business, payment or camera telemetry.",
      );
    const read = async <T>(name: string, fn: () => Promise<T>, fallback: T) => {
      try {
        return await fn();
      } catch {
        unavailableSources.push(name);
        return fallback;
      }
    };
    const [orgs, invoices, movements, security, ops] = await Promise.all([
      read(
        "organizations/subscriptions/portfolio",
        () => aggregateOrganizations(query, range, now),
        { plans: [], mrr: [], daily: [], previous: [] },
      ),
      read(
        "invoices/verified-payment-events",
        () => aggregateInvoices(query, range, now),
        [],
      ),
      read(
        "subscription-movement-history",
        () => aggregateMovements(query, range),
        [],
      ),
      query.plan === "ALL" || query.plan === "FORT_KNOX"
        ? read(
            "Fort Knox/security",
            () => aggregateSecurity(query, range, now),
            null,
          )
        : null,
      read("platform-operations", () => operations(query, range, now), []),
    ]);
    const plans = orgs.plans;
    if (!unavailableSources.includes("organizations/subscriptions/portfolio"))
      for (const key of query.plan === "ALL"
        ? ["CONTROL", "FORT_KNOX"]
        : [query.plan])
        if (!plans.some((p) => p.plan === key)) plans.push(emptyPlan(key));
    const revenue = combineRevenue(orgs.mrr, invoices),
      actions: BusinessAction[] = [];
    const add = (
      id: string,
      severity: BusinessAction["severity"],
      category: string,
      title: string,
      count: number,
      href: string,
    ) => {
      if (count > 0)
        actions.push({
          id,
          severity,
          category,
          title,
          count,
          href,
          plan:
            new URL(href, "https://platform.invalid").searchParams.get(
              "plan",
            ) ?? undefined,
        });
    };
    for (const p of plans) {
      const selection = { ...query, plan: p.plan as BusinessQuery["plan"] };
      add(
        p.plan + ":attention",
        "HIGH",
        "Onboarding",
        "Payment or activation requires intervention",
        p.requiresAttention,
        actionLink(selection, "ATTENTION"),
      );
      add(
        p.plan + ":stuck",
        "MEDIUM",
        "Onboarding",
        "Onboarding unchanged for more than 72 hours",
        p.stuckOnboarding,
        actionLink(selection, "ONBOARDING"),
      );
      add(
        p.plan + ":signature",
        "INFORMATIONAL",
        "Onboarding",
        "Contracts awaiting landlord signature",
        p.awaitingSignature,
        actionLink(selection, "SIGNATURE"),
      );
      add(
        p.plan + ":price",
        "HIGH",
        "Billing",
        "Active subscriptions lack a contracted price snapshot",
        p.subscriptionsMissingPrice,
        actionLink(selection, "ACTIVE"),
      );
    }
    for (const r of revenue) {
      add(
        r.plan + ":overdue:" + r.currency,
        "HIGH",
        "Billing",
        `Overdue ${r.currency} subscription invoices`,
        r.overdueCount,
        actionLink(
          { ...query, plan: r.plan as BusinessQuery["plan"] },
          "OVERDUE",
        ),
      );
      if (r.unverifiedPaidMinor > 0)
        add(
          r.plan + ":unverified:" + r.currency,
          "HIGH",
          "Billing",
          "Paid invoices lack verified settlement evidence",
          1,
          actionLink(
            { ...query, plan: r.plan as BusinessQuery["plan"] },
            "UNVERIFIED_PAYMENTS",
          ),
        );
    }
    if (security) {
      add(
        "cctv:offline",
        "HIGH",
        "Fort Knox",
        "Observed offline Fort Knox cameras",
        security.offlineCameras,
        actionLink({ ...query, plan: "FORT_KNOX" }, "CAMERAS"),
      );
      add(
        "cctv:degraded",
        "MEDIUM",
        "Fort Knox",
        "Degraded Fort Knox cameras",
        security.degradedCameras,
        actionLink({ ...query, plan: "FORT_KNOX" }, "CAMERAS"),
      );
      add(
        "security:critical",
        "CRITICAL",
        "Fort Knox",
        "Unresolved critical security incidents",
        security.criticalIncidents,
        actionLink({ ...query, plan: "FORT_KNOX" }, "INCIDENTS"),
      );
      add(
        "security:unresolved",
        "HIGH",
        "Fort Knox",
        "Unresolved security incidents",
        security.unresolvedIncidents - security.criticalIncidents,
        actionLink({ ...query, plan: "FORT_KNOX" }, "INCIDENTS"),
      );
    }
    for (const op of ops)
      if (op.value)
        add(
          "ops:" + op.key,
          op.key === "workerStale"
            ? "CRITICAL"
            : op.key === "switchChanges"
              ? "INFORMATIONAL"
              : "HIGH",
          op.key === "failedPayments" || op.key === "failedBillingEvents"
            ? "Billing"
            : "Operations",
          op.label,
          op.value,
          op.key === "failedPayments" || op.key === "failedBillingEvents"
            ? actionLink(query, "BILLING_EVENTS")
            : "/platform?tab=operations",
        );
    // Reuse recorded monitor severity and ownership, while respecting demo/organization boundaries.
    if (query.dataset === "LIVE")
      try {
        const scopedAlerts = await PlatformMonitorAlert.aggregate<{
          _id: mongoose.Types.ObjectId;
          scope: string;
          title: string;
          severity: string;
          observedValue?: number;
        }>([
          {
            $match: {
              environment: monitoringEnvironment(),
              status: { $ne: "RESOLVED" },
            },
          },
          {
            $set: {
              organizationId: {
                $convert: {
                  input: "$scope",
                  to: "objectId",
                  onError: null,
                  onNull: null,
                },
              },
            },
          },
          ...resourcePipeline(query),
          { $sort: { lastAt: -1 } },
          { $limit: 51 },
          { $project: { scope: 1, title: 1, severity: 1, observedValue: 1 } },
        ])
          .option({ maxTimeMS: 10000 })
          .exec();
        const globalAlerts =
          query.plan === "ALL"
            ? await PlatformMonitorAlert.find({
                environment: monitoringEnvironment(),
                scope: "PLATFORM",
                status: { $ne: "RESOLVED" },
              })
                .sort({ lastAt: -1 })
                .limit(51)
                .select("scope title severity observedValue")
                .lean()
            : [];
        const alerts = [...globalAlerts, ...scopedAlerts];
        for (const a of alerts.slice(0, 50))
          actions.push({
            id: "monitor:" + a._id,
            severity:
              a.severity === "CRITICAL"
                ? "CRITICAL"
                : a.severity === "HIGH"
                  ? "HIGH"
                  : "MEDIUM",
            category: "Monitoring",
            title: a.title,
            count: a.observedValue ?? 1,
            ...(a.scope === "PLATFORM" ? {} : { organizationId: a.scope }),
            href:
              "/platform?tab=monitoring" +
              (a.scope === "PLATFORM" ? "" : "&organizationId=" + a.scope),
          });
        if (alerts.length > 50)
          warnings.push(
            "Recorded monitor actions are capped at 50; use Monitoring for the complete queue.",
          );
      } catch {
        unavailableSources.push("recorded-monitor-alerts");
      }
    for (const name of unavailableSources)
      add(
        "unavailable:" + name,
        "HIGH",
        "Data integrity",
        `${name} is unavailable; retry before making decisions`,
        1,
        "/platform?tab=plan%20performance",
      );
    return {
      version: 1,
      generatedAt: now.toISOString(),
      asOf: now.toISOString(),
      dataset: query.dataset,
      environment: monitoringEnvironment(),
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        previousFrom: range.previousFrom.toISOString(),
        previousTo: range.previousTo.toISOString(),
        timeZone: range.timeZone,
        period: range.period,
      },
      planFilter: query.plan,
      plans: plans.sort((a, b) => a.plan.localeCompare(b.plan)),
      revenue,
      growth: {
        daily: orgs.daily.map((r) => ({
          day: r._id.day,
          plan: r._id.plan,
          signups: r.signups,
          activations: r.activations,
        })),
        previous: orgs.previous.map((r) => ({
          plan: r._id,
          signups: r.signups,
          activations: r.activations,
        })),
        movements:
          movements[0]?.movements.map((r) => ({
            plan: r._id.plan,
            kind: r._id.kind,
            count: r.count,
          })) ?? [],
        trackingStartedAt: movements[0]?.coverage[0]?.at.toISOString() ?? null,
        churnRate: null,
      },
      fortKnox: security,
      operations: ops,
      actions: sortActions(actions).slice(0, 100),
      actionsTruncated: actions.length > 100,
      warnings,
      unavailableSources,
    };
  }
  static async drill(auth: AuthenticatedUser, raw: unknown, now = new Date()) {
    AuthorizationService.assertPlatformAdmin(auth);
    const query = drillQuery.parse(raw);
    requireBusinessDataset(query);
    const range = resolveBusinessRange(query, now);
    const idMatch = query.organizationId
      ? { $match: { organizationId: objectId(query.organizationId) } }
      : null;
    let result;
    if (
      [
        "INVOICES",
        "OVERDUE",
        "OUTSTANDING",
        "VERIFIED_PAYMENTS",
        "UNVERIFIED_PAYMENTS",
      ].includes(query.kind)
    )
      result = await paged(
        sources.SubscriptionInvoice,
        [
          ...invoicePipeline(query, now),
          ...(idMatch ? [idMatch] : []),
          {
            $match:
              query.kind === "OVERDUE"
                ? { outstanding: { $gt: 0 }, dueDate: { $lt: now } }
                : query.kind === "OUTSTANDING"
                  ? { outstanding: { $gt: 0 } }
                  : query.kind === "VERIFIED_PAYMENTS"
                    ? {
                        verified: true,
                        paidAt: { $gte: range.from, $lt: range.to },
                      }
                    : query.kind === "UNVERIFIED_PAYMENTS"
                      ? {
                          status: "PAID",
                          verified: false,
                          paidAt: { $gte: range.from, $lt: range.to },
                        }
                      : {
                          issued: { $gte: range.from, $lt: range.to },
                          status: { $nin: ["DRAFT", "VOID"] },
                        },
          },
        ],
        {
          organizationId: 1,
          organizationName: "$organization.name",
          plan: 1,
          status: 1,
          invoiceNumber: 1,
          totalMinor: "$totalValue",
          currency: 1,
          dueDate: 1,
          documentId: 1,
          contractId: 1,
          verified: 1,
          outstanding: 1,
        },
        query.page,
        query.pageSize,
        { dueDate: 1, _id: 1 },
      );
    else if (query.kind === "BILLING_EVENTS")
      result = await paged(
        sources.BillingEvent,
        [
          {
            $match: {
              createdAt: { $gte: range.from, $lt: range.to },
              $or: [
                { status: "FAILED" },
                {
                  type: {
                    $in: [
                      "PAYMENT_FAILED",
                      "INVOICE_FAILED",
                      "PAYMENT_REVERSED",
                    ],
                  },
                },
              ],
            },
          },
          ...resourcePipeline(query),
          ...(idMatch ? [idMatch] : []),
          ...(query.dataset === "LIVE" &&
          query.plan === "ALL" &&
          !query.organizationId
            ? [
                {
                  $unionWith: {
                    coll: "billingevents",
                    pipeline: [
                      {
                        $match: {
                          organizationId: { $exists: false },
                          "payload.simulated": { $ne: true },
                          createdAt: { $gte: range.from, $lt: range.to },
                          $or: [
                            { status: "FAILED" },
                            {
                              type: {
                                $in: [
                                  "PAYMENT_FAILED",
                                  "INVOICE_FAILED",
                                  "PAYMENT_REVERSED",
                                ],
                              },
                            },
                          ],
                        },
                      },
                      {
                        $set: {
                          organization: {
                            name: "Platform-global billing event",
                          },
                          plan: "UNASSIGNED",
                        },
                      },
                    ],
                  },
                },
              ]
            : []),
        ],
        {
          organizationId: 1,
          organizationName: "$organization.name",
          plan: 1,
          status: 1,
          kind: "$type",
          at: "$createdAt",
          externalReference: 1,
        },
        query.page,
        query.pageSize,
        { createdAt: -1, _id: -1 },
      );
    else if (query.kind === "CAMERAS")
      result = await paged(
        sources.SecurityCamera,
        [...cameraPipeline(query, now), ...(idMatch ? [idMatch] : [])],
        {
          organizationId: 1,
          organizationName: "$organization.name",
          plan: 1,
          name: 1,
          propertyId: 1,
          cameraCode: 1,
          status: 1,
          availability: 1,
          observedAt: 1,
          simulated: "$metadata.simulated",
        },
        query.page,
        query.pageSize,
        { availability: 1, _id: 1 },
      );
    else if (query.kind === "INCIDENTS")
      result = await paged(
        sources.Incident,
        [
          ...resourcePipeline(query),
          ...(idMatch ? [idMatch] : []),
          {
            $match: { status: { $in: ["OPEN", "INVESTIGATING", "CONTAINED"] } },
          },
        ],
        {
          organizationId: 1,
          organizationName: "$organization.name",
          plan: 1,
          propertyId: 1,
          title: 1,
          severity: 1,
          status: 1,
          reportedAt: 1,
        },
        query.page,
        query.pageSize,
        { reportedAt: -1, _id: -1 },
      );
    else if (query.kind === "MOVEMENTS")
      result = await paged(
        sources.OrganizationSubscription,
        [
          ...resourcePipeline(query),
          ...(idMatch ? [idMatch] : []),
          { $unwind: "$businessTransitions" },
          {
            $match: {
              "businessTransitions.at": { $gte: range.from, $lt: range.to },
            },
          },
        ],
        {
          organizationId: 1,
          organizationName: "$organization.name",
          plan: 1,
          kind: "$businessTransitions.kind",
          at: "$businessTransitions.at",
          fromPlan: "$businessTransitions.fromPlan",
          toPlan: "$businessTransitions.toPlan",
          status: "$businessTransitions.toStatus",
        },
        query.page,
        query.pageSize,
        { "businessTransitions.at": -1, _id: 1 },
      );
    else {
      const conditions: Record<string, unknown> = {
        ACTIVE: { active: true },
        ONBOARDING: { onboardingPending: true },
        SIGNATURE: {
          "onboarding.state": {
            $in: ["CONTRACT_GENERATED", "CONTRACT_PENDING_SIGNATURE"],
          },
        },
        PAYMENT: {
          "onboarding.state": {
            $in: [
              "CONTRACT_SIGNED",
              "INVOICE_ISSUED",
              "PAYMENT_PENDING",
              "PAYMENT_VERIFIED",
            ],
          },
        },
        ATTENTION: { "onboarding.attentionCode": { $type: "string" } },
      };
      result = await paged(
        sources.Organization,
        [
          ...organizationPipeline(query, now),
          ...(query.organizationId
            ? [{ $match: { _id: objectId(query.organizationId) } }]
            : []),
          ...(conditions[query.kind]
            ? [{ $match: conditions[query.kind] as Record<string, unknown> }]
            : []),
        ],
        {
          organizationId: "$_id",
          name: 1,
          plan: 1,
          status: 1,
          state: "$onboarding.state",
          attentionCode: "$onboarding.attentionCode",
          contractId: "$onboarding.contractId",
          invoiceId: "$onboarding.invoiceId",
          activatedAt: "$onboarding.activatedAt",
          subscriptionStatus: "$subscription.status",
          currentPeriodEnd: "$subscription.currentPeriodEnd",
        },
        query.page,
        query.pageSize,
        { createdAt: -1, _id: -1 },
      );
    }
    await auditRead(
      auth,
      "platform.business.drilldown",
      {
        kind: query.kind,
        plan: query.plan,
        dataset: query.dataset,
        page: query.page,
      },
      query.organizationId,
    );
    return result;
  }
  static async generateBrief(
    auth: AuthenticatedUser,
    raw: unknown,
    now = new Date(),
  ) {
    AuthorizationService.assertPlatformAdmin(auth);
    const input = briefRequest.parse(raw),
      { idempotencyKey, ...query } = input;
    requireBusinessDataset(query);
    const environment = monitoringEnvironment(),
      requestHash = sha(query),
      filter = { environment, dataset: query.dataset, idempotencyKey };
    const existing = await PlatformBrief.findOne(filter).lean();
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new AppError(
          409,
          "BRIEF_IDEMPOTENCY_CONFLICT",
          "This request key belongs to different filters",
        );
      await auditRead(auth, "platform.brief.resumed", {
        briefId: String(existing._id),
      });
      return existing;
    }
    const indexes = await PlatformBrief.collection.indexes().catch(() => []);
    if (
      !indexes.some(
        (i) =>
          i.unique &&
          i.key.environment === 1 &&
          i.key.dataset === 1 &&
          i.key.idempotencyKey === 1,
      )
    )
      throw new AppError(
        503,
        "BUSINESS_INDEX_REQUIRED",
        "Create the declared brief indexes before generating snapshots",
      );
    const range = resolveBusinessRange(query, now),
      overview = await this.collect(query, range, now);
    const missing = (name: string) =>
      overview.unavailableSources.includes(name);
    const snapshot = {
      ...overview,
      sections: [
        {
          key: "business",
          title: "Business",
          summary: missing("organizations/subscriptions/portfolio")
            ? "Business source unavailable at generation."
            : overview.plans
                .map((p) => {
                  const previous = overview.growth.previous.find(
                    (r) => r.plan === p.plan,
                  );
                  return `${p.plan}: ${p.cohortSignups} new organizations (${previous?.signups ?? 0} in prior equal-duration period), ${p.activations} recorded activations; signup-cohort conversion ${p.onboardingConversion === null ? "unavailable" : (p.onboardingConversion * 100).toFixed(1) + "%"}.`;
                })
                .join(" "),
        },
        {
          key: "billing",
          title: "Billing",
          summary: missing("invoices/verified-payment-events")
            ? "Billing source unavailable at generation."
            : `${overview.revenue.reduce((s, r) => s + r.verifiedPayments, 0)} verified payments; ${overview.revenue.reduce((s, r) => s + r.overdueCount, 0)} overdue invoices currently. ${overview.plans.reduce((s, p) => s + p.requiresAttention, 0)} onboarding payment/activation attention flags; see audited organization details for reconciliation reasons.`,
        },
        {
          key: "onboarding",
          title: "Onboarding",
          summary: missing("organizations/subscriptions/portfolio")
            ? "Onboarding source unavailable at generation."
            : `${overview.plans.reduce((s, p) => s + p.awaitingConfiguration, 0)} awaiting organization configuration; ${overview.plans.reduce((s, p) => s + p.awaitingSignature, 0)} awaiting signature; ${overview.plans.reduce((s, p) => s + p.awaitingPayment, 0)} awaiting payment; ${overview.plans.reduce((s, p) => s + p.stuckOnboarding, 0)} unchanged beyond 72 hours.`,
        },
        {
          key: "operations",
          title: "Platform operations",
          summary: missing("platform-operations")
            ? "Operational source unavailable at generation."
            : overview.operations
                .filter((m) => m.value)
                .map((m) => `${m.label}: ${m.value}`)
                .join("; ") ||
              "No exceptions counted in available sources. Review coverage before interpreting this as healthy.",
        },
        {
          key: "security",
          title: "Fort Knox / Security",
          summary: overview.fortKnox
            ? `${overview.fortKnox.offlineCameras} observed offline cameras; ${overview.fortKnox.unknownCameras} cameras without usable observations; ${overview.fortKnox.unresolvedIncidents} unresolved incidents. Gateway health unavailable.`
            : "Fort Knox data is outside this selection or unavailable.",
        },
      ],
    };
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        const repeated = await PlatformBrief.findOne(filter)
          .session(session)
          .lean();
        if (repeated) {
          if (repeated.requestHash !== requestHash)
            throw new AppError(
              409,
              "BRIEF_IDEMPOTENCY_CONFLICT",
              "This request key belongs to different filters",
            );
          return repeated;
        }
        const [brief] = await PlatformBrief.create(
          [
            {
              ...filter,
              requestHash,
              version: 1,
              generatedAt: now,
              periodFrom: range.from,
              periodTo: range.to,
              timeZone: query.timeZone,
              plan: query.plan,
              sha256: sha(snapshot),
              snapshot,
              createdBy: auth.userId,
            },
          ],
          { session },
        );
        if (!brief)
          throw new AppError(
            500,
            "BRIEF_WRITE_FAILED",
            "Brief persistence failed",
          );
        await AuditService.record(
          {
            actorUserId: auth.userId,
            actorRole: "SUPER_ADMIN",
            action: "platform.brief.generated",
            resourceType: "PlatformBrief",
            resourceId: brief._id,
            metadata: {
              sha256: brief.sha256,
              dataset: query.dataset,
              plan: query.plan,
            },
          },
          session,
        );
        return brief.toObject();
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const winner = await PlatformBrief.findOne(filter).lean();
        if (winner) {
          if (winner.requestHash !== requestHash)
            throw new AppError(
              409,
              "BRIEF_IDEMPOTENCY_CONFLICT",
              "This request key belongs to different filters",
            );
          return winner;
        }
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
  static async history(auth: AuthenticatedUser, raw: unknown) {
    AuthorizationService.assertPlatformAdmin(auth);
    const query = drillQuery.parse(raw);
    requireBusinessDataset(query);
    const filter = {
      environment: monitoringEnvironment(),
      dataset: query.dataset,
      ...(query.plan === "ALL" ? {} : { plan: query.plan }),
    };
    const [items, total] = await Promise.all([
      PlatformBrief.find(filter)
        .select("-snapshot")
        .sort({ generatedAt: -1, _id: -1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean(),
      PlatformBrief.countDocuments(filter),
    ]);
    await auditRead(auth, "platform.brief.history.viewed", {
      dataset: query.dataset,
      page: query.page,
    });
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  static async brief(auth: AuthenticatedUser, id: string, raw: unknown) {
    AuthorizationService.assertPlatformAdmin(auth);
    const query = businessQuery.parse(raw);
    requireBusinessDataset(query);
    const objectId = AuditService.assertObjectId(id, "briefId");
    const result = await PlatformBrief.findOne({
      _id: objectId,
      environment: monitoringEnvironment(),
      dataset: query.dataset,
    }).lean();
    if (!result)
      throw new AppError(
        404,
        "BRIEF_NOT_FOUND",
        "Brief not found in this environment/dataset",
      );
    if (sha(result.snapshot) !== result.sha256)
      throw new AppError(
        409,
        "BRIEF_INTEGRITY_FAILURE",
        "The historical brief failed integrity verification",
      );
    await auditRead(auth, "platform.brief.viewed", {
      briefId: id,
      dataset: query.dataset,
    });
    return result;
  }
}
