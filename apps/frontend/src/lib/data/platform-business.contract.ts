import { z } from "zod";
import { ApiError } from "@/lib/api";
import type { BusinessOverview, PlatformBrief } from "./platform-business";

const timestamp = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)));
const timezone = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
});
const number = z.number().finite();
const plan = z.object({
  plan: z.string(),
  organizations: number,
  activeOrganizations: number,
  onboardingOrganizations: number,
  suspendedOrganizations: number,
  cancelledOrganizations: number,
  trialOrganizations: number,
  properties: number,
  buildings: number,
  units: number,
  activeUnits: number,
  averageUnits: number,
  cohortSignups: number,
  cohortActivated: number,
  onboardingConversion: number.nullable(),
  activations: number,
  newSubscriptions: number,
  stuckOnboarding: number,
  awaitingConfiguration: number,
  awaitingSignature: number,
  awaitingPayment: number,
  requiresAttention: number,
  subscriptionsWithPrice: number,
  subscriptionsMissingPrice: number,
});
const revenue = z.object({
  plan: z.string(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  mrrMinor: number,
  arrMinor: number,
  activeSubscriptionValueMinor: number,
  pricedOrganizations: number,
  pricedUnits: number,
  invoicedMinor: number,
  collectedMinor: number,
  cohortCollectedMinor: number,
  outstandingMinor: number,
  overdueMinor: number,
  unverifiedPaidMinor: number,
  invoicedCount: number,
  verifiedPayments: number,
  outstandingCount: number,
  overdueCount: number,
  collectionRate: number.nullable(),
  averageRevenuePerOrganizationMinor: number.nullable(),
  averageRevenuePerUnitMinor: number.nullable(),
  revenueContribution: number.nullable(),
});
const action = z
  .object({
    id: z.string(),
    severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "INFORMATIONAL"]),
    category: z.string(),
    plan: z.string().optional(),
    title: z.string(),
    count: number,
    href: z.string(),
    organizationId: z.string().optional(),
    entityId: z.string().optional(),
  })
  .transform(({ plan, organizationId, entityId, ...required }) => ({
    ...required,
    ...(plan === undefined ? {} : { plan }),
    ...(organizationId === undefined ? {} : { organizationId }),
    ...(entityId === undefined ? {} : { entityId }),
  }));
const overview = z.object({
  version: z.literal(1),
  generatedAt: timestamp,
  asOf: timestamp,
  dataset: z.enum(["LIVE", "DEMO"]),
  environment: z.string(),
  range: z.object({
    from: timestamp,
    to: timestamp,
    previousFrom: timestamp,
    previousTo: timestamp,
    timeZone: timezone,
    period: z.string(),
  }),
  planFilter: z.string(),
  plans: z.array(plan),
  revenue: z.array(revenue),
  growth: z.object({
    daily: z.array(
      z.object({
        day: z.string(),
        plan: z.string(),
        signups: number,
        activations: number,
      }),
    ),
    previous: z.array(
      z.object({ plan: z.string(), signups: number, activations: number }),
    ),
    movements: z.array(
      z.object({ plan: z.string(), kind: z.string(), count: number }),
    ),
    trackingStartedAt: timestamp.nullable(),
    churnRate: z.null(),
  }),
  fortKnox: z
    .object({
      organizations: number,
      properties: number,
      cctvProperties: number,
      registeredCameras: number,
      onlineCameras: number,
      offlineCameras: number,
      degradedCameras: number,
      unknownCameras: number,
      simulatedCameras: number,
      recentIncidents: number,
      unresolvedIncidents: number,
      criticalIncidents: number,
      evidenceEvents: number,
      connectivityFailures: number,
      gatewayHealth: z.null(),
    })
    .nullable(),
  operations: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      value: number.nullable(),
      source: z.string(),
      window: z.enum(["PERIOD", "CURRENT"]),
    }),
  ),
  actions: z.array(action),
  actionsTruncated: z.boolean(),
  warnings: z.array(z.string()),
  unavailableSources: z.array(z.string()),
});

// Missing fields represent an incompatible response, never an empty platform.
export const businessOverviewSchema: z.ZodType<BusinessOverview> = overview;
export const platformBriefSchema: z.ZodType<PlatformBrief> = z.object({
  _id: z.string(),
  generatedAt: timestamp,
  periodFrom: timestamp,
  periodTo: timestamp,
  timeZone: timezone,
  plan: z.string(),
  dataset: z.enum(["LIVE", "DEMO"]),
  sha256: z.string(),
  version: number,
  snapshot: overview.extend({
    sections: z.array(
      z.object({ key: z.string(), title: z.string(), summary: z.string() }),
    ),
  }),
});
export const platformAnalyticsResponseError =
  "Platform analytics response is incomplete or incompatible. Refresh analytics; if this continues, update and restart the backend and frontend.";
export function parsePlatformAnalytics<T>(
  schema: z.ZodType<T>,
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(platformAnalyticsResponseError, 502, {
      code: "INVALID_PLATFORM_ANALYTICS_RESPONSE",
    });
  return result.data;
}
