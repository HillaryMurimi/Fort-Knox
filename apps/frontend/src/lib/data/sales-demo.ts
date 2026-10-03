import { statusSemantic } from '@/lib/status';
import { api } from "@/lib/api";
import type {
  DemoAction,
  DemoProfile,
  DemoSessionView,
} from "./sales-demo.types";
export interface DemoCatalog {
  templates: Array<{
    id: string;
    name: string;
    units: number;
    properties: number;
  }>;
  stories: Array<{
    id: DemoProfile["primaryPain"];
    name: string;
    question: string;
  }>;
}
export interface PilotProgress {
  organizationId: string;
  organizationName: string;
  plan: string;
  durationDays: number;
  expiresAt: string;
  expired: boolean;
  commercialState: string;
  readiness: {
    percent: number;
    complete: boolean;
    checks: Array<{ key: string; label: string; done: boolean; href: string }>;
    next: { label: string; href: string } | null;
  };
  insight: {
    kind: "RENT" | "VACANCY";
    resourceId: string;
    title: string;
    amountMinor: number;
    href: string;
  } | null;
  properties: Array<{ id: string; name: string }>;
  value: Record<string, number>;
  nextActions: Array<{
    key: string;
    label: string;
    done: boolean;
    href: string;
  }>;
}
export interface ImportPreview {
  valid: boolean;
  rows: Record<string, unknown>[];
  errors: Array<{ row: number; message: string }>;
  digest: string;
  summary: {
    properties: number;
    buildings: number;
    units: number;
    tenancies: number;
    openingBalanceMinor: number;
  };
}
export interface SalesIntelligence {
  items: Array<{
    id: string;
    name: string;
    profile: DemoProfile;
    stage: string;
    pilotOrganizationId?: string;
    expiresAt?: string;
    activationMilestone?: string;
    commercialState: string;
    readinessPercent?: number;
    nextAction?: string;
    blocker?: string;
  }>;
  total: number;
  page: number;
  totals: Array<{ _id: string; count: number }>;
  cohorts: Array<{
    _id: { pain: string; plan: string; scenario: string };
    prospects: number;
    demos: number;
    offered: number;
    pilots: number;
    activated: number;
    paid: number;
    retained: number;
  }>;
  valueMoments: Array<{
    _id: string;
    prospectsReached: number;
    pilots: number;
    paid: number;
  }>;
  limitations: string[];
}
export const salesDemoClient = {
  catalog: () => api<DemoCatalog>("/sales/demos/catalog"),
  list: (page = 1) =>
    api<{
      items: Array<{ id: string; profile: DemoProfile }>;
      page: number;
      total: number;
    }>(`/sales/demos?page=${page}`),
  prepare: (profile: DemoProfile, leadId?: string) =>
    api<DemoSessionView>("/sales/demos", {
      method: "POST",
      body: JSON.stringify({ profile, ...(leadId ? { leadId } : {}) }),
    }),
  get: (id: string) => api<DemoSessionView>(`/sales/demos/${id}`),
  command: (demo: DemoSessionView, action: DemoAction | { kind: "RESET" }) =>
    api<DemoSessionView>(`/sales/demos/${demo.id}/commands`, {
      method: "POST",
      body: JSON.stringify({
        ...action,
        expectedRevision: demo.revision,
        commandId: crypto.randomUUID(),
      }),
    }),
  pilot: (id: string, ownerEmail: string, name: string) =>
    api<{ organizationId: string; demo: DemoSessionView }>(
      `/sales/demos/${id}/pilot`,
      { method: "POST", body: JSON.stringify({ ownerEmail, name }) },
    ),
  reviewInsight: (
    org: string,
    insight: NonNullable<PilotProgress["insight"]>,
  ) =>
    api(`/sales/organizations/${org}/pilot/insight`, {
      method: "POST",
      body: JSON.stringify({
        kind: insight.kind,
        resourceId: insight.resourceId,
      }),
    }),
  inviteStaff: (org: string, email: string, role: string, propertyId: string) =>
    api<{ token: string }>(`/organizations/${org}/invitations`, {
      method: "POST",
      body: JSON.stringify({ email, role, propertyIds: [propertyId] }),
    }),
  progress: (org: string) =>
    api<PilotProgress>(`/sales/organizations/${org}/pilot`),
  preview: (org: string, rows: Record<string, unknown>[]) =>
    api<ImportPreview>(`/sales/organizations/${org}/pilot/import/preview`, {
      method: "POST",
      body: JSON.stringify({ rows }),
    }),
  confirm: (org: string, preview: ImportPreview) =>
    api<{ units: number }>(`/sales/organizations/${org}/pilot/import/confirm`, {
      method: "POST",
      body: JSON.stringify({
        rows: preview.rows,
        digest: preview.digest,
        confirm: true,
      }),
    }),
  intelligence: (page = 1) =>
    api<SalesIntelligence>(`/platform-control/sales-intelligence?page=${page}`),
};
export const kes = (minor: number) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    currencyDisplay: "code",
    maximumFractionDigits: 0,
  }).format(minor / 100);
export function semanticDemoStatus(status: string) {
  const text: Record<string, string> = {
    NEW: "PENDING",
    TRIAGED: "PENDING · TRIAGED",
    APPROVAL_REQUIRED: "AWAITING APPROVAL",
    APPROVED: "APPROVED · READY TO START",
    VERIFIED: "COMPLETED · VERIFIED",
    CLOSED: "COMPLETED · CLOSED",
  };
  return {
    label: text[status] ?? status.replaceAll("_", " "),
    semantic: statusSemantic(status, 'sales'),
    tone: ['success','completed'].includes(statusSemantic(status,'sales')) ? 'success' : ['failed','blocked'].includes(statusSemantic(status,'sales')) ? 'danger' : statusSemantic(status,'sales') === 'processing' ? 'active' : 'attention',
  };
}
