import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { api } from "../api";
import {
  platformBusinessClient,
  businessSearch,
  businessMoney,
  businessPercent,
  type BusinessFilters,
  type BusinessOverview,
  type PlatformBrief,
} from "./platform-business";
vi.mock("../api", async (original) => ({
  ...(await original<typeof import("../api")>()),
  api: vi.fn(),
}));
const response: BusinessOverview = {
  version: 1,
  generatedAt: "2026-10-02T09:00:00Z",
  asOf: "2026-10-02T09:00:00Z",
  dataset: "LIVE",
  environment: "test",
  planFilter: "ALL",
  range: {
    from: "2026-10-01T09:00:00Z",
    to: "2026-10-02T09:00:00Z",
    previousFrom: "2026-09-30T09:00:00Z",
    previousTo: "2026-10-01T09:00:00Z",
    timeZone: "Africa/Nairobi",
    period: "TODAY",
  },
  plans: [],
  revenue: [],
  growth: {
    daily: [],
    previous: [],
    movements: [],
    trackingStartedAt: null,
    churnRate: null,
  },
  fortKnox: null,
  operations: [],
  actions: [],
  actionsTruncated: false,
  warnings: [],
  unavailableSources: [],
};
const brief: PlatformBrief = {
  _id: "brief-1",
  generatedAt: response.generatedAt,
  periodFrom: response.range.from,
  periodTo: response.range.to,
  timeZone: response.range.timeZone,
  plan: "ALL",
  dataset: "DEMO",
  sha256: "retained-fixture-hash",
  version: 1,
  snapshot: { ...response, sections: [] },
};
beforeEach(() => vi.mocked(api).mockResolvedValue(response));
afterEach(() => vi.clearAllMocks());
const filters: BusinessFilters = {
  period: "LAST_7_DAYS",
  plan: "FORT_KNOX",
  dataset: "LIVE",
  timeZone: "Africa/Nairobi",
};
describe("platform business typed client", () => {
  it("sends plan, range, timezone and dataset filters to the authoritative API", async () => {
    await platformBusinessClient.overview(filters);
    expect(api).toHaveBeenCalledWith(
      "/platform-control/business-intelligence?" + businessSearch(filters),
    );
  });
  it("uses bounded server-side drill-down and organization filters", async () => {
    vi.mocked(api).mockResolvedValue({
      items: [],
      total: 0,
      page: 2,
      pageSize: 20,
    });
    await platformBusinessClient.drill(filters, "OVERDUE", 2, "abc123");
    const call = vi.mocked(api).mock.calls[0]![0];
    expect(call).toContain("page=2");
    expect(call).toContain("pageSize=20");
    expect(call).toContain("organizationId=abc123");
    expect(call).toContain("kind=OVERDUE");
  });
  it("preserves custom calendar ranges and excludes undefined request parameters", () => {
    const params = new URLSearchParams(
      businessSearch(
        { ...filters, period: "CUSTOM", from: "2026-09-01", to: "2026-09-30" },
        { organizationId: undefined },
      ),
    );
    expect(params.get("from")).toBe("2026-09-01");
    expect(params.get("to")).toBe("2026-09-30");
    expect(params.has("organizationId")).toBe(false);
  });
  it("requests backend brief generation with a stable idempotency key", async () => {
    vi.mocked(api).mockResolvedValue(brief);
    await platformBusinessClient.generate(filters, "stable-request-01");
    expect(api).toHaveBeenCalledWith("/platform-control/morning-briefs", {
      method: "POST",
      body: JSON.stringify({ ...filters, idempotencyKey: "stable-request-01" }),
    });
  });
  it("uses the selected dataset when retrieving immutable historical briefs", async () => {
    vi.mocked(api).mockResolvedValue(brief);
    await platformBusinessClient.brief(
      { ...filters, dataset: "DEMO" },
      "brief-1",
    );
    expect(api).toHaveBeenCalledWith(
      "/platform-control/morning-briefs/brief-1?" +
        businessSearch({ ...filters, dataset: "DEMO" }),
    );
  });
  it("distinguishes unavailable ratios from zero and formats integer minor units", () => {
    expect(businessPercent(null)).toBe("Unavailable");
    expect(businessPercent(0)).toBe("0%");
    expect(businessMoney(3300000)).toContain("33,000.00");
  });
  it.each([
    {},
    null,
    undefined,
    { ...response, revenue: undefined },
    { ...response, revenue: {} },
    { ...response, revenue: [null] },
    { ...response, growth: {} },
    { ...response, range: { ...response.range, timeZone: "Invalid/Zone" } },
  ])(
    "rejects incomplete analytics responses instead of inventing empty totals: %j",
    async (value) => {
      vi.mocked(api).mockResolvedValue(value);
      await expect(
        platformBusinessClient.overview(filters),
      ).rejects.toMatchObject({
        status: 502,
        body: { code: "INVALID_PLATFORM_ANALYTICS_RESPONSE" },
      });
    },
  );
  it("accepts genuine empty and explicitly unavailable source data", async () => {
    vi.mocked(api).mockResolvedValue({
      ...response,
      unavailableSources: ["invoices/verified-payment-events"],
    });
    const result = await platformBusinessClient.overview(filters);
    expect(result.revenue).toEqual([]);
    expect(result.unavailableSources).toEqual([
      "invoices/verified-payment-events",
    ]);
  });
  it("rejects malformed generated and retained brief snapshots", async () => {
    vi.mocked(api).mockResolvedValue({ ...brief, snapshot: {} });
    await expect(
      platformBusinessClient.generate(filters, "stable-request-02"),
    ).rejects.toMatchObject({ status: 502 });
    await expect(
      platformBusinessClient.brief(filters, "brief-1"),
    ).rejects.toMatchObject({ status: 502 });
  });
});
