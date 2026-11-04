import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SalesRevenue,
  RevenueTargetResult,
} from "@/components/sales/sales-revenue";
import { SalesRevenueTargetForm } from "@/components/sales/sales-revenue-target-form";
import {
  toMinor,
  revenueMoney,
  revenueClient,
  type TargetDetail,
} from "./sales-revenue";
const mocks = vi.hoisted(() => ({
  admin: true,
  dev: false,
  error: false,
  enabled: [] as boolean[],
  api: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/api", () => ({ api: mocks.api }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    isDevMode: mocks.dev,
    user: { _id: "reviewer" },
    roles: mocks.admin ? ["SUPER_ADMIN"] : [],
    memberships: [],
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: (options: { enabled: boolean }) => {
    mocks.enabled.push(options.enabled);
    return {
      data: undefined,
      error: mocks.error ? new Error("SALES_ANALYTICS is disabled") : null,
      isLoading: false,
      refetch: vi.fn(),
    };
  },
}));
const detail: TargetDetail = {
  target: {
    _id: "target",
    revision: 2,
    policy: {
      name: "<script>Untrusted target</script>",
      metric: "NEW_MRR",
      currency: "KES",
      period: "MONTHLY",
      periodStart: "2026-11-01",
      baselineMinor: "50000000",
      scope: "DEPARTMENT",
      pipelineCoverageBps: 30000,
    },
  },
  actualMinor: null,
  varianceMinor: null,
  requiredPipelineMinor: "150000000",
  unavailableReason: "Historical movement evidence unavailable",
  levels: [
    { multiplier: 1, quotaMinor: "50000000", attainmentPercent: null },
    { multiplier: 3, quotaMinor: "150000000", attainmentPercent: null },
  ],
  forecast: {
    amountMinor: "60000000",
    basis: "ADMIN_ESTIMATE",
    rationale: "<b>Expected customer conversion</b>",
    attainmentPercent: "120.00",
  },
  period: { from: "2026-11-01", to: "2026-12-01" },
  asOf: "2026-11-04",
  limitations: [],
  history: [],
};
describe("Revenue UI and exact financial presentation", () => {
  beforeEach(() => {
    mocks.admin = true;
    mocks.dev = false;
    mocks.error = false;
    mocks.enabled = [];
    vi.clearAllMocks();
  });
  it("preserves exact minor amounts beyond Number precision and rejects lossy inputs", () => {
    expect(toMinor("9999999999999.99")).toBe("999999999999999");
    expect(toMinor("0.01")).toBe("1");
    expect(revenueMoney("9999999999999990", "KES")).toBe(
      "KES 99,999,999,999,999.90",
    );
    expect(revenueMoney("-1", "USD")).toBe("USD -0.01");
    expect(revenueMoney(null, "KES")).toBe("Unavailable");
    for (const input of ["1e5", "1.001", "-1", "12,000", "", "Infinity"])
      expect(() => toMinor(input)).toThrow();
  });
  it("denies non-admin and preview sessions and disables all their queries", () => {
    mocks.admin = false;
    expect(renderToStaticMarkup(<SalesRevenue />)).toContain(
      "real SUPER_ADMIN session",
    );
    expect(mocks.enabled.every((v) => !v)).toBe(true);
    mocks.admin = true;
    mocks.dev = true;
    mocks.enabled = [];
    expect(renderToStaticMarkup(<SalesRevenue />)).not.toContain("New target");
    expect(mocks.enabled.every((v) => !v)).toBe(true);
  });
  it("shows retry feedback for disabled service without fabricated metrics", () => {
    mocks.error = true;
    const html = renderToStaticMarkup(<SalesRevenue />);
    expect(html).toContain("SALES_ANALYTICS is disabled");
    expect(html).toContain("Retry revenue");
    expect(html).not.toContain("KES 0.00");
  });
  it("separates unavailable actuals and forecast estimates and escapes untrusted content", () => {
    const html = renderToStaticMarkup(<RevenueTargetResult detail={detail} />);
    expect(html).toContain("Actual: Unavailable");
    expect(html).toContain("Attainment unavailable");
    expect(html).toContain("Administrator forecast");
    expect(html).toContain("KES 600,000.00");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("Actual monetary pipeline coverage is unavailable");
  });
  it("does not seed example quotas and exposes labeled auditable form controls", () => {
    const html = renderToStaticMarkup(
      <SalesRevenueTargetForm saved={async () => {}} />,
    );
    expect(html).toContain("Base quota (currency units)");
    expect(html).not.toContain("500000");
    expect(html).toContain("Reason for this target or revision");
    expect(html).toContain("dual-channel");
  });
  it("uses authenticated revenue routes and transmits exact amounts and revisions", async () => {
    await revenueClient.create({
      commandId: "command",
      policy: detail.target.policy,
      reason: "Reviewed target evidence",
    });
    expect(mocks.api).toHaveBeenLastCalledWith(
      "/sales/success/revenue/targets",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"baselineMinor":"50000000"'),
      }),
    );
    await revenueClient.update("target", {
      revision: 2,
      policy: detail.target.policy,
      reason: "Revised commercial assumptions",
    });
    expect(mocks.api).toHaveBeenLastCalledWith(
      "/sales/success/revenue/targets/target",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"revision":2'),
      }),
    );
  });
});
