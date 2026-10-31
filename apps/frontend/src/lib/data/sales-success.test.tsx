import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SalesSuccessWorkspace } from "@/components/sales/sales-success-workspace";
import { navigationFor, canPresentRoute } from "@/lib/navigation";
import { successClient } from "./sales-success";
const mocks = vi.hoisted(() => ({
  auth: {
    roles: ["SUPER_ADMIN"],
    isDevMode: false,
    isLoading: false,
    memberships: [] as { permissions: string[] }[],
    user: { _id: "admin" },
  },
  api: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/api", () => ({ api: mocks.api }));
function render() {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <SalesSuccessWorkspace />
    </QueryClientProvider>,
  );
}
describe("sales success integration UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.roles = ["SUPER_ADMIN"];
    mocks.auth.isDevMode = false;
    mocks.auth.memberships = [];
  });
  it("renders the real administrator workspace with accessible controls", () => {
    const html = render();
    expect(html).toContain("AI Sales &amp; Customer Success");
    expect(html).toContain('aria-label="Sales workspace"');
    expect(html).toContain("Create lead");
    expect(html).toContain("Conversion analytics");
  });
  it("denies ordinary roles and development preview without issuing API calls", () => {
    mocks.auth.roles = ["LANDLORD"];
    expect(render()).toContain("explicitly delegated");
    mocks.auth.roles = ["SUPER_ADMIN"];
    mocks.auth.isDevMode = true;
    expect(render()).toContain("explicitly delegated");
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("adds delegated navigation only for explicit permissions", () => {
    expect(
      navigationFor("LANDLORD")
        .flatMap((s) => s.items)
        .some((i) => i.href === "/sales-success"),
    ).toBe(false);
    expect(
      navigationFor("LANDLORD", ["sales.leads.read"])
        .flatMap((s) => s.items)
        .some((i) => i.href === "/sales-success"),
    ).toBe(true);
    expect(
      canPresentRoute("LANDLORD", "/sales-success", ["sales.leads.read"]),
    ).toBe(true);
  });
  it("uses the integrated API, preserves meeting outcomes and encodes search", async () => {
    await successClient.list(2, "A&B");
    expect(mocks.api).toHaveBeenCalledWith(
      "/sales/success/customers?page=2&search=A%26B",
    );
    await successClient.outcome("lead", "meeting", {
      revision: 0,
      status: "COMPLETED",
      outcome: "Needs migration support",
    });
    expect(mocks.api).toHaveBeenLastCalledWith(
      "/sales/success/customers/lead/meetings/meeting",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          revision: 0,
          status: "COMPLETED",
          outcome: "Needs migration support",
        }),
      }),
    );
  });
});
