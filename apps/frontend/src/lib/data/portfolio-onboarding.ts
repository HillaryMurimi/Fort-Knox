import { api } from "../api";
import type { PortfolioRow } from "./portfolio-import";
export type PortfolioStage =
  "PROFILE" | "PROPERTY" | "UNITS" | "PEOPLE" | "DASHBOARD";
export interface PortfolioDraft {
  stage: PortfolioStage;
  property?: {
    name: string;
    code: string;
    address: string;
    city: string;
    propertyType: string;
  };
  importRows?: PortfolioRow[];
}
export interface PortfolioProgress {
  organizationId: string;
  name: string;
  business: { legalName: string; billingEmail?: string; planKey?: string };
  revision: number;
  draft: PortfolioDraft | null;
  lastStage?: PortfolioStage;
  nextStage: PortfolioStage;
  percent: number;
  complete: boolean;
  properties: Array<{
    _id: string;
    name: string;
    code: string;
    createdAt?: string;
  }>;
  checks: Array<{
    key: string;
    label: string;
    done: boolean;
    required: boolean;
    href: string;
  }>;
  facts: {
    properties: number;
    units: number;
    occupied: number;
    vacant: number;
    otherUnits: number;
    tenants: number;
    pendingTenantActivations: number;
    staff: number;
    currentTenancies: number;
    knownMonthlyRentMinor: number | null;
    rentCoverageComplete: boolean;
    currency: string;
  };
  milestones: {
    paymentVerifiedAt?: string;
    firstPropertyAt?: string;
    firstImportAt?: string;
    firstDashboardAt?: string;
    timeToFirstValueMs: number | null;
  };
  brief: {
    factsSource: string;
    predictions: unknown[];
    predictionStatus: string;
    recommendations: Array<{ label: string; href: string }>;
  };
}
export interface ImportPreview {
  rows: PortfolioRow[];
  errors: Array<{ row: number; message: string }>;
  valid: boolean;
  digest: string;
  replayed?: boolean;
  summary: {
    properties: number;
    newProperties?: number;
    buildings?: number;
    units: number;
    tenancies: number;
    caretakers?: number;
    openingBalanceMinor?: number;
  };
}
export interface ImportReceipt {
  imported: true;
  units: number;
  tenancies?: number;
  caretakers?: number;
  properties?: number;
  replayed?: boolean;
  digest: string;
}
const base = (org: string) => "/organizations/" + org + "/portfolio-onboarding";
const body = (method: string, input: unknown) => ({
  method,
  body: JSON.stringify(input),
});
export const portfolioOnboardingClient = {
  progress: (org: string) => api<PortfolioProgress>(base(org)),
  saveDraft: (
    org: string,
    input: PortfolioDraft & { expectedRevision: number },
  ) => api<PortfolioProgress>(base(org) + "/draft", body("PUT", input)),
  preview: (org: string, rows: PortfolioRow[]) =>
    api<ImportPreview>(base(org) + "/import/preview", body("POST", { rows })),
  confirm: (org: string, preview: ImportPreview) =>
    api<ImportReceipt>(
      base(org) + "/import/confirm",
      body("POST", {
        rows: preview.rows,
        digest: preview.digest,
        confirm: true,
      }),
    ),
  dashboardVisited: (org: string) =>
    api<{ recorded: true }>(base(org) + "/dashboard-visit", body("POST", {})),
};
