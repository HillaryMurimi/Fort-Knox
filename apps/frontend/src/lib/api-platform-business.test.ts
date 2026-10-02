import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { demoApi } from "./demo/demo-provider";
const state = vi.hoisted(() => ({ bypass: false, admin: false }));
vi.mock("./demo/demo-config", async (original) => ({
  ...(await original<typeof import("./demo/demo-config")>()),
  DEV_DEMO_MODE: true,
}));
vi.mock("./auth/dev-auth", () => ({
  isDevAuthBypassEnabled: () => state.bypass,
}));
vi.mock("./auth/auth-storage", () => ({
  getStoredAuthSession: () => ({
    accessToken: "private-test-session",
    user: { isPlatformAdmin: state.admin },
  }),
  clearStoredAuthSession: vi.fn(),
  updateStoredAccessToken: vi.fn(),
}));
vi.mock("./demo/demo-provider", () => ({ demoApi: vi.fn() }));
beforeEach(() => {
  vi.stubGlobal("window", { location: { pathname: "/platform" } });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { source: "BACKEND" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
  vi.mocked(demoApi).mockResolvedValue({ source: "LOCAL_PREVIEW" });
});
afterEach(() => {
  state.bypass = false;
  state.admin = false;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
describe("platform analytics in development demo mode", () => {
  it.each([
    "/platform-control/business-intelligence?dataset=LIVE",
    "/platform-control/business-intelligence/drill-down?kind=OVERDUE",
    "/platform-control/morning-briefs?dataset=DEMO",
    "/platform-control/morning-briefs/retained-brief?dataset=DEMO",
    "/platform-control/monitoring",
    "/platform-control/monitoring/alerts?page=1",
    "/platform-control/switches",
    "/platform-control/launch-readiness",
    "/platform-control/sales-intelligence",
    "/operations/diagnostics",
    "/sales/demos",
  ])("uses authenticated backend data for %s", async (path) => {
    expect(await api(path)).toEqual({ source: "BACKEND" });
    expect(demoApi).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(path),
      expect.objectContaining({ credentials: "include", cache: "no-store" }),
    );
    const headers = new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer private-test-session");
    expect(headers.get("X-PCC-Auth")).toBe("1");
  });
  it("sends brief generation to the backend even with local demo data enabled", async () => {
    await api("/platform-control/morning-briefs", {
      method: "POST",
      body: JSON.stringify({ idempotencyKey: "stable-private-test-key" }),
    });
    expect(demoApi).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "POST" }),
    );
  });
  it("shows setup guidance for a simulated admin instead of sending a preview token", async () => {
    state.bypass = true;
    await expect(
      api("/platform-control/business-intelligence"),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining("real SUPER_ADMIN session"),
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(demoApi).not.toHaveBeenCalled();
  });
  it.each([
    "/organizations",
    "/billing/plans",
    "/users/organization/org-1",
    "/roles/organization/org-1",
    "/audit-logs",
    "/organizations/org-1/jobs",
  ])(
    "never substitutes local data for a real administrator: %s",
    async (path) => {
      state.admin = true;
      expect(await api(path)).toEqual({ source: "BACKEND" });
      expect(fetch).toHaveBeenCalled();
      expect(demoApi).not.toHaveBeenCalled();
    },
  );
  it.each([
    "/platform-control/monitoring",
    "/platform-control/switches",
    "/platform-control/launch-readiness",
    "/sales/demos",
  ])("blocks preview tokens for %s", async (path) => {
    state.bypass = true;
    state.admin = true;
    await expect(api(path)).rejects.toMatchObject({ status: 503 });
    expect(fetch).not.toHaveBeenCalled();
    expect(demoApi).not.toHaveBeenCalled();
  });
  it("preserves supported organization previews for a simulated administrator", async () => {
    state.bypass = true;
    state.admin = true;
    expect(await api("/organizations/demo-org-dapini/properties")).toEqual({
      source: "LOCAL_PREVIEW",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves working local landlord demo routes", async () => {
    state.bypass = true;
    expect(
      await api("/organizations/demo-org-dapini/finance/payments"),
    ).toEqual({ source: "LOCAL_PREVIEW" });
    expect(demoApi).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
