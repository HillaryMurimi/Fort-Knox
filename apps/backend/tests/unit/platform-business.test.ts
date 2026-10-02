import { describe, it, expect, vi, afterEach } from "vitest";
import {
  businessQuery,
  resolveBusinessRange,
  midnight,
} from "../../src/modules/platform-control/platform-business.schemas.js";
import {
  combineRevenue,
  sortActions,
  requireBusinessDataset,
} from "../../src/modules/platform-control/platform-business.service.js";
import { subscriptionMovement } from "../../src/database/models/OrganizationSubscription.js";
import { env } from "../../src/config/env.js";
afterEach(() => vi.restoreAllMocks());
describe("platform business definitions", () => {
  it("uses Nairobi calendar days rather than the server timezone", () => {
    const range = resolveBusinessRange(
      businessQuery.parse({ period: "TODAY" }),
      new Date("2026-10-01T22:30:00Z"),
    );
    expect(range.from.toISOString()).toBe("2026-10-01T21:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-10-01T22:30:00.000Z");
  });
  it("handles DST calendar boundaries without a fixed UTC offset", () => {
    expect(midnight("2026-03-08", "America/New_York").toISOString()).toBe(
      "2026-03-08T05:00:00.000Z",
    );
    expect(midnight("2026-03-09", "America/New_York").toISOString()).toBe(
      "2026-03-09T04:00:00.000Z",
    );
  });
  it("uses the complete previous month and an equal-duration comparison window", () => {
    const range = resolveBusinessRange(
      businessQuery.parse({ period: "PREVIOUS_MONTH" }),
      new Date("2026-10-02T09:00:00Z"),
    );
    expect(range.from.toISOString()).toBe("2026-08-31T21:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-09-30T21:00:00.000Z");
    expect(range.previousTo).toEqual(range.from);
    expect(range.previousTo.getTime() - range.previousFrom.getTime()).toBe(
      range.to.getTime() - range.from.getTime(),
    );
  });
  it.each(["2026-02-30", "2026-13-01"])(
    "rejects invalid calendar date %s",
    (date) =>
      expect(() =>
        resolveBusinessRange(
          businessQuery.parse({ period: "CUSTOM", from: date, to: date }),
        ),
      ).toThrow(),
  );
  it("rejects reversed, future-only and excessive custom ranges", () => {
    for (const [from, to] of [
      ["2026-09-02", "2026-09-01"],
      ["2028-01-01", "2028-01-02"],
      ["2020-01-01", "2026-01-01"],
    ])
      expect(() =>
        resolveBusinessRange(
          businessQuery.parse({ period: "CUSTOM", from, to }),
          new Date("2026-10-02"),
        ),
      ).toThrow();
    expect(businessQuery.safeParse({ timeZone: "Not/AZone" }).success).toBe(
      false,
    );
    expect(
      businessQuery.safeParse({ organizationId: { $ne: null } }).success,
    ).toBe(false);
  });
  it("separates normalized recurring value from prepaid collections and currencies", () => {
    const values = combineRevenue(
      [
        {
          _id: { plan: "CONTROL", currency: "KES" },
          mrrMinor: 1000000,
          activeSubscriptionValueMinor: 1000000,
          pricedOrganizations: 1,
          pricedUnits: 50,
        },
        {
          _id: { plan: "FORT_KNOX", currency: "KES" },
          mrrMinor: 3000000,
          activeSubscriptionValueMinor: 3000000,
          pricedOrganizations: 1,
          pricedUnits: 100,
        },
      ],
      [],
    );
    expect(values[0]).toMatchObject({
      mrrMinor: 1000000,
      arrMinor: 12000000,
      collectedMinor: 0,
      collectionRate: null,
      revenueContribution: 0.25,
      averageRevenuePerUnitMinor: 20000,
    });
    expect(values[1]?.arrMinor).toBe(36000000);
  });
  it("keeps currencies independent rather than summing unlike money", () => {
    const data = combineRevenue(
      [
        {
          _id: { plan: "CONTROL", currency: "KES" },
          mrrMinor: 10000,
          activeSubscriptionValueMinor: 30000,
          pricedOrganizations: 1,
          pricedUnits: 5,
        },
        {
          _id: { plan: "FORT_KNOX", currency: "USD" },
          mrrMinor: 9000,
          activeSubscriptionValueMinor: 108000,
          pricedOrganizations: 1,
          pricedUnits: 5,
        },
      ],
      [],
    );
    expect(data.map((r) => r.revenueContribution)).toEqual([1, 1]);
    expect(data.map((r) => r.arrMinor)).toEqual([120000, 108000]);
  });
  it.each([
    ["CONTROL", "FORT_KNOX", "UPGRADE"],
    ["FORT_KNOX", "CONTROL", "DOWNGRADE"],
    ["CUSTOM_A", "CUSTOM_B", "PLAN_CHANGED"],
  ])("classifies applied %s to %s as %s", (from, to, kind) =>
    expect(subscriptionMovement(from, to, "ACTIVE", "ACTIVE")).toBe(kind),
  );
  it("separates cancellation and activation from scheduled plan changes", () => {
    expect(
      subscriptionMovement("CONTROL", "CONTROL", "ACTIVE", "CANCELLED"),
    ).toBe("CANCELLED");
    expect(
      subscriptionMovement("CONTROL", "CONTROL", "PENDING", "ACTIVE"),
    ).toBe("ACTIVATED");
  });
  it("sorts priorities from deterministic severity and rejects production demo data", () => {
    const item = {
      category: "Billing",
      title: "Action",
      count: 1,
      href: "/platform",
    };
    expect(
      sortActions([
        { ...item, id: "low", severity: "INFORMATIONAL" },
        { ...item, id: "high", severity: "HIGH" },
        { ...item, id: "critical", severity: "CRITICAL" },
      ]).map((a) => a.id),
    ).toEqual(["critical", "high", "low"]);
    vi.spyOn(env, "NODE_ENV", "get").mockReturnValue("production");
    expect(() => requireBusinessDataset({ dataset: "DEMO" })).toThrow();
    expect(() => requireBusinessDataset({ dataset: "LIVE" })).not.toThrow();
  });
});
