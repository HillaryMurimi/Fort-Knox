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
