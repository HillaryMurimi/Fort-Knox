import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlatformControls } from "@/components/platform-controls";
import { LaunchReadiness } from "@/components/launch-readiness";
import { PlatformMonitoring } from "@/components/platform-monitoring";
import PlatformPage from "@/app/(dashboard)/platform/page";
const state = vi.hoisted(() => ({
  preview: false,
  switches: [] as unknown,
  readiness: {} as unknown,
  monitoring: {} as unknown,
  calls: vi.fn(),
}));
const query = (data: unknown) => ({
  data,
  isError: false,
  isPending: false,
  isLoading: false,
  refetch: vi.fn(),
});
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { isPlatformAdmin: true },
    isDevMode: state.preview,
  }),
}));
vi.mock("@/hooks/use-platform-search", () => ({
  usePlatformSearch: () => "?tab=controls",
}));
vi.mock("@/hooks/queries/use-platform-queries", async (original) => ({
  ...(await original<typeof import("@/hooks/queries/use-platform-queries")>()),
  usePlatformPlansQuery: () => {
    state.calls();
    return query([]);
  },
  usePlatformSwitchesQuery: () => query(state.switches),
  usePlatformSwitchMutation: () => ({ isPending: false }),
  useLaunchReadinessQuery: () => query(state.readiness),
  useUpdateLaunchReadinessMutation: () => ({ isPending: false }),
}));
vi.mock("@/hooks/queries/use-platform-monitoring", () => ({
  useMonitoringOverview: () => query(state.monitoring),
  useMonitoringAlerts: () => ({ isError: true, isPending: false }),
  useMaintenanceWindows: () => ({ isError: true, isPending: false }),
  useMonitoringAction: () => ({ isPending: false }),
  useMonitoringHistory: vi.fn(),
}));
afterEach(() => {
  state.preview = false;
  state.calls.mockClear();
});
describe("control-plane malformed response recovery", () => {
  it.each([{}, null, 0, [null], [{ key: "payments" }]])(
    "protects controls from incompatible cached data: %j",
    (value) => {
      state.switches = value;
      const html = renderToStaticMarkup(createElement(PlatformControls));
      expect(html).toContain("Platform response is incomplete or incompatible");
      expect(html).toContain("Retry controls");
      expect(html).not.toContain("Turn ON");
    },
  );
  it.each([{}, { items: [] }, { items: [null], summary: {} }])(
    "protects readiness from incompatible cached data: %j",
    (value) => {
      state.readiness = value;
      const html = renderToStaticMarkup(createElement(LaunchReadiness));
      expect(html).toContain("Retry readiness");
      expect(html).not.toContain("Items ready");
    },
  );
  it.each([
    {},
    { areas: [] },
    {
      environment: "test",
      generatedAt: "2026-10-02",
      switches: null,
      collector: null,
      areas: [
        {
          key: "queues",
          title: "Queues",
          status: "HEALTHY",
          metrics: [],
          conditions: [],
          truncated: false,
        },
      ],
    },
  ])("protects monitoring from incompatible nested data: %j", (value) => {
    state.monitoring = value;
    const html = renderToStaticMarkup(createElement(PlatformMonitoring));
    expect(html).toContain("Retry monitoring");
    expect(html).not.toContain("Healthy areas");
  });
  it("preserves genuine empty controls and unavailable monitoring sources", () => {
    state.switches = [];
    expect(renderToStaticMarkup(createElement(PlatformControls))).toContain("Service and feature controls");
    state.monitoring = {
      environment: "test",
      generatedAt: "2026-10-02",
      switches: null,
      collector: null,
      areas: [],
    };
    const html = renderToStaticMarkup(createElement(PlatformMonitoring));
    expect(html).toContain("Alert records unavailable");
    expect(html).toContain("Switch monitoring not configured or unavailable");
  });
  it("gives preview setup guidance before mounting privileged queries", () => {
    state.preview = true;
    const html = renderToStaticMarkup(createElement(PlatformPage));
    expect(html).toContain("Real SUPER_ADMIN sign-in required");
    expect(html).toContain("NEXT_PUBLIC_DEV_AUTH_BYPASS=false");
    expect(html).toContain("email OTP and SMS OTP");
    expect(state.calls).not.toHaveBeenCalled();
    expect(html).not.toContain("Create plan");
  });
});
