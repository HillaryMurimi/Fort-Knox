import { describe, expect, it, vi } from "vitest";
import { demoApi } from "./demo-provider";
vi.mock("./demo-config", async (original) => ({
  ...(await original<typeof import("./demo-config")>()),
  DEV_DEMO_MODE: true,
}));
describe("local preview analytics boundary", () => {
  it.each(["GET", "POST"])(
    "rejects unsupported business analytics before generic platform fallbacks for %s",
    async (method) => {
      for (const path of [
        "/platform-control/business-intelligence?dataset=LIVE",
        "/platform-control/morning-briefs",
        "/platform-control/morning-briefs/brief-1",
      ])
        await expect(demoApi(path, { method })).rejects.toThrow(
          "authenticated backend",
        );
    },
  );
  it("continues serving supported portfolio preview data", async () => {
    const properties = await demoApi<unknown[]>(
      "/organizations/demo-org-dapini/properties",
    );
    expect(Array.isArray(properties)).toBe(true);
    expect(properties.length).toBeGreaterThan(0);
  });
});
