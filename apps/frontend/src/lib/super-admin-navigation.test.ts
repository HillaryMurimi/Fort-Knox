import { describe, expect, it } from "vitest";
import {
  ROLE_NAVIGATION,
  isNavigationItemActive,
  canPresentRoute,
} from "./navigation";
import { isPlatformBackendRequest } from "./demo/demo-config";

describe("SUPER_ADMIN sidebar destinations", () => {
  const items = ROLE_NAVIGATION.SUPER_ADMIN.flatMap((section) => section.items);
  it("targets implemented control-plane tabs instead of nonexistent admin sections", () => {
    const expected: Record<string, string> = {
      Organizations: "organizations",
      "Users & Access": "access",
      "Roles & Permissions": "access",
      "Plans & Subscriptions": "billing",
      Entitlements: "billing",
      "Integrations & Health": "security",
      Webhooks: "security",
      "Security & Sessions": "security",
      "Audit Explorer": "operations",
      "Feature Flags": "controls",
      Notifications: "monitoring",
      "Jobs & Queues": "operations",
      "Support & Diagnostics": "security",
      Analytics: "plan performance",
    };
    for (const [label, tab] of Object.entries(expected)) {
      const href = items.find((item) => item.label === label)?.href;
      expect(href).toBeDefined();
      const url = new URL(href!, "http://localhost");
      expect(url.pathname).toBe("/platform");
      expect(url.searchParams.get("tab")).toBe(tab);
      expect(url.hash).toBe("");
    }
  });
  it("preserves organization route restrictions", () => {
    for (const item of items.filter((item) =>
      item.href.startsWith("/platform"),
    )) {
      expect(canPresentRoute("SUPER_ADMIN", item.href)).toBe(true);
      expect(canPresentRoute("LANDLORD", item.href)).toBe(false);
      expect(canPresentRoute("TENANT", item.href)).toBe(false);
    }
  });
  it("marks the selected tab and handles encoded tab names", () => {
    expect(
      isNavigationItemActive(
        "/platform?tab=billing",
        "/platform",
        "?tab=billing&organizationId=abc",
      ),
    ).toBe(true);
    expect(
      isNavigationItemActive(
        "/platform?tab=access",
        "/platform",
        "?tab=billing",
      ),
    ).toBe(false);
    expect(
      isNavigationItemActive("/platform?tab=plan%20performance", "/platform"),
    ).toBe(true);
    expect(isNavigationItemActive("/properties", "/properties/abc")).toBe(true);
    expect(isNavigationItemActive("/admin#users", "/admin")).toBe(false);
    expect(
      isNavigationItemActive(
        "/platform?tab=billing",
        "/properties",
        "?tab=billing",
      ),
    ).toBe(false);
  });
  it.each([
    "/platform-control/monitoring?area=security",
    "/platform-control/future-capability",
    "/sales/demos",
    "/operations/diagnostics",
  ])("keeps %s on the backend", (path) => {
    expect(isPlatformBackendRequest(path)).toBe(true);
  });
  it.each([
    "/platform-controller",
    "/salesperson",
    "/organizations/demo-org-dapini/properties",
    "/organizations/demo-org-dapini/finance/payments",
  ])("preserves nonplatform route boundaries for %s", (path) => {
    expect(isPlatformBackendRequest(path)).toBe(false);
  });
});
