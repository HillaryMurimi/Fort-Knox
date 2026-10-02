import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  PlatformBusiness,
  PlanPerformanceView,
  MorningBriefView,
  PriorityActions,
  BusinessFiltersBar,
} from "@/components/platform-business";
import type {
  BusinessOverview,
  PlanMetrics,
  PlatformBrief,
} from "./platform-business";
const state = vi.hoisted(() => ({
  admin: true,
  pending: false,
  error: false,
  enabled: vi.fn(),
  data: undefined as unknown,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { isPlatformAdmin: state.admin } }),
}));
vi.mock("@/hooks/queries/use-platform-business", () => ({
  usePlatformBusiness: (_filters: unknown, enabled: boolean) => {
    state.enabled(enabled);
    return {
      data: state.data,
      isPending: state.pending,
      isError: state.error,
      error: new Error("Network unavailable"),
      refetch: vi.fn(),
    };
  },
  useBusinessDrill: () => ({ isPending: false, isError: false }),
  useBriefHistory: () => ({
    isPending: false,
    isError: false,
    data: { items: [], total: 0, pageSize: 10 },
  }),
  useHistoricalBrief: () => ({ isPending: false, isError: false }),
  useGenerateBrief: () => ({
    isPending: false,
    isError: false,
    reset: vi.fn(),
  }),
}));
const plan = (key: string, orgs = 0): PlanMetrics => ({
  plan: key,
  organizations: orgs,
  activeOrganizations: orgs,
  onboardingOrganizations: 0,
  suspendedOrganizations: 0,
  cancelledOrganizations: 0,
  trialOrganizations: 0,
  properties: orgs,
  buildings: orgs,
  units: orgs * 50,
  activeUnits: orgs * 50,
  averageUnits: orgs ? 50 : 0,
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
  subscriptionsWithPrice: orgs,
  subscriptionsMissingPrice: 0,
});
function overview(): BusinessOverview {
  return {
    version: 1,
    generatedAt: "2026-10-02T09:00:00Z",
    asOf: "2026-10-02T09:00:00Z",
    dataset: "LIVE",
    environment: "test",
    range: {
      from: "2026-10-01T21:00:00Z",
      to: "2026-10-02T09:00:00Z",
      previousFrom: "2026-10-01T09:00:00Z",
      previousTo: "2026-10-01T21:00:00Z",
      timeZone: "Africa/Nairobi",
      period: "TODAY",
    },
    planFilter: "ALL",
    plans: [plan("CONTROL"), plan("FORT_KNOX")],
    revenue: [],
    growth: {
      daily: [],
      previous: [],
      movements: [],
      trackingStartedAt: null,
      churnRate: null,
    },
    fortKnox: null,
    operations: [
      {
        key: "gateway",
        label: "CCTV gateway health",
        value: null,
        source: "No probe source",
        window: "CURRENT",
      },
    ],
    actions: [],
    actionsTruncated: false,
    warnings: ["No live gateway observations"],
    unavailableSources: [],
  };
}
afterEach(() => {
  state.admin = true;
  state.pending = false;
  state.error = false;
  state.data = undefined;
  state.enabled.mockClear();
});
const page = () =>
  renderToStaticMarkup(
    createElement(PlatformBusiness, { onOrganization: vi.fn() }),
  );
describe("SUPER_ADMIN plan performance rendering", () => {
  it("denies non-admin rendering and disables platform queries", () => {
    state.admin = false;
    expect(page()).toContain("SUPER_ADMIN platform authorization is required");
    expect(state.enabled).toHaveBeenCalledWith(false);
  });
  it("renders loading and actionable retry states", () => {
    state.pending = true;
    expect(page()).toContain("Loading platform analytics");
    state.pending = false;
    state.error = true;
    expect(page()).toContain("Retry analytics");
    expect(page()).toContain("Network unavailable");
  });
  it.each([
    {},
    { revenue: [] },
    { ...overview(), revenue: undefined },
    { ...overview(), growth: {} },
  ])("keeps an incompatible cached response recoverable: %j", (value) => {
    state.data = value;
    const html = page();
    expect(html).toContain(
      "Platform analytics response is incomplete or incompatible",
    );
    expect(html).toContain("Refresh");
    expect(html).not.toContain("Known contracted MRR");
    expect(html).not.toContain("No organizations in this dataset");
  });
  it("does not crash or show financial totals for an incomplete retained brief", () => {
    const html = renderToStaticMarkup(
      createElement(MorningBriefView, {
        brief: { snapshot: {} } as PlatformBrief,
      }),
    );
    expect(html).toContain(
      "Platform analytics response is incomplete or incompatible",
    );
    expect(html).not.toContain("Business and revenue at generation");
  });
  it("shows explicit empty platform and unknown gateway states", () => {
    state.data = overview();
    const html = page();
    expect(html).toContain("No organizations in this dataset");
    expect(html).toContain("No price snapshots");
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("Platform healthy");
  });
  it("compares Control and Fort Knox without inventing MRR history or churn", () => {
    const data = overview();
    data.plans = [plan("CONTROL", 2), plan("FORT_KNOX", 3)];
    const html = renderToStaticMarkup(
      createElement(PlanPerformanceView, { data, onDrill: vi.fn() }),
    );
    for (const text of [
      "Control",
      "Fort Knox",
      "Cohort conversion",
      "Churn rate: unavailable",
      "No historical MRR series has been invented",
    ])
      expect(html).toContain(text);
  });
  it("marks partial source coverage without claiming an empty or healthy result", () => {
    const data = overview();
    data.unavailableSources = ["organizations/subscriptions/portfolio"];
    state.data = data;
    const html = page();
    expect(html).toContain("Partial data");
    expect(html).toContain(
      "Unavailable sources are not treated as healthy or empty",
    );
    expect(html).not.toContain("No organizations in this dataset");
  });
  it("renders failed financial sources as unavailable instead of zero collections", () => {
    const data = overview();
    data.unavailableSources = ["invoices/verified-payment-events"];
    const html = renderToStaticMarkup(
      createElement(PlanPerformanceView, { data, onDrill: vi.fn() }),
    );
    expect(html).toMatch(
      /Verified collections in period<\/span><span[^>]*>Unavailable/,
    );
  });
  it("labels simulated datasets and historical briefs explicitly", () => {
    const data = overview();
    data.dataset = "DEMO";
    expect(
      renderToStaticMarkup(
        createElement(PlanPerformanceView, { data, onDrill: vi.fn() }),
      ),
    ).toContain("SIMULATED DEMO DATA");
    const brief: PlatformBrief = {
      _id: "brief-1",
      generatedAt: data.generatedAt,
      periodFrom: data.range.from,
      periodTo: data.range.to,
      timeZone: data.range.timeZone,
      plan: "ALL",
      dataset: "DEMO",
      sha256: "retained-document-hash",
      version: 1,
      snapshot: {
        ...data,
        sections: [
          {
            key: "business",
            title: "Business",
            summary: "Historical terms and totals retained",
          },
        ],
      },
    };
    const html = renderToStaticMarkup(
      createElement(MorningBriefView, { brief }),
    );
    expect(html).toContain("retained-document-hash");
    expect(html).toContain("Historical terms and totals retained");
    expect(html).toContain("SIMULATED DEMO BRIEF");
  });
  it("renders priority severity and direct entity/action links", () => {
    const html = renderToStaticMarkup(
      createElement(PriorityActions, {
        actions: [
          {
            id: "critical",
            severity: "CRITICAL",
            category: "Fort Knox",
            title: "Critical unresolved incident",
            count: 1,
            href: "/platform?tab=plan%20performance&amp;kind=INCIDENTS",
            organizationId: "org-one",
          },
        ],
      }),
    );
    expect(html).toContain("critical");
    expect(html).toContain("Critical unresolved incident");
    expect(html).toContain("kind=INCIDENTS");
    expect(html).toContain("org-one");
  });
  it("renders reusable custom date, plan and timezone filters", () => {
    const html = renderToStaticMarkup(
      createElement(BusinessFiltersBar, {
        filters: {
          period: "CUSTOM",
          plan: "FORT_KNOX",
          dataset: "LIVE",
          timeZone: "Africa/Nairobi",
          from: "2026-09-01",
          to: "2026-09-30",
        },
        onChange: vi.fn(),
      }),
    );
    for (const text of [
      "Reporting timezone",
      "Africa/Nairobi",
      "From (inclusive)",
      "To (inclusive)",
      "Fort Knox",
    ])
      expect(html).toContain(text);
  });
  it("shows an empty Morning Brief history with an explicit generation command", () => {
    const html = renderToStaticMarkup(
      createElement(PlatformBusiness, {
        mode: "brief",
        onOrganization: vi.fn(),
      }),
    );
    expect(html).toContain("Generate Morning Brief");
    expect(html).toContain("No generated briefs");
    expect(html).toContain("No delivery is sent");
  });
});
