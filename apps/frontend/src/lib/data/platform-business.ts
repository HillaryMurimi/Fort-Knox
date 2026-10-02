import { api } from "@/lib/api";
import {
  businessOverviewSchema,
  platformBriefSchema,
  parsePlatformAnalytics,
} from "./platform-business.contract";
export interface PlanMetrics {
  plan: string;
  organizations: number;
  activeOrganizations: number;
  onboardingOrganizations: number;
  suspendedOrganizations: number;
  cancelledOrganizations: number;
  trialOrganizations: number;
  properties: number;
  buildings: number;
  units: number;
  activeUnits: number;
  averageUnits: number;
  cohortSignups: number;
  cohortActivated: number;
  onboardingConversion: number | null;
  activations: number;
  newSubscriptions: number;
  stuckOnboarding: number;
  awaitingConfiguration: number;
  awaitingSignature: number;
  awaitingPayment: number;
  requiresAttention: number;
  subscriptionsWithPrice: number;
  subscriptionsMissingPrice: number;
}
export interface RevenueMetrics {
  plan: string;
  currency: string;
  mrrMinor: number;
  arrMinor: number;
  activeSubscriptionValueMinor: number;
  pricedOrganizations: number;
  pricedUnits: number;
  invoicedMinor: number;
  collectedMinor: number;
  cohortCollectedMinor: number;
  outstandingMinor: number;
  overdueMinor: number;
  unverifiedPaidMinor: number;
  invoicedCount: number;
  verifiedPayments: number;
  outstandingCount: number;
  overdueCount: number;
  collectionRate: number | null;
  averageRevenuePerOrganizationMinor: number | null;
  averageRevenuePerUnitMinor: number | null;
  revenueContribution: number | null;
}
export interface BusinessAction {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "INFORMATIONAL";
  category: string;
  plan?: string;
  title: string;
  count: number;
  href: string;
  organizationId?: string;
  entityId?: string;
}
export interface OperationalMetric {
  key: string;
  label: string;
  value: number | null;
  source: string;
  window: "PERIOD" | "CURRENT";
}
export interface SecurityMetrics {
  organizations: number;
  properties: number;
  cctvProperties: number;
  registeredCameras: number;
  onlineCameras: number;
  offlineCameras: number;
  degradedCameras: number;
  unknownCameras: number;
  simulatedCameras: number;
  recentIncidents: number;
  unresolvedIncidents: number;
  criticalIncidents: number;
  evidenceEvents: number;
  connectivityFailures: number;
  gatewayHealth: null;
}
export interface BusinessOverview {
  version: 1;
  generatedAt: string;
  asOf: string;
  dataset: "LIVE" | "DEMO";
  environment: string;
  range: {
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
    timeZone: string;
    period: string;
  };
  planFilter: string;
  plans: PlanMetrics[];
  revenue: RevenueMetrics[];
  growth: {
    daily: Array<{
      day: string;
      plan: string;
      signups: number;
      activations: number;
    }>;
    previous: Array<{ plan: string; signups: number; activations: number }>;
    movements: Array<{ plan: string; kind: string; count: number }>;
    trackingStartedAt: string | null;
    churnRate: null;
  };
  fortKnox: SecurityMetrics | null;
  operations: OperationalMetric[];
  actions: BusinessAction[];
  actionsTruncated: boolean;
  warnings: string[];
  unavailableSources: string[];
}

export const businessPeriods = [
  "TODAY",
  "PREVIOUS_DAY",
  "LAST_7_DAYS",
  "LAST_30_DAYS",
  "CURRENT_MONTH",
  "PREVIOUS_MONTH",
  "CUSTOM",
] as const;
export type BusinessPeriod = (typeof businessPeriods)[number];
export interface BusinessFilters {
  period: BusinessPeriod;
  timeZone: string;
  plan: "ALL" | "CONTROL" | "FORT_KNOX" | "OTHER" | "UNASSIGNED";
  dataset: "LIVE" | "DEMO";
  from?: string;
  to?: string;
}
export type DrillKind =
  | "ORGANIZATIONS"
  | "ACTIVE"
  | "ONBOARDING"
  | "SIGNATURE"
  | "PAYMENT"
  | "ATTENTION"
  | "OVERDUE"
  | "INVOICES"
  | "OUTSTANDING"
  | "VERIFIED_PAYMENTS"
  | "UNVERIFIED_PAYMENTS"
  | "BILLING_EVENTS"
  | "CAMERAS"
  | "INCIDENTS"
  | "MOVEMENTS";
export interface BusinessDrillItem {
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
  verified?: boolean;
  outstanding?: number;
  subscriptionStatus?: string;
}
export interface PaginatedBusiness<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface BriefMetadata {
  _id: string;
  generatedAt: string;
  periodFrom: string;
  periodTo: string;
  timeZone: string;
  plan: string;
  dataset: "LIVE" | "DEMO";
  sha256: string;
  version: number;
}
export interface PlatformBrief extends BriefMetadata {
  snapshot: BusinessOverview & {
    sections: Array<{ key: string; title: string; summary: string }>;
  };
}
export function businessSearch(
  filters: BusinessFilters,
  extra: Record<string, string | number | undefined> = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, ...extra }))
    if (value !== undefined && value !== "") params.set(key, String(value));
  return params.toString();
}
export const platformBusinessClient = {
  overview: async (filters: BusinessFilters) =>
    parsePlatformAnalytics(
      businessOverviewSchema,
      await api<unknown>(
        "/platform-control/business-intelligence?" + businessSearch(filters),
      ),
    ),
  drill: (
    filters: BusinessFilters,
    kind: DrillKind,
    page = 1,
    organizationId?: string,
  ) =>
    api<PaginatedBusiness<BusinessDrillItem>>(
      "/platform-control/business-intelligence/drill-down?" +
        businessSearch(filters, { kind, page, pageSize: 20, organizationId }),
    ),
  generate: async (filters: BusinessFilters, idempotencyKey: string) =>
    parsePlatformAnalytics(
      platformBriefSchema,
      await api<unknown>("/platform-control/morning-briefs", {
        method: "POST",
        body: JSON.stringify({ ...filters, idempotencyKey }),
      }),
    ),
  history: (filters: BusinessFilters, page = 1) =>
    api<PaginatedBusiness<BriefMetadata>>(
      "/platform-control/morning-briefs?" +
        businessSearch(filters, { page, pageSize: 10 }),
    ),
  brief: async (filters: BusinessFilters, id: string) =>
    parsePlatformAnalytics(
      platformBriefSchema,
      await api<unknown>(
        "/platform-control/morning-briefs/" +
          encodeURIComponent(id) +
          "?" +
          businessSearch(filters),
      ),
    ),
};
export const businessMoney = (minor: number, currency = "KES") =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(minor / 100);
export const businessPercent = (value: number | null) =>
  value === null
    ? "Unavailable"
    : new Intl.NumberFormat("en", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(value);
export const businessLabel = (value: string) =>
  value === "FORT_KNOX"
    ? "Fort Knox"
    : value === "CONTROL"
      ? "Control"
      : value.toLowerCase().replaceAll("_", " ");
