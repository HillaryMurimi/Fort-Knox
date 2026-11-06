import { describe, it, expect } from "vitest";
import {
  deriveRevenueHistory,
  type MovementEvidence,
} from "../../src/modules/sales/revenue-history.calculations.js";
const now = new Date("2026-07-02T12:00:00Z");
function event(
  sequence: number,
  kind: string,
  at: string,
  before: string,
  after: string,
  extra: Partial<MovementEvidence> = {},
): MovementEvidence {
  return {
    id: String(sequence),
    previousEventId: sequence > 1 ? String(sequence - 1) : undefined,
    organizationId: "owner",
    subscriptionId: "subscription",
    sequence,
    kind,
    currency: "KES",
    effectiveAt: at,
    recordedAt: at,
    previousMinor: before,
    newMinor: after,
    paidThrough: "2027-01-01T00:00:00Z",
    completeFromStart: true,
    gaps: [],
    sourceKey: String(sequence),
    sourceKind: "VERIFIED_PAYMENT",
    sourceReference: String(sequence),
    ...extra,
  };
}
describe("Immutable revenue history arithmetic", () => {
  it("truncates fractional retention exactly and rejects broken event links", () => {
    const rows = [
      event(1, "ACTIVATION", "2026-01-05", "0", "1000001"),
      event(2, "EXPANSION", "2026-02-05", "1000001", "1500001"),
    ];
    const result = deriveRevenueHistory(
      rows,
      [],
      "2026-01",
      "2026-02",
      "KES",
      now,
    );
    expect(
      result.cohorts.find(
        (c) => c.cohortMonth === "2026-01" && c.month === "2026-02",
      )?.netRevenueRetentionPercent,
    ).toBe("149.99");
    rows[1]!.previousEventId = "unrelated";
    expect(
      deriveRevenueHistory(rows, [], "2026-02", "2026-02", "KES", now)
        .bridges[0]?.reasons,
    ).toContain("MOVEMENT_LINK_INVALID");
  });
  it("reconciles every movement in exact minor units beyond Number precision", () => {
    const rows = [
      event(1, "ACTIVATION", "2026-01-01T00:00:00Z", "0", "9007199254740993"),
      event(
        2,
        "EXPANSION",
        "2026-02-01T00:00:00Z",
        "9007199254740993",
        "9007199254741003",
      ),
      event(
        3,
        "CONTRACTION",
        "2026-03-01T00:00:00Z",
        "9007199254741003",
        "9007199254740998",
      ),
      event(4, "CANCELLATION", "2026-04-01T00:00:00Z", "9007199254740998", "0"),
      event(5, "REACTIVATION", "2026-05-01T00:00:00Z", "0", "9007199254740993"),
      event(
        6,
        "RENEWAL",
        "2026-06-01T00:00:00Z",
        "9007199254740993",
        "9007199254740993",
      ),
    ];
    const report = deriveRevenueHistory(
      rows,
      [],
      "2026-01",
      "2026-06",
      "KES",
      now,
    );
    expect(report.bridges.every((m) => m.reconciled)).toBe(true);
    expect(report.bridges[1]).toMatchObject({
      openingMinor: "9007199254740993",
      expansionMinor: "10",
      closingMinor: "9007199254741003",
    });
    expect(report.bridges[2]?.contractionMinor).toBe("5");
    expect(report.bridges[3]?.churnedMinor).toBe("9007199254740998");
    expect(report.bridges[4]).toMatchObject({
      newMinor: "0",
      reactivationMinor: "9007199254740993",
    });
    expect(report.bridges[5]).toMatchObject({
      newMinor: "0",
      closingMinor: "9007199254740993",
    });
  });
  it("separates currencies and measures point-in-time customer, gross and net retention", () => {
    const rows = [
      event(1, "ACTIVATION", "2026-01-01T00:00:00Z", "0", "100"),
      event(2, "EXPANSION", "2026-02-01T00:00:00Z", "100", "150"),
      event(1, "ACTIVATION", "2026-01-02T00:00:00Z", "0", "100", {
        organizationId: "second",
        subscriptionId: "second",
      }),
      event(2, "CANCELLATION", "2026-02-02T00:00:00Z", "100", "0", {
        organizationId: "second",
        subscriptionId: "second",
      }),
      event(1, "ACTIVATION", "2026-01-01T00:00:00Z", "0", "999", {
        organizationId: "usd",
        currency: "USD",
      }),
    ];
    const report = deriveRevenueHistory(
      rows,
      [],
      "2026-01",
      "2026-02",
      "KES",
      now,
    );
    expect(report.bridges[1]?.closingMinor).toBe("150");
    expect(
      report.cohorts.find(
        (c) => c.cohortMonth === "2026-01" && c.month === "2026-02",
      ),
    ).toMatchObject({
      customers: 2,
      retainedCustomers: 1,
      customerRetentionPercent: "50.00",
      grossRevenueRetentionPercent: "50.00",
      netRevenueRetentionPercent: "75.00",
    });
  });
  it("fails closed for gaps, replayed sequence, missing expiry, partial periods and source caps", () => {
    const first = event(1, "ACTIVATION", "2026-01-01T00:00:00Z", "0", "100");
    for (const rows of [
      [first, first],
      [{ ...first, completeFromStart: false }],
      [{ ...first, paidThrough: "2026-01-15T00:00:00Z" }],
    ]) {
      expect(
        deriveRevenueHistory(rows, [], "2026-01", "2026-01", "KES", now)
          .bridges[0]?.closingMinor,
      ).toBeNull();
    }
    expect(
      deriveRevenueHistory(
        [first],
        [{ code: "MISSING_PROVIDER_PROOF" }],
        "2026-01",
        "2026-01",
        "KES",
        now,
      ).bridges[0]?.closingMinor,
    ).toBeNull();
    expect(
      deriveRevenueHistory([first], [], "2026-07", "2026-07", "KES", now)
        .bridges[0]?.reasons,
    ).toContain("PERIOD_NOT_CLOSED");
    expect(
      deriveRevenueHistory([first], [], "2026-01", "2026-01", "KES", now, true)
        .bridges[0]?.reasons,
    ).toContain("SOURCE_LIMIT_EXCEEDED");
  });
  it("uses Nairobi half-open month boundaries", () => {
    const first = event(1, "ACTIVATION", "2026-01-31T21:00:00Z", "0", "100");
    const report = deriveRevenueHistory(
      [first],
      [],
      "2026-01",
      "2026-02",
      "KES",
      now,
    );
    expect(report.bridges[1]).toMatchObject({
      openingMinor: "0",
      newMinor: "100",
      closingMinor: "100",
    });
  });
});
