import { agentKeys } from "./sales-agent.schemas.js";
export const salesFeatureCatalog = [
  [
    "SALES_DASHBOARD",
    "AI sales dashboard",
    "Internal sales workspace; existing manual records remain readable.",
  ],
  [
    "SALES_AI_RUNTIME",
    "AI agent control center",
    "Durable permission-scoped model execution and human review.",
  ],
  ...agentKeys.map(
    (key) =>
      [
        `SALES_AGENT_${key}`,
        key.replaceAll("_", " "),
        `Optional ${key} sales agent execution.`,
      ] as const,
  ),
  [
    "SALES_OUTBOUND",
    "Sales outreach emergency control",
    "OFF prevents new sales sends; already-dispatched provider requests cannot be recalled.",
  ],
  ['SALES_RESEARCH', 'Permitted prospect research', 'Configured licensed search connector; source evidence never establishes identity or outbound consent.'],
  [
    "SALES_CAMPAIGNS",
    "Sales campaign management",
    "Campaign preparation, approval and limits.",
  ],
  [
    "SALES_TRACKING",
    "Sales attribution links",
    "Consent-aware opaque referral links.",
  ],
  [
    "SALES_ATTRIBUTION",
    "Customer attribution",
    "Stable-identifier attribution for verified lifecycle milestones.",
  ],
  [
    "SALES_LIFECYCLE",
    "Customer lifecycle projection",
    "Idempotent projections of existing domain events.",
  ],
  ['SALES_AUTOLINK', 'Verified customer identity linking', 'Optional exact verified-owner-email resolution; ambiguous/conflicting identities always require review.'],
  [
    "SALES_ANALYTICS",
    "Sales analytics",
    "Persisted conversions and authoritative subscription run rate.",
  ],
  [
    "SALES_ASSISTANCE",
    "Onboarding assistance",
    "Authorized assistance cases and recommendations.",
  ],
  [
    "SALES_APPROVALS",
    "Sales approval center",
    "Payload-bound human review of generated proposals.",
  ],
  [
    "SALES_CALENDAR",
    "Sales calendar integration",
    "Authorized external availability and reservations.",
  ],
  [
    "SALES_EMAIL",
    "Sales email outreach",
    "Approved business email with delivery evidence.",
  ],
  [
    "SALES_SMS",
    "Sales SMS outreach",
    "Optional approved SMS, with length and recipient limits.",
  ],
  [
    "SALES_WHATSAPP",
    "Sales WhatsApp Business",
    "Optional approved WhatsApp Business templates and consent.",
  ],
] as const;
export function isPlannedSalesFeature(key: string) {
  return salesFeatureCatalog.some(([candidate]) => candidate === key) &&
    !['SALES_DASHBOARD', 'SALES_AI_RUNTIME', 'SALES_APPROVALS', 'SALES_LIFECYCLE', 'SALES_AUTOLINK', 'SALES_CAMPAIGNS', 'SALES_TRACKING', 'SALES_ATTRIBUTION', 'SALES_RESEARCH', 'SALES_OUTBOUND', 'SALES_EMAIL', ...agentKeys.map(k => `SALES_AGENT_${k}`)].includes(key);
}
