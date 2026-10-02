import { describe, it, expect, vi, afterEach } from "vitest";
import { Types } from "mongoose";
import { createHash } from "node:crypto";
import {
  buildDemo,
  applyDemoAction,
  summarizeDemo,
  demoTemplates,
  demoStories,
} from "../../src/modules/sales/sales-demo.engine.js";
import {
  demoProfileSchema,
  commandSchema,
} from "../../src/modules/sales/sales-demo.schemas.js";
import { validateImportRows } from "../../src/modules/sales/pilot-import.service.js";
import {
  activationReadiness,
  pilotIsOpen,
} from "../../src/modules/sales/guided-pilot.service.js";
import { assertSalesAccess } from "../../src/modules/sales/sales-demo.service.js";
import { AuthorizationService } from "../../src/core/authorization/authorization.service.js";
const profile = demoProfileSchema.parse({ companyName: "Acacia Discovery" });
const fresh = () => buildDemo(profile);
describe("pain-first deterministic demonstration policy", () => {
  it.each(demoTemplates)("resets $name deterministically", (template) => {
    const p = { ...profile, template: template.id };
    expect(buildDemo(p)).toEqual(buildDemo(p));
    expect(buildDemo(p).units).toHaveLength(template.units);
  });
  it("creates mathematically coherent Control opening, real history and fictional Kenyan context", () => {
    const s = fresh(),
      m = summarizeDemo(s);
    expect(m).toMatchObject({
      expectedMinor: 280000000,
      collectedMinor: 230000000,
      outstandingMinor: 50000000,
      overdueTenants: 17,
      occupancy: 94,
      openMaintenance: 6,
      approvals: 2,
    });
    expect(s.trends).toHaveLength(6);
    expect(
      s.charges.every((c) => c.paidMinor + c.balanceMinor === c.totalMinor),
    ).toBe(true);
    expect(s.charges.slice(0, 5).reduce((n, c) => n + c.balanceMinor, 0)).toBe(
      18000000,
    );
    expect(
      s.evidence.every(
        (e) =>
          e.sha256 === createHash("sha256").update(e.content).digest("hex"),
      ),
    ).toBe(true);
  });
  it.each(demoStories)("opens the selected $name story", (story) => {
    const p = demoProfileSchema.parse({
      ...profile,
      primaryPain: story.id,
      plan: story.id === "SECURITY" ? "FORT_KNOX" : "CONTROL",
    });
    expect(buildDemo(p).story).toBe(story.id);
  });
  it("personalizes scale, property type intent, name, occupancy and voluntary rent roll without upgrading plan", () => {
    const s = buildDemo({
      ...profile,
      companyName: "Nyota Portfolio",
      units: 300,
      properties: 8,
      occupancy: 80,
      monthlyRentRollMinor: 800000000,
      propertyType: "COMMERCIAL",
    });
    expect(s.organizationName).toBe("Nyota Portfolio");
    expect(s.units).toHaveLength(300);
    expect(summarizeDemo(s).occupancy).toBe(80);
    expect(s.plan).toBe("CONTROL");
    expect(summarizeDemo(s).expectedMinor).toBe(800000000);
  });
  it("requires Fort Knox only for security, rejects forged live IDs and negative/overprecision payment amounts", () => {
    expect(
      demoProfileSchema.safeParse({ ...profile, primaryPain: "SECURITY" })
        .success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        expectedRevision: 0,
        commandId: "abcdefghijklmnop",
        kind: "SIMULATE_PAYMENT",
        resourceId: new Types.ObjectId().toString(),
      }).success,
    ).toBe(false);
    for (const amountMinor of [-1, 0, 1.5])
      expect(
        commandSchema.safeParse({
          expectedRevision: 0,
          commandId: "abcdefghijklmnop",
          kind: "SIMULATE_PAYMENT",
          amountMinor,
        }).success,
      ).toBe(false);
  });
  it("payment produces exact allocation, reconciliation, receipt, KPI and attention changes", () => {
    const s = fresh(),
      balance = s.charges[0].balanceMinor,
      r = applyDemoAction(
        s,
        { kind: "SIMULATE_PAYMENT", resourceId: s.charges[0].id },
        "demo-actor",
      );
    expect(s.charges[0].balanceMinor).toBe(balance);
    expect(r.snapshot.charges[0]).toMatchObject({
      balanceMinor: 0,
      status: "PAID",
    });
    expect(summarizeDemo(r.snapshot).outstandingMinor).toBe(50000000 - balance);
    expect(summarizeDemo(r.snapshot).overdueTenants).toBe(16);
    expect(r.snapshot.payments[0]).toMatchObject({
      label: "SIMULATED PAYMENT",
      status: "RECONCILED",
      amountMinor: balance,
    });
    expect(r.event).toBe("payment.reconciled");
    expect(() =>
      applyDemoAction(
        r.snapshot,
        { kind: "SIMULATE_PAYMENT", resourceId: s.charges[0].id },
        "actor",
      ),
    ).toThrow();
  });
  it("rejects over-allocation and wrong-session resources without mutating input", () => {
    const s = fresh();
    expect(() =>
      applyDemoAction(
        s,
        {
          kind: "SIMULATE_PAYMENT",
          resourceId: s.charges[0].id,
          amountMinor: s.charges[0].balanceMinor + 1,
        },
        "actor",
      ),
    ).toThrow();
    expect(() =>
      applyDemoAction(
        s,
        { kind: "APPROVE_MAINTENANCE", resourceId: "demo-missing" },
        "actor",
      ),
    ).toThrow();
    expect(s).toEqual(fresh());
  });
  it("shows due rent and elapsed-clock arrears detection", () => {
    let s = fresh();
    const expected = summarizeDemo(s).expectedMinor;
    s = applyDemoAction(
      s,
      { kind: "RENT_DUE", resourceId: s.units[0].id },
      "actor",
    ).snapshot;
    expect(summarizeDemo(s).expectedMinor).toBe(
      expected + s.units[0].monthlyRentMinor,
    );
    expect(s.charges.at(-1)?.status).toBe("DUE");
    s = applyDemoAction(s, { kind: "ADVANCE_OVERDUE" }, "actor").snapshot;
    expect(s.charges.at(-1)?.status).toBe("OVERDUE");
  });
  it("runs complete tenant report → approval → verified repair with costs and before/after evidence", () => {
    let s = applyDemoAction(fresh(), { kind: "REPORT_LEAK" }, "actor").snapshot;
    const id = "demo-maintenance-new-leak";
    for (const kind of [
      "TRIAGE",
      "ASSIGN",
      "QUOTE",
      "APPROVE_MAINTENANCE",
      "START_WORK",
      "COMPLETE_REPAIR",
      "VERIFY_REPAIR",
      "CLOSE_REPAIR",
    ] as const)
      s = applyDemoAction(s, { kind, resourceId: id }, "actor").snapshot;
    const m = s.maintenance.find((m) => m.id === id)!;
    expect(m).toMatchObject({
      status: "CLOSED",
      finalCostMinor: 850000,
      approvedBy: "actor",
      completionApprovedBy: "actor",
    });
    expect(m.evidenceIds).toHaveLength(4);
    expect(s.notifications.some((n) => n.channel === "SIMULATED IN-APP")).toBe(
      true,
    );
    expect(
      s.history.some((h) => h.action === "maintenance.problem.resolved"),
    ).toBe(true);
  });
  it("blocks invalid repair jumps and expenditure beyond approved budget", () => {
    const s = fresh();
    expect(() =>
      applyDemoAction(
        s,
        { kind: "COMPLETE_REPAIR", resourceId: s.maintenance[0].id },
        "actor",
      ),
    ).toThrow();
    let next = applyDemoAction(
      s,
      { kind: "APPROVE_MAINTENANCE", resourceId: s.maintenance[0].id },
      "actor",
    ).snapshot;
    next = applyDemoAction(
      next,
      { kind: "START_WORK", resourceId: s.maintenance[0].id },
      "actor",
    ).snapshot;
    expect(() =>
      applyDemoAction(
        next,
        {
          kind: "COMPLETE_REPAIR",
          resourceId: s.maintenance[0].id,
          amountMinor: 1800001,
        },
        "actor",
      ),
    ).toThrow();
  });
  it("preserves vacancy exposure and staff evidence while resolving attention", () => {
    const s = fresh(),
      u = s.units.find((u) => u.status === "VACANT")!;
    expect(u.code).toBe("B14");
    expect(u.vacantDays).toBe(37);
    const n = applyDemoAction(
      s,
      { kind: "VACANCY_ACTION", resourceId: u.id },
      "actor",
    ).snapshot;
    expect(summarizeDemo(n).attention.some((a) => a.id === u.id)).toBe(false);
    const t = applyDemoAction(
      n,
      { kind: "COMPLETE_TASK", resourceId: "demo-task-1" },
      "actor",
    ).snapshot;
    expect(t.staff[0].approvedBy).toBe("actor");
    expect(summarizeDemo(t).attention.some((a) => a.kind === "STAFF")).toBe(
      false,
    );
  });
  it("keeps Control complete and enforces distinct simulated Fort Knox workflow", () => {
    expect(() =>
      applyDemoAction(fresh(), { kind: "SIMULATE_SECURITY" }, "actor"),
    ).toThrow();
    let s = buildDemo({ ...profile, plan: "FORT_KNOX" });
    s = applyDemoAction(s, { kind: "SIMULATE_SECURITY" }, "actor").snapshot;
    expect(s.incidents[0].source).toBe("SIMULATED");
    expect(() =>
      applyDemoAction(
        s,
        { kind: "RESOLVE_INCIDENT", resourceId: s.incidents[0].id },
        "actor",
      ),
    ).toThrow();
    for (const kind of [
      "INVESTIGATE_INCIDENT",
      "ESCALATE_INCIDENT",
      "RESOLVE_INCIDENT",
    ] as const)
      s = applyDemoAction(
        s,
        { kind, resourceId: s.incidents[0].id },
        "actor",
      ).snapshot;
    expect(s.incidents[0].status).toBe("RESOLVED");
    expect(summarizeDemo(s).attention.some((a) => a.kind === "SECURITY")).toBe(
      false,
    );
    expect(s.evidence.some((e) => e.resourceId === s.incidents[0].id)).toBe(
      true,
    );
  });
  it("requires an actual demonstrated outcome before pilot offer", () => {
    expect(() =>
      applyDemoAction(fresh(), { kind: "COMPLETE_DEMO" }, "actor"),
    ).toThrow();
    expect(() =>
      applyDemoAction(fresh(), { kind: "OFFER_PILOT" }, "actor"),
    ).toThrow();
    let s = applyDemoAction(
      fresh(),
      { kind: "SIMULATE_PAYMENT", resourceId: "demo-charge-1" },
      "actor",
    ).snapshot;
    s = applyDemoAction(s, { kind: "COMPLETE_DEMO" }, "actor").snapshot;
    expect(applyDemoAction(s, { kind: "OFFER_PILOT" }, "actor").event).toBe(
      "pilot.offered",
    );
  });
  it("rejects live snapshots and undelegated identities", () => {
    expect(() =>
      applyDemoAction(
        { ...fresh(), dataset: "LIVE" } as never,
        { kind: "SIMULATE_SECURITY" },
        "actor",
      ),
    ).toThrow();
    expect(() =>
      assertSalesAccess({
        userId: new Types.ObjectId(),
        isPlatformAdmin: false,
        memberships: [],
      }),
    ).toThrow();
  });
});
const row = {
  propertyName: "Acacia Court",
  propertyCode: "ACACIA",
  address: "Kilimani",
  buildingName: "Block A",
  buildingCode: "A",
  floorName: "Ground floor",
  floorLevel: 0,
  unitCode: "A01",
  unitType: "TWO_BEDROOM",
  monthlyRentMinor: 2500000,
};
describe("guided pilot and import policies", () => {
  it("validates all activation criteria from facts rather than an account-created checkbox", () => {
    expect(
      activationReadiness({
        configured: true,
        properties: 0,
        units: 0,
        tenancies: 0,
        charges: 0,
        staff: 0,
        workflows: 0,
      }).percent,
    ).toBe(14);
    const r = activationReadiness({
      configured: true,
      properties: 1,
      units: 120,
      tenancies: 100,
      charges: 100,
      staff: 2,
      workflows: 1,
    });
    expect(r).toMatchObject({ percent: 100, complete: true, next: null });
  });
  it("enforces expiry at the exact server boundary", () => {
    const now = new Date("2026-10-02T00:00:00Z");
    expect(pilotIsOpen({ expiresAt: now }, now)).toBe(false);
    expect(pilotIsOpen({ expiresAt: new Date(now.getTime() + 1) }, now)).toBe(
      true,
    );
    expect(pilotIsOpen(undefined, now)).toBe(false);
  });
  it("read-only expired pilot can review billing but cannot modify core records", () => {
    const org = new Types.ObjectId(),
      auth = {
        userId: new Types.ObjectId(),
        isPlatformAdmin: true,
        memberships: [],
        readOnlyOrganizationIds: [org],
      };
    expect(() =>
      AuthorizationService.assertCan(auth, "maintenance.close", {
        organizationId: org,
      }),
    ).toThrow();
    expect(() =>
      AuthorizationService.assertCan(auth, "billing.subscription.manage", {
        organizationId: org,
      }),
    ).not.toThrow();
    expect(() =>
      AuthorizationService.assertCan(auth, "maintenance.view", {
        organizationId: org,
      }),
    ).not.toThrow();
  });
  it("rejects malformed, partial tenancy, overprecision, duplicate and conflicting hierarchy rows", () => {
    expect(validateImportRows([row]).errors).toEqual([]);
    for (const changed of [
      { monthlyRentMinor: 1.1 },
      { tenantPhone: "+254711234567" },
      { tenantPhone: "invalid" },
      { openingBalanceMinor: 100 },
      { floorLevel: 900 },
    ])
      expect(
        validateImportRows([{ ...row, ...changed }]).errors.length,
      ).toBeGreaterThan(0);
    expect(validateImportRows([row, row]).errors[0].message).toContain(
      "Duplicate unit",
    );
    expect(
      validateImportRows([
        row,
        { ...row, unitCode: "A02", propertyName: "Wrong property" },
      ]).errors.some((e) => e.message.includes("Inconsistent")),
    ).toBe(true);
  });
});

describe("operational provider suppression", () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(["SALES_DEMO", "PLATFORM_BI_V1"])(
    "blocks a demo dataset before external delivery (%s)",
    async (dataset) => {
      const { Organization } =
        await import("../../src/database/models/Organization.js");
      const { assertOperationalIntegrationAllowed } =
        await import("../../src/modules/sales/pilot-safety.js");
      vi.spyOn(Organization, "findById").mockReturnValue({
        select: () => ({
          lean: async () => ({ settings: { platformDemoDataset: dataset } }),
        }),
      } as never);
      await expect(
        assertOperationalIntegrationAllowed(new Types.ObjectId()),
      ).rejects.toMatchObject({ code: "DEMO_INTEGRATION_BLOCKED" });
    },
  );
  it("keeps pilot operational delivery blocked until paid activation", async () => {
    const { Organization } =
      await import("../../src/database/models/Organization.js");
    const { assertOperationalIntegrationAllowed } =
      await import("../../src/modules/sales/pilot-safety.js");
    const org = { guidedPilot: {}, onboarding: { state: "INVOICE_ISSUED" } };
    vi.spyOn(Organization, "findById").mockReturnValue({
      select: () => ({ lean: async () => org }),
    } as never);
    await expect(
      assertOperationalIntegrationAllowed(new Types.ObjectId()),
    ).rejects.toMatchObject({ code: "PILOT_INTEGRATION_BLOCKED" });
    org.onboarding.state = "ACTIVE";
    await expect(
      assertOperationalIntegrationAllowed(new Types.ObjectId()),
    ).resolves.toBeUndefined();
  });
  it("personalizes commercial occupiers and executive apartment economics", () => {
    const commercial = buildDemo({
      ...profile,
      template: "CONTROL_40",
      use: "COMMERCIAL",
    });
    expect(commercial.units[0].tenant).toContain("Studio");
    expect(commercial.units[0].property).toContain("Business Centre");
    const executive = buildDemo({
      ...profile,
      template: "EXECUTIVE",
      executiveApartments: true,
    });
    expect(executive.units[0].monthlyRentMinor).toBe(8500000);
    expect(executive.units[0].property).toContain("Suites");
  });
});

describe("required sales uniqueness indexes", () => {
  it("fails closed when production uniqueness indexes are absent or incorrect", async () => {
    const { env } = await import("../../src/config/env.js");
    const mode = env.NODE_ENV;
    env.NODE_ENV = "production";
    try {
      const { assertSalesIndexes } =
        await import("../../src/modules/sales/sales-indexes.js");
      const { SalesValueEvent } =
        await import("../../src/database/models/SalesDemoSession.js");
      const { Organization } =
        await import("../../src/database/models/Organization.js");
      const events = vi
        .spyOn(SalesValueEvent.collection, "indexes")
        .mockResolvedValue([]);
      const organizations = vi
        .spyOn(Organization.collection, "indexes")
        .mockResolvedValue([
          {name:"guided_pilot_lead_unique",key:{"guidedPilot.leadId":1},unique:true},
          {
            name: "guided_pilot_demo_unique",
            key: { "guidedPilot.demoSessionId": 1 },
            unique: true,
          },
        ]);
      await expect(assertSalesIndexes()).rejects.toMatchObject({
        code: "SALES_INDEXES_REQUIRED",
      });
      events.mockResolvedValue([
        {
          name: "sales_demo_command_unique",
          key: { sessionId: 1, commandId: 1 },
          unique: true,
        },
      ]);
      await expect(assertSalesIndexes()).resolves.toBeUndefined();
      organizations.mockResolvedValue([
        { name: "guided_pilot_demo_unique", key: { other: 1 }, unique: true },
      ]);
      await expect(assertSalesIndexes()).rejects.toMatchObject({
        code: "SALES_INDEXES_REQUIRED",
      });
    } finally {
      env.NODE_ENV = mode;
      vi.restoreAllMocks();
    }
  });
});
