import { api } from "@/lib/api";
export type Currency = "KES" | "USD" | "NGN" | "GHS" | "ZAR";
export interface TargetPolicy {
  name: string;
  metric:
    | "COLLECTED_CASH"
    | "CURRENT_MRR"
    | "CURRENT_ARR"
    | "NEW_MRR"
    | "RECOGNIZED_REVENUE";
  currency: Currency;
  period: "MONTHLY" | "QUARTERLY" | "ANNUAL";
  periodStart: string;
  baselineMinor: string;
  scope: "DEPARTMENT" | "CAMPAIGN" | "AGENT" | "TEAM";
  scopeId?: string;
  pipelineCoverageBps: number;
  forecastMinor?: string;
  forecastRationale?: string;
}
export interface RevenueTarget {
  _id: string;
  revision: number;
  policy: TargetPolicy;
}
type Total = { amountMinor: string; count: number };
type Count = { _id: string | null; count: number };
export interface RevenueOverview {
  asOf: string;
  currency: Currency;
  range: { from: string; to: string; timeZone: string };
  cash: Total;
  currentMRR: Total;
  currentARR: Total;
  dailyCash: { day: string; amountMinor: string; count: number }[];
  campaigns: {
    campaignId: string | null;
    amountMinor: string;
    count: number;
  }[];
  limitations: string[];
  unavailable: string[];
  operations: {
    pipeline: Count[];
    qualification: Count[];
    meetings: Count[];
    approvals: Count[];
    assistance: Count[];
    messages: {
      channel: string;
      accepted: number;
      delivered: number;
      replied: number;
      estimatedCostMicroUsd: string;
    }[];
    agents: {
      agent: string;
      status: string;
      count: number;
      estimatedCostMicroUsd: string;
      unknownCostRuns: number;
    }[];
  };
}
export interface TargetDetail {
  target: RevenueTarget;
  actualMinor: string | null;
  varianceMinor: string | null;
  requiredPipelineMinor: string;
  unavailableReason: string | null;
  levels: {
    multiplier: number;
    quotaMinor: string;
    attainmentPercent: string | null;
  }[];
  forecast: {
    amountMinor: string;
    basis: "ADMIN_ESTIMATE";
    rationale: string;
    attainmentPercent: string;
  } | null;
  period: { from: string; to: string };
  asOf: string;
  limitations: string[];
  history: {
    _id: string;
    action: string;
    createdAt: string;
    metadata: {
      before?: TargetPolicy;
      after: TargetPolicy;
      reason: string;
      revision: number;
    };
  }[];
}
const base = "/sales/success/revenue";
export const revenueClient = {
  history: (selection: { from: string; to: string; currency: string }) =>
    api<RevenueHistory>(`${base}/history?${new URLSearchParams(selection)}`),
  movements: (currency: string, page: number) =>
    api<{ items: RevenueMovement[]; total: number; page: number }>(
      `${base}/movements?${new URLSearchParams({ currency, page: String(page) })}`,
    ),
  movementSource: (id: string) =>
    api<MovementSource>(`${base}/movements/${id}`),
  overview: (selection: { from: string; to: string; currency: string }) =>
    api<RevenueOverview>(base + "?" + new URLSearchParams(selection)),
  targets: (page: number) =>
    api<{ items: RevenueTarget[]; total: number; page: number }>(
      `${base}/targets?page=${page}`,
    ),
  target: (id: string) => api<TargetDetail>(`${base}/targets/${id}`),
  create: (body: { commandId: string; policy: TargetPolicy; reason: string }) =>
    api<{ id: string }>(`${base}/targets`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (
    id: string,
    body: { revision: number; policy: TargetPolicy; reason: string },
  ) =>
    api<{ id: string }>(`${base}/targets/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};
export interface RevenueMovement {
  _id: string;
  organizationId: string;
  subscriptionId: string;
  sequence: number;
  kind: string;
  currency: string;
  effectiveAt: string;
  recordedAt: string;
  previousMinor: string | null;
  newMinor: string;
  sourceKind: string;
  sourceReference: string;
  invoiceId?: string;
  contractId?: string;
  billingEventId?: string;
  completeFromStart: boolean;
  gaps: string[];
}
export interface MovementSource {
  event: RevenueMovement;
  invoice: {
    _id: string;
    invoiceNumber: string;
    status: string;
    paidAt?: string;
    contractId?: string;
    originContractId?: string;
  } | null;
  proof: {
    _id: string;
    provider: string;
    type: string;
    status: string;
    externalReference?: string;
  } | null;
  webhook: {
    _id: string;
    provider: string;
    eventId: string;
    status: string;
  } | null;
}
export interface RevenueHistory {
  asOf: string;
  currency: string;
  timeZone: string;
  sourceCount: number;
  definition: string;
  autonomousInterventionsEnabled: false;
  agentRestriction: string;
  bridges: {
    month: string;
    complete: boolean;
    reasons: string[];
    openingMinor: string | null;
    newMinor: string | null;
    reactivationMinor: string | null;
    expansionMinor: string | null;
    contractionMinor: string | null;
    churnedMinor: string | null;
    closingMinor: string | null;
    reconciled: boolean;
  }[];
  cohorts: {
    cohortMonth: string;
    month: string;
    complete: boolean;
    reasons: string[];
    customers: number;
    retainedCustomers: number | null;
    baselineMinor: string | null;
    retainedMinor: string | null;
    customerRetentionPercent: string | null;
    grossRevenueRetentionPercent: string | null;
    netRevenueRetentionPercent: string | null;
  }[];
  reconciliation: {
    counts: Record<string, number>;
    issues: { code: string; sourceId?: string; organizationId?: string }[];
    issueCount: number;
    issueLimit: number;
    sourceLimit: number;
    truncated: boolean;
    providerCompleteness: string;
    historyMutated: false;
  };
}
// Every supported reporting currency uses two decimal places. Never round monetary input through Number.
export function toMinor(input: string) {
  if (!/^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$/.test(input))
    throw new Error(
      "Enter a positive amount with up to two decimal places, without commas.",
    );
  const [whole, fraction = ""] = input.split(".");
  return String(BigInt(whole!) * BigInt(100) + BigInt(fraction.padEnd(2, "0")));
}
export function decimalAmount(minor: string) {
  const amount = BigInt(minor),
    positive = amount < BigInt(0) ? -amount : amount;
  return `${amount < BigInt(0) ? "-" : ""}${positive / BigInt(100)}.${String(positive % BigInt(100)).padStart(2, "0")}`;
}
export function revenueMoney(minor: string | null, currency: string) {
  if (minor === null) return "Unavailable";
  const [whole, fraction] = decimalAmount(minor).split(".");
  return `${currency} ${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}
