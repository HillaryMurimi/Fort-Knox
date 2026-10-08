/** Presentation only. Backend enums and transition rules remain authoritative. */
export const statusGroups = {
  neutral: [
    "INFO",
    "UNKNOWN",
    "DRAFT",
    "NOT_STARTED",
    "NOT_TESTED",
    "NOT_CONFIGURED",
    "UNCONFIGURED",
    "NOT_DEPLOYED",
    "NOT_SCHEDULED",
    "PROSPECT",
    "PRE_REGISTERED",
    "ACCOUNT_CREATED",
    "UNSUBSCRIBED",
  ],
  pending: [
    "PENDING",
    "QUEUED",
    "AWAITING",
    "REQUESTED",
    "SCHEDULED",
    "RESERVED",
    "DUE",
    "OPEN",
    "RECEIVED",
    "INVOICED",
    "ASSESSED",
    "PAYMENT_PENDING",
    "INVOICE_ISSUED",
    "AWAITING_DOCUMENTS",
    "PENDING_PROVIDER_SETUP",
    "OTP_SENT",
    "CHANNEL",
    "EMAIL",
    "SMS",
  ],
  processing: [
    "IN_PROGRESS",
    "PROCESSING",
    "RUNNING",
    "SUBMITTING",
    "STARTED",
    "INITIATED",
    "ASSIGNED",
    "TRIAGED",
    "RETRYING",
    "SCHEDULING",
    "CHECKING",
    "UNDER_REPAIR",
    "INVESTIGATING",
    "ACKNOWLEDGED",
    "CONTACTED",
    "SENT",
    "ORGANIZATION_CONFIGURED",
    "PLAN_SELECTED",
    "CONTRACT_GENERATED",
    "TRIALING",
    "CANARY",
    "ACTIVE_WORK",
  ],
  review: [
    "SUBMITTED",
    "UNDER_REVIEW",
    "REVIEW",
    "APPROVAL_REQUIRED",
    "AWAITING_APPROVAL",
    "PENDING_SIGNATURE",
    "CONTRACT_PENDING_SIGNATURE",
    "INSPECTION_PENDING",
    "RECONCILIATION_PENDING",
    "CANDIDATE",
    "CHALLENGED",
  ],
  attention: [
    "WARNING",
    "WATCH",
    "AT_RISK",
    "NEEDS_ACTION",
    "NEEDS_ATTENTION",
    "REQUIRES_ATTENTION",
    "DEGRADED",
    "SUBMISSION_UNKNOWN",
    "NOTICE",
    "VACANT",
    "PROMISED",
    "FAIR",
    "MODERATE",
    "MEDIUM",
    "HIGH",
    "URGENT",
    "INSUFFICIENT_DATA",
    "QUOTED",
  ],
  blocked: [
    "BLOCKED",
    "OVERDUE",
    "CRITICAL",
    "EMERGENCY",
    "PAST_DUE",
    "OFFLINE",
    "MISSING",
    "QUARANTINED",
    "BLACKLISTED",
    "ESCALATED",
    "DEAD_LETTER",
    "DAMAGED",
    "POOR",
    "ROLLBACK",
  ],
  failed: [
    "FAILED",
    "REJECTED",
    "ERROR",
    "DENIED",
    "INVALIDATED",
    "UNCOLLECTIBLE",
  ],
  success: [
    "APPROVED",
    "VERIFIED",
    "HEALTHY",
    "SUCCESSFUL",
    "CONFIRMED",
    "VALIDATED",
    "PROMOTED",
    "ACTIVE",
    "OCCUPIED",
    "ONLINE",
    "ON",
    "ENABLED",
    "CONFIGURED",
    "PASSED",
    "READY",
    "EXCELLENT",
    "GOOD",
    "LOW",
    "NONE",
    "NORMAL",
    "GRANTED",
    "ACCEPTED",
    "SIGNED",
    "CONTRACT_SIGNED",
    "PAYMENT_VERIFIED",
    "CONTAINED",
    "KEEP",
  ],
  completed: [
    "COMPLETED",
    "RESOLVED",
    "PAID",
    "CLOSED",
    "SUCCEEDED",
    "PROCESSED",
    "RECONCILED",
    "DELIVERED",
    "READ",
    "CONSUMED",
    "OBSERVED",
  ],
  paused: ["PAUSED", "SUSPENDED", "ON_HOLD", "MAINTENANCE"],
  inactive: [
    "CANCELLED",
    "DISABLED",
    "INACTIVE",
    "DEACTIVATED",
    "REMOVED",
    "REVOKED",
    "VOID",
    "DISMISSED",
    "FALSE_ALARM",
    "NOT_APPLICABLE",
    "IGNORED",
    "REVERSED",
    "EXPIRED",
    "DISABLE",
  ],
  archived: [
    "ARCHIVED",
    "RETIRED",
    "HISTORICAL",
    "MOVED_OUT",
    "TERMINATED",
    "DISPOSED",
    "WRITTEN_OFF",
    "CENSORED",
  ],
} as const;
export type StatusSemantic = keyof typeof statusGroups;
export const statusDomains = {
  general: {},
  entity: {},
  unit: { VACANT: "attention", MAINTENANCE: "paused" },
  tenancy: {
    NOTICE: "attention",
    MOVED_OUT: "archived",
    TERMINATED: "inactive",
  },
  onboarding: {
    PAYMENT_FAILED: "failed",
    CHECKOUT_PREPARATION_FAILED: "failed",
    PAYMENT_RECONCILIATION_REQUIRED: "review",
    RENEWAL_REQUIRES_ATTENTION: "attention",
  },
  maintenance: { NEW: "pending", CLOSED: "completed", QUOTED: "review" },
  inventory: { NEW: "success" },
  inspection: {},
  rent: { OPEN: "pending", PARTIALLY_PAID: "attention" },
  payment: { ACTIVE: "processing" },
  refund: {},
  reconciliation: { PENDING: "review" },
  expense: { SUBMITTED: "review" },
  approval: { PENDING: "review", EXPIRED: "inactive" },
  period: { OPEN: "success", CLOSED: "archived", LOCKED: "paused" },
  contractor: {},
  document: {},
  evidence: {},
  contract: {},
  incident: { OPEN: "attention", ACTIVE: "attention", CLOSED: "completed" },
  alert: { OPEN: "attention", ACTIVE: "attention" },
  integration: {
    MAINTENANCE: "paused",
    OFF: "inactive",
    MISSING: "neutral",
    PARTIAL: "attention",
  },
  notification: {},
  job: {},
  subscription: { ACTIVE: "success", EXPIRED: "attention" },
  billing: { OPEN: "pending" },
  monitoring: { OPEN: "attention" },
  automation: { OPEN: "attention" },
  predictive: { LOW: "success", HIGH: "attention" },
  serving: { ACTIVE: "processing", SHADOW: "neutral", CANARY: "processing" },
  auth: {},
  sales: {
    NEW: "pending",
    OPEN: "attention",
    PILOT: "processing",
    DEMO_PREPARED: "pending",
    DEMO_COMPLETED: "completed",
    PILOT_STARTED: "processing",
    ACTIVATED: "success",
    PAID_ACTIVE: "success",
    RETAINED: "success",
  },
} as const satisfies Record<string, Record<string, StatusSemantic>>;
export type StatusDomain = keyof typeof statusDomains;
const defaults = new Map<string, StatusSemantic>();
for (const [semantic, values] of Object.entries(statusGroups)) {
  for (const value of values) defaults.set(value, semantic as StatusSemantic);
}
// NEW is a report by default; inventory supplies the condition meaning.
defaults.set("NEW", "pending");
defaults.set("PARTIALLY_PAID", "attention");
defaults.set("SHADOW", "neutral");
defaults.set("OFF", "inactive");
defaults.set("REVIEW_REQUIRED", "review");
defaults.set("VALID", "success");
defaults.set("PASS", "success");
defaults.set("WARN", "attention");
defaults.set("FAIL", "failed");
export function normalizeStatus(value: unknown): string {
  return typeof value === "string"
    ? value
        .trim()
        .replace(/[\s-]+/g, "_")
        .toUpperCase()
    : "UNKNOWN";
}
export function statusSemantic(
  value: unknown,
  domain: StatusDomain = "general",
): StatusSemantic {
  const key = normalizeStatus(value);
  const overrides: Readonly<Record<string, StatusSemantic>> =
    statusDomains[domain];
  return overrides[key] ?? defaults.get(key) ?? "neutral";
}
export function statusLabel(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.replaceAll("_", " ")
    : "UNKNOWN";
}
export function statusClass(
  value: unknown,
  domain: StatusDomain = "general",
): string {
  return `status-surface status-${statusSemantic(value, domain)}`;
}
export type PipelinePosition =
  "completed" | "current" | "upcoming" | "blocked" | "failed" | "skipped";
export interface WorkflowStage {
  key: string;
  label: string;
  status?: string;
  position: PipelinePosition;
  detail?: string;
  href?: string;
}
export function orderedWorkflow(
  labels: readonly string[],
  current: number,
  currentStatus = "IN_PROGRESS",
): WorkflowStage[] {
  return labels.map((label, index) => ({
    key: String(index),
    label,
    ...(index === current ? { status: currentStatus } : {}),
    position:
      index < current
        ? "completed"
        : index === current
          ? "current"
          : "upcoming",
  }));
}
export function pipelineSemantic(
  stage: WorkflowStage,
  domain: StatusDomain,
): StatusSemantic {
  if (stage.position === "completed") return "completed";
  if (stage.position === "upcoming") return "neutral";
  if (stage.position === "skipped") return "inactive";
  if (stage.position === "blocked") return "blocked";
  if (stage.position === "failed") return "failed";
  return statusSemantic(stage.status ?? "IN_PROGRESS", domain);
}

export function lifecycleWorkflow(
  keys: readonly string[],
  currentStatus: string,
  skipped: readonly string[] = [],
): WorkflowStage[] {
  const current = keys.indexOf(currentStatus);
  if (current < 0) {
    // A terminal/unknown state cannot prove which optional steps happened.
    return [
      ...keys.map((key) => ({
        key,
        label: statusLabel(key),
        position: "skipped" as const,
        detail: "History not inferred",
      })),
      {
        key: currentStatus,
        label: statusLabel(currentStatus),
        status: currentStatus,
        position: "current",
      },
    ];
  }
  return keys.map((key, index) => ({
    key,
    label: statusLabel(key),
    ...(index === current ? { status: currentStatus } : {}),
    position:
      index === current
        ? "current"
        : skipped.includes(key)
          ? "skipped"
          : index < current
            ? "completed"
            : "upcoming",
  }));
}
export const maintenanceStages = [
  "NEW",
  "TRIAGED",
  "ASSIGNED",
  "QUOTED",
  "APPROVAL_REQUIRED",
  "APPROVED",
  "IN_PROGRESS",
  "COMPLETED",
  "VERIFIED",
  "CLOSED",
] as const;
export const incidentStages = [
  "OPEN",
  "INVESTIGATING",
  "CONTAINED",
  "RESOLVED",
  "CLOSED",
] as const;

/** Default false before quotation is not proof that approval will be skipped. */
export function maintenanceWorkflow(record: {
  status: string;
  approvalRequired: boolean;
  quoteAmount?: number;
}): WorkflowStage[] {
  const skipped =
    record.quoteAmount !== undefined && !record.approvalRequired
      ? ["APPROVAL_REQUIRED"]
      : [];
  return lifecycleWorkflow(maintenanceStages, record.status, skipped);
}
