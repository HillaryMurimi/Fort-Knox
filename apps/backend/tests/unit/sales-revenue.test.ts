import { describe, it, expect } from "vitest";
import { revenueTargetPolicySchema as schema } from "../../src/modules/sales/sales-revenue.schemas.js";
import {
  targetPerformance,
  targetPeriod,
} from "../../src/modules/sales/sales-revenue.calculations.js";
const base = {
  name: "Controlled revenue target",
  metric: "COLLECTED_CASH",
  currency: "KES",
  period: "MONTHLY",
  periodStart: "2026-11-01",
  baselineMinor: "50000000",
  scope: "DEPARTMENT",
  pipelineCoverageBps: 30000,
};
describe("Revenue target arithmetic and policy validation", () => {
  it("keeps base and stretch amounts exact and separates forecasts from actuals", () => {
    const p = schema.parse({
      ...base,
      baselineMinor: "999999999999999",
      forecastMinor: "100",
      forecastRationale: "Explicit administrator planning assumption",
    });
    const result = targetPerformance(p, "333333333333333");
    expect(result.levels.map((x) => x.quotaMinor)).toEqual([
      "999999999999999",
      "2999999999999997",
      "6999999999999993",
      "9999999999999990",
    ]);
    expect(result.levels[0]?.attainmentPercent).toBe("33.33");
    expect(result.varianceMinor).toBe("-666666666666666");
    expect(result.forecast?.basis).toBe("ADMIN_ESTIMATE");
    expect(result.actualMinor).toBe("333333333333333");
    expect(
      targetPerformance(p, null).levels.every(
        (x) => x.attainmentPercent === null,
      ),
    ).toBe(true);
  });
  it("uses Nairobi calendar boundaries, leap months and year transitions", () => {
    expect(
      targetPeriod({ period: "MONTHLY", periodStart: "2024-02-01" }),
    ).toEqual({
      from: new Date("2024-01-31T21:00:00Z"),
      to: new Date("2024-02-29T21:00:00Z"),
    });
    expect(
      targetPeriod({
        period: "QUARTERLY",
        periodStart: "2026-10-01",
      }).to.toISOString(),
    ).toBe("2026-12-31T21:00:00.000Z");
    expect(
      targetPeriod({
        period: "ANNUAL",
        periodStart: "2026-01-01",
      }).to.toISOString(),
    ).toBe("2026-12-31T21:00:00.000Z");
  });
  it("rejects invented defaults, invalid scopes, unqualified forecasts and malformed money", () => {
    for (const changes of [
      { baselineMinor: "0" },
      { baselineMinor: "1.5" },
      { baselineMinor: 100 },
      { baselineMinor: "1000000000000000" },
      { scope: "CAMPAIGN" },
      { scopeId: "unexpected" },
      { scope: "AGENT", scopeId: "made-up" },
      { forecastMinor: "123" },
      { forecastRationale: "Missing forecast amount" },
      { period: "ANNUAL", periodStart: "2026-02-01" },
      { periodStart: "2026-02-30" },
    ])
      expect(schema.safeParse({ ...base, ...changes }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });
});
