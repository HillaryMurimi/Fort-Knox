import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, afterEach } from "vitest";
import Page from "@/app/onboarding/page";
const state = vi.hoisted(() => ({
  loading: false,
  error: "",
  org: "org-one",
  progress: {} as Record<string, unknown>,
  catalog: null as Record<string, unknown> | null,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/hooks/use-organization", () => ({
  useOrganization: () => ({ activeOrganizationId: state.org }),
}));
vi.mock("@/hooks/queries/use-landlord-onboarding", () => ({
  useLandlordProgress: () => ({
    isLoading: state.loading,
    error: state.error ? new Error(state.error) : null,
    data: state.progress,
    refetch: vi.fn(),
  }),
  useLandlordCommand: () => ({
    isPending: false,
    error: null,
    mutate: vi.fn(),
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => queryKey[0] === "onboarding-plan-catalog"
    ? { data: state.catalog, isPending: false, isFetching: false, error: null }
    : { data: pricing, isPending: false, isFetching: false, error: null },
}));
const pricing = {
  planKey: "CONTROL",
  planName: "Control",
  currency: "KES",
  unitCount: 55,
  monthlyMinor: 1100000,
  totalMinor: 3300000,
  prepaidMonths: 3,
  billingCycle: "MONTH",
  legalName: "Acacia Holdings",
  lineItems: [
    {
      description: "Control base",
      quantity: 3,
      totalMinor: 3000000,
      unitAmountMinor: 1000000,
    },
  ],
};
function progress(nextStep: string) {
  return {
    state: nextStep === "COMPLETE" ? "ACTIVE" : "PAYMENT_PENDING",
    revision: 2,
    nextStep,
    organization: {
      _id: "org-one",
      name: "Acacia",
      legalName: "Acacia Holdings",
      legalIdentifier: "REG-1",
      billingEmail: "owner@example.com",
      unitCount: 55,
    },
    contract: {
      _id: "contract",
      body: "Exact retained contract terms for Acacia Holdings",
      sha256: "reviewed-hash",
      templateId: "PMCC_SERVICES",
      templateVersion: 3,
      snapshot: pricing,
      documentId: "pdf-1",
      signedDocumentId: "pdf-2",
      signature: { name: "Jane Owner" },
    },
    invoice: {
      invoiceNumber: "INV-ONE",
      total: 33000,
      status: "OPEN",
      documentId: "pdf-3",
      receiptDocumentId: "pdf-4",
    },
    subscription: {
      status: "PENDING",
      currentPeriodEnd: "2027-01-02T00:00:00Z",
      providerCheckoutReference: "reference",
      providerCheckoutUrl: "https://checkout.paystack.com/test",
    },
  };
}
afterEach(() => {
  state.loading = false;
  state.error = "";
  state.org = "org-one";
  state.catalog = null;
});
describe("guided landlord onboarding screens", () => {
  it("compares published tiers and prices before contract generation", () => {
    const draft = progress("PLAN");
    state.progress = { ...draft, contract: null, invoice: null, subscription: null };
    state.catalog = { plans: [
      { key: "CONTROL", name: "Control", features: ["command-center", "finance"], pricing: { currency: "KES", monthlyMinor: 1100000, totalMinor: 3300000, includedUnits: 50, extraUnits: 5, additionalUnitMinor: 20000 } },
      { key: "FORT_KNOX", name: "Fort Knox", features: ["command-center", "finance", "security", "cctv"], pricing: { currency: "KES", monthlyMinor: 3150000, totalMinor: 9450000, includedUnits: 50, extraUnits: 5, additionalUnitMinor: 30000 } },
    ] };
    const html = renderToStaticMarkup(createElement(Page));
    expect(html).toContain("Control vs Fort Knox");
    expect(html).toContain("Authorized CCTV access");
    expect(html).toContain("31,500.00");
    expect(html).toContain("Compare all Control and Fort Knox features");
    expect(html).toContain("Generate contract and invoice");
  });
  it("blocks contract generation when the saved tier is no longer offered", () => {
    const draft = progress("PLAN");
    state.progress = { ...draft, contract: null, invoice: null, subscription: null, organization: { ...draft.organization, selectedPlanKey: "FORT_KNOX" } };
    state.catalog = { plans: [{ key: "CONTROL", name: "Control", features: ["command-center"], pricing: { currency: "KES", monthlyMinor: 1000000, totalMinor: 3000000, includedUnits: 50, extraUnits: 0, additionalUnitMinor: 20000 } }] };
    const html = renderToStaticMarkup(createElement(Page));
    expect(html).toContain("previously selected tier is not available");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Generate contract and invoice<\/button>/);
  });
  it("renders the exact persisted contract version and explicit signature/authority controls", () => {
    state.progress = progress("SIGNATURE");
    const html = renderToStaticMarkup(createElement(Page));
    for (const expected of [
      "Exact retained contract terms",
      "version 3",
      "Full signatory name",
      "I confirm that I am authorized",
      "consent to use my typed name",
      "Sign and accept",
    ])
      expect(html).toContain(expected);
  });
  it("restores pending invoice and verified-payment controls without showing activation success", () => {
    state.progress = progress("PAYMENT");
    const html = renderToStaticMarkup(createElement(Page));
    for (const expected of [
      "INV-ONE",
      "33,000.00",
      "Verify payment / recover checkout",
      "Signed contract",
      "Invoice PDF",
      "Open secure Paystack checkout",
    ])
      expect(html).toContain(expected);
    expect(html).not.toContain("Your Command Center is active");
  });
  it("shows property onboarding and retained receipt only for the backend completion step", () => {
    state.progress = progress("COMPLETE");
    const html = renderToStaticMarkup(createElement(Page));
    expect(html).toContain("Your Command Center is active");
    expect(html).toContain("Start guided property setup");
    expect(html).toContain('href="/get-started"');
    expect(html).toContain("Payment confirmation");
  });
  it("keeps prepared pilot records through commercial setup and opens the populated operation after verified activation", () => {
    const details = progress("DETAILS");
    state.progress = {
      ...details,
      organization: { ...details.organization, pilotPrepared: true },
    };
    const setup = renderToStaticMarkup(createElement(Page));
    expect(setup).toContain(
      "Your prepared property records stay in this workspace",
    );
    expect(setup).not.toContain(
      "Your property records are created after activation",
    );
    expect(setup).not.toContain("Your Command Center is active");
    const complete = progress("COMPLETE");
    state.progress = {
      ...complete,
      organization: { ...complete.organization, pilotPrepared: true },
    };
    const active = renderToStaticMarkup(createElement(Page));
    expect(active).toContain("Open your Command Center");
    expect(active).toContain('href="/dashboard"');
    expect(active).toContain("Manage properties");
    expect(active).not.toContain("Add your first property");
  });
  it("provides loading, retry and sign-in recovery states", () => {
    state.loading = true;
    expect(renderToStaticMarkup(createElement(Page))).toContain(
      "Restoring your saved onboarding progress",
    );
    state.loading = false;
    state.error = "Network unavailable";
    expect(renderToStaticMarkup(createElement(Page))).toContain("Retry");
    state.org = "";
    expect(renderToStaticMarkup(createElement(Page))).toContain(
      "Go to sign in",
    );
  });
});
