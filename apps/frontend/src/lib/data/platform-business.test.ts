import { afterEach, describe, it, expect, vi } from "vitest";
import { api } from "../api";
import {
  platformBusinessClient,
  businessSearch,
  businessMoney,
  businessPercent,
  type BusinessFilters,
} from "./platform-business";
vi.mock("../api", () => ({ api: vi.fn() }));
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
    await platformBusinessClient.generate(filters, "stable-request-01");
    expect(api).toHaveBeenCalledWith("/platform-control/morning-briefs", {
      method: "POST",
      body: JSON.stringify({ ...filters, idempotencyKey: "stable-request-01" }),
    });
  });
  it("uses the selected dataset when retrieving immutable historical briefs", async () => {
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
});
