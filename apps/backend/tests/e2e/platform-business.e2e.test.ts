import { completedAdminFixture } from '../helpers/admin-assurance.js';
import { setAdminMfaTestDelivery } from '../../src/modules/auth/admin-mfa.service.js';
import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { User } from "../../src/database/models/User.js";
import { SubscriptionPlan } from "../../src/database/models/SubscriptionPlan.js";
import { OrganizationSubscription } from "../../src/database/models/OrganizationSubscription.js";
import { SubscriptionInvoice } from "../../src/database/models/SubscriptionInvoice.js";
import { Organization } from "../../src/database/models/Organization.js";
import { PlatformBrief } from "../../src/database/models/PlatformBrief.js";
import { BillingEvent } from "../../src/database/models/BillingEvent.js";
import { PlatformMonitorAlert } from "../../src/database/models/PlatformMonitoring.js";
import { monitoringEnvironment } from "../../src/core/observability/platform-telemetry.js";
import { Job } from "../../src/database/models/Job.js";
import { AuditLog } from "../../src/database/models/AuditLog.js";
import { seedPlatformBusinessDemo } from "../../src/modules/platform-control/platform-business.demo.js";
import { PlatformBusinessService } from "../../src/modules/platform-control/platform-business.service.js";
import { AuditService } from "../../src/modules/audit/audit.service.js";
import { DEMO_DATASET } from "../../src/modules/platform-control/platform-business.schemas.js";
import type { BusinessOverview } from "../../src/modules/platform-control/platform-business.types.js";
import type { AuthenticatedUser } from "../../src/core/types/auth.js";

function required<T>(value: T | null | undefined): T {
  expect(value).toBeDefined();
  if (value == null) throw new Error("Required fixture missing");
  return value;
}

describe.skipIf(!process.env.RUN_E2E)(
  "SUPER_ADMIN platform business Mongo / HTTP E2E",
  () => {
    let mongo: MongoMemoryReplSet,
      token: string,
      auth: AuthenticatedUser,
      passwordHash: string;
    const app = createApp(),
      base = "/api/v1/platform-control",
      selection = { dataset: "DEMO", period: "LAST_30_DAYS" };
    async function overview(
      extra: Record<string, string> = {},
    ): Promise<BusinessOverview> {
      const response = await request(app)
        .get(base + "/business-intelligence")
        .query({ ...selection, ...extra })
        .auth(token, { type: "bearer" });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      return response.body.data;
    }
    beforeAll(async () => {
      mongo = await MongoMemoryReplSet.create({
        replSet: { count: 1 },
        binary: process.env.MONGOMS_SYSTEM_BINARY
          ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY }
          : {},
      });
      await mongoose.connect(mongo.getUri("property-platform-bi-test"), {
        autoIndex: false,
      });
      for (const model of Object.values(mongoose.models))
        await model.createCollection();
      for (const name of [
        "Organization",
        "OrganizationSubscription",
        "SubscriptionInvoice",
        "SubscriptionPlan",
        "BillingEvent",
        "Property",
        "Building",
        "Floor",
        "Unit",
        "SecurityCamera",
        "Incident",
        "Evidence",
        "Job",
        "IntegrationAttempt",
        "AuditLog",
        "PlatformBrief",
        "PlatformMonitorAlert",
        "PlatformHeartbeat",
      ])
        await required(mongoose.models[name]).createIndexes();
      passwordHash = await bcrypt.hash("SecurePlatformDemo-2026!", 10);
    }, 180000);
    beforeEach(async () => {
      for (const collection of Object.values(mongoose.connection.collections))
        await collection.deleteMany({});
      const user = await User.create({
        phone: "+254700009110",
        email: "platform-bi-admin@example.test",
        firstName: "Platform",
        lastName: "Test",
        passwordHash,
        isPlatformAdmin: true,
        verifiedAt: new Date(),
      });
      auth = { userId: user._id, isPlatformAdmin: true, memberships: [] };
      token = await completedAdminFixture(user._id);
      for (const key of ["CONTROL", "FORT_KNOX"])
        await SubscriptionPlan.create({
          key,
          name: key === "CONTROL" ? "Control" : "Fort Knox",
          currency: "KES",
          amount: key === "CONTROL" ? 10000 : 30000,
          billingInterval: "MONTH",
          metadata: {
            pricingModel: "BASE_PLUS_ACTIVE_UNITS",
            includedUnits: 50,
            additionalUnitAmount: 200,
          },
        });
      await seedPlatformBusinessDemo(user._id, new Date(Date.now() - 60000));
    });
    afterEach(() => { vi.restoreAllMocks(); setAdminMfaTestDelivery(); });
    afterAll(async () => {
      await mongoose.disconnect();
      await mongo?.stop();
    });
    it("completes SUPER_ADMIN password/OTP login, dashboard, comparison, brief, priority action and organization drill-down", async () => {
      const delivered: Record<string, string> = {};
      setAdminMfaTestDelivery(async (channel, _destination, code) => { delivered[channel] = code; });
      const login = await request(app).post("/api/v1/auth/login").send({
        method: "email",
        email: "platform-bi-admin@example.test",
        password: "SecurePlatformDemo-2026!",
      });
      expect(login.body.data.mfaRequired).toBe(true);
      const selected = await request(app).post('/api/v1/auth/admin-mfa/channel').set('Origin', env.WEB_ORIGIN).set('X-PCC-Auth', '1').send({ flowToken: login.body.data.flowToken, channel: 'EMAIL' });
      expect(selected.status).toBe(200);
      const verified = await request(app)
        .post('/api/v1/auth/admin-mfa/verify').set('Origin', env.WEB_ORIGIN).set('X-PCC-Auth', '1')
        .send({ flowToken: login.body.data.flowToken, channel: 'EMAIL', code: delivered.EMAIL });
      expect(verified.status, JSON.stringify(verified.body)).toBe(200);
      token = verified.body.data.accessToken;
      const data = await overview();
      expect(
        data.plans.find((p) => p.plan === "CONTROL")?.activeOrganizations,
      ).toBe(2);
      expect(
        data.plans.find((p) => p.plan === "FORT_KNOX")?.activeOrganizations,
      ).toBe(2);
      const generated = await request(app)
        .post(base + "/morning-briefs")
        .auth(token, { type: "bearer" })
        .send({ ...selection, idempotencyKey: "journey-brief-01" });
      expect(generated.status, JSON.stringify(generated.body)).toBe(201);
      expect(generated.body.data.snapshot.sections).toHaveLength(5);
      const action = required(
        data.actions.find((a) => a.id === "FORT_KNOX:attention"),
      );
      const params = new URL(action.href, "https://example.test").searchParams;
      const drill = await request(app)
        .get(base + "/business-intelligence/drill-down")
        .query({
          dataset: "DEMO",
          kind: params.get("kind"),
          plan: params.get("plan"),
        })
        .auth(token, { type: "bearer" });
      expect(drill.status).toBe(200);
      expect(drill.body.data.items[0].attentionCode).toBe("PAYMENT_FAILED");
      const org = await request(app)
        .get(base + "/business-intelligence/drill-down")
        .query({
          dataset: "DEMO",
          organizationId: drill.body.data.items[0].organizationId,
        })
        .auth(token, { type: "bearer" });
      expect(org.status).toBe(200);
      expect(org.body.data.total).toBe(1);
      expect(
        await AuditLog.countDocuments({
          action: "platform.business.drilldown",
        }),
      ).toBe(2);
    });
    it("calculates separate Control and Fort Knox MRR/ARR without multiplying by three-month cash", async () => {
      const data = await overview(),
        control = required(data.revenue.find((r) => r.plan === "CONTROL")),
        fort = required(data.revenue.find((r) => r.plan === "FORT_KNOX"));
      expect(control).toMatchObject({
        mrrMinor: 2100000,
        arrMinor: 25200000,
        collectedMinor: 6300000,
      });
      expect(fort).toMatchObject({
        mrrMinor: 6600000,
        arrMinor: 79200000,
        collectedMinor: 19800000,
      });
      expect(control.revenueContribution).toBeCloseTo(21 / 87);
      expect(fort.pricedOrganizations).toBe(2);
    });
    it("filters plans on backend portfolio, billing and drill-down records", async () => {
      const data = await overview({ plan: "CONTROL" });
      expect(data.plans).toHaveLength(1);
      expect(data.plans[0]).toMatchObject({
        plan: "CONTROL",
        organizations: 4,
        units: 102,
        activeUnits: 98,
        properties: 4,
        buildings: 4,
      });
      expect(data.revenue.every((r) => r.plan === "CONTROL")).toBe(true);
      expect(data.fortKnox).toBeNull();
      const drill = await request(app)
        .get(base + "/business-intelligence/drill-down")
        .query({
          ...selection,
          plan: "CONTROL",
          kind: "ORGANIZATIONS",
          pageSize: 2,
        })
        .auth(token, { type: "bearer" });
      expect(drill.body.data.total).toBe(4);
      expect(drill.body.data.items).toHaveLength(2);
      expect(
        drill.body.data.items.every(
          (r: { plan: string }) => r.plan === "CONTROL",
        ),
      ).toBe(true);
    });
    it("separates verified payments, manual paid records, outstanding and overdue invoices", async () => {
      const paid = await SubscriptionInvoice.findOne({
        invoiceNumber: "DEMO-0",
      }).orFail();
      await BillingEvent.deleteOne({
        externalReference: paid.providerInvoiceId,
      });
      const data = await overview();
      expect(data.revenue.find((r) => r.plan === "CONTROL")).toMatchObject({
        collectedMinor: 3000000,
        unverifiedPaidMinor: 3300000,
        outstandingMinor: 6000000,
        overdueMinor: 6000000,
        overdueCount: 2,
      });
      expect(data.actions.some((a) => a.id.includes("unverified"))).toBe(true);
    });
    it("returns the exact verified cash cohort and current outstanding invoice drill-downs", async () => {
      for (const [kind, count] of [
        ["VERIFIED_PAYMENTS", 4],
        ["OUTSTANDING", 4],
        ["OVERDUE", 4],
      ]) {
        const response = await request(app)
          .get(base + "/business-intelligence/drill-down")
          .query({ ...selection, kind })
          .auth(token, { type: "bearer" });
        expect(response.status).toBe(200);
        expect(response.body.data.total).toBe(count);
      }
      const paid = await SubscriptionInvoice.findOne({
        invoiceNumber: "DEMO-0",
      }).orFail();
      await BillingEvent.deleteOne({
        externalReference: paid.providerInvoiceId,
      });
      const invalid = await request(app)
        .get(base + "/business-intelligence/drill-down")
        .query({ ...selection, kind: "UNVERIFIED_PAYMENTS" })
        .auth(token, { type: "bearer" });
      expect(invalid.body.data.total).toBe(1);
      expect(invalid.body.data.items[0].invoiceNumber).toBe("DEMO-0");
    });
    it("keeps live metrics empty despite realistic simulated demo records", async () => {
      const data = await overview({ dataset: "LIVE" });
      expect(data.plans.every((p) => p.organizations === 0)).toBe(true);
      expect(data.revenue).toEqual([]);
      expect(data.fortKnox?.registeredCameras).toBe(0);
      const drill = await request(app)
        .get(base + "/business-intelligence/drill-down")
        .query({ dataset: "LIVE", kind: "ORGANIZATIONS" })
        .auth(token, { type: "bearer" });
      expect(drill.body.data.total).toBe(0);
    });
    it("reports observed Fort Knox cameras, incidents and explicit missing gateway health", async () => {
      const data = await overview({ plan: "FORT_KNOX" });
      expect(data.fortKnox).toMatchObject({
        organizations: 4,
        registeredCameras: 16,
        onlineCameras: 4,
        offlineCameras: 4,
        degradedCameras: 4,
        unknownCameras: 4,
        simulatedCameras: 16,
        recentIncidents: 4,
        unresolvedIncidents: 4,
        gatewayHealth: null,
      });
      expect(JSON.stringify(data)).not.toMatch(
        /streamRef|playbackRef|authorization_code|passwordHash|recipientUserId/,
      );
    });
    it("records applied upgrades, downgrades and cancellation once; pending plans are not movements", async () => {
      const sub = await OrganizationSubscription.findOne({
          status: "ACTIVE",
        }).orFail(),
        control = await SubscriptionPlan.findOne({ key: "CONTROL" }).orFail(),
        fort = await SubscriptionPlan.findOne({ key: "FORT_KNOX" }).orFail();
      sub.pendingPlanId = fort._id;
      await sub.save();
      let data = await overview();
      expect(data.growth.movements.some((r) => r.kind === "UPGRADE")).toBe(
        false,
      );
      sub.planId = fort._id;
      sub.pendingPlanId = undefined;
      await sub.save();
      sub.planId = control._id;
      await sub.save();
      sub.status = "CANCELLED";
      await sub.save();
      await sub.save();
      data = await overview();
      expect(
        data.growth.movements.find((r) => r.kind === "UPGRADE")?.count,
      ).toBe(1);
      expect(
        data.growth.movements.find((r) => r.kind === "DOWNGRADE")?.count,
      ).toBe(1);
      expect(
        data.growth.movements.find((r) => r.kind === "CANCELLED")?.count,
      ).toBe(1);
      expect(data.growth.churnRate).toBeNull();
      sub.businessTransitions = [];
      await expect(sub.save()).rejects.toThrow(
        "SUBSCRIPTION_HISTORY_APPEND_ONLY",
      );
    });
    it("captures query-based state changes atomically and rejects ledger rewrites", async () => {
      const sub = await OrganizationSubscription.findOne({
        status: "PENDING",
      }).orFail();
      const before = sub.businessTransitions.length;
      await OrganizationSubscription.findOneAndUpdate(
        { _id: sub._id },
        { $set: { status: "ACTIVE", updatedBy: auth.userId } },
      );
      await OrganizationSubscription.updateOne(
        { _id: sub._id },
        { $set: { status: "CANCELLED", updatedBy: auth.userId } },
      );
      const retained = await OrganizationSubscription.findById(
        sub._id,
      ).orFail();
      expect(
        retained.businessTransitions.slice(before).map((r) => r.kind),
      ).toEqual(["ACTIVATED", "CANCELLED"]);
      await expect(
        OrganizationSubscription.updateOne(
          { _id: sub._id },
          { $set: { businessTransitions: [] } },
        ),
      ).rejects.toThrow("SUBSCRIPTION_HISTORY_APPEND_ONLY");
      await expect(
        OrganizationSubscription.updateOne(
          { _id: sub._id },
          { $unset: { "businessTransitions.0": 1 } },
        ),
      ).rejects.toThrow("SUBSCRIPTION_HISTORY_APPEND_ONLY");
    });
    it("normalizes quarterly and annual charges from historical snapshots and excludes expired subscriptions", async () => {
      const subs = await OrganizationSubscription.find({
        status: "ACTIVE",
      }).sort({ createdAt: 1 });
      const control = subs.find(
        (s) => s.metadata.commercialSnapshot.planKey === "CONTROL",
      );
      expect(control).toBeDefined();
      if (!control) throw new Error("Control fixture missing");
      const monthly = control.metadata.commercialSnapshot.monthlyMinor;
      control.metadata.commercialSnapshot.recurringMinor = monthly * 3;
      control.metadata.commercialSnapshot.billingInterval = "QUARTER";
      control.markModified("metadata");
      await control.save();
      await SubscriptionPlan.updateMany({}, { $set: { amount: 999999 } });
      let data = await overview();
      expect(data.revenue.reduce((s, r) => s + r.mrrMinor, 0)).toBe(8700000);
      control.metadata.commercialSnapshot.recurringMinor = monthly * 12;
      control.metadata.commercialSnapshot.billingInterval = "YEAR";
      control.markModified("metadata");
      await control.save();
      data = await overview();
      expect(data.revenue.reduce((s, r) => s + r.arrMinor, 0)).toBe(104400000);
      control.currentPeriodEnd = new Date(Date.now() - 1000);
      await control.save();
      data = await overview();
      expect(data.plans.reduce((s, p) => s + p.activeOrganizations, 0)).toBe(3);
      expect(data.revenue.reduce((s, r) => s + r.mrrMinor, 0)).toBe(
        8700000 - monthly,
      );
    });
    it("makes historical snapshots immutable, reproducible and idempotent across source changes", async () => {
      const first = await PlatformBusinessService.generateBrief(auth, {
        ...selection,
        idempotencyKey: "immutable-brief-01",
      });
      const second = await PlatformBusinessService.generateBrief(auth, {
        ...selection,
        idempotencyKey: "immutable-brief-01",
      });
      if (!first || !second) throw new Error("Brief fixture was not persisted");
      expect(String(first._id)).toBe(String(second._id));
      await Organization.updateOne(
        { slug: "platform-bi-demo-0" },
        { $set: { status: "SUSPENDED" } },
      );
      const retained = await PlatformBusinessService.brief(
        auth,
        String(first._id),
        { dataset: "DEMO" },
      );
      expect(retained.sha256).toBe(first.sha256);
      expect(
        retained.snapshot.plans.find(
          (p: { plan: string }) => p.plan === "CONTROL",
        ).activeOrganizations,
      ).toBe(2);
      await expect(
        PlatformBrief.updateOne({ _id: first._id }, { $set: { snapshot: {} } }),
      ).rejects.toThrow("PLATFORM_BRIEF_IMMUTABLE");
      await expect(
        PlatformBusinessService.generateBrief(auth, {
          ...selection,
          plan: "CONTROL",
          idempotencyKey: "immutable-brief-01",
        }),
      ).rejects.toMatchObject({ code: "BRIEF_IDEMPOTENCY_CONFLICT" });
    });
    it("rolls back brief persistence if audit fails", async () => {
      vi.spyOn(AuditService, "record").mockRejectedValueOnce(
        new Error("audit failure"),
      );
      await expect(
        PlatformBusinessService.generateBrief(auth, {
          ...selection,
          idempotencyKey: "rollback-brief-01",
        }),
      ).rejects.toThrow("audit failure");
      expect(await PlatformBrief.countDocuments({})).toBe(0);
    });
    it("reports missing price coverage without using today's catalog price", async () => {
      const sub = await OrganizationSubscription.findOne({
        status: "ACTIVE",
      }).orFail();
      sub.metadata = {};
      await sub.save();
      const data = await overview();
      expect(
        data.plans.reduce((s, p) => s + p.subscriptionsMissingPrice, 0),
      ).toBe(1);
      expect(data.revenue.reduce((s, p) => s + p.mrrMinor, 0)).toBe(7600000);
    });
    it("uses period flows and current stocks independently, including activation timestamps", async () => {
      const data = await overview({ period: "TODAY" });
      expect(data.plans.reduce((s, p) => s + p.activeOrganizations, 0)).toBe(4);
      expect(data.revenue.reduce((s, p) => s + p.collectedMinor, 0)).toBe(0);
      expect(data.plans.reduce((s, p) => s + p.activations, 0)).toBe(0);
      expect(data.plans.reduce((s, p) => s + p.awaitingSignature, 0)).toBe(1);
      expect(data.plans.reduce((s, p) => s + p.awaitingPayment, 0)).toBe(1);
      expect(data.plans.reduce((s, p) => s + p.stuckOnboarding, 0)).toBe(2);
    });
    it("degrades a failed source explicitly and preserves other authoritative data", async () => {
      vi.spyOn(SubscriptionInvoice, "aggregate").mockImplementationOnce(
        () =>
          ({
            option: () => ({
              exec: async () => {
                throw new Error("unavailable");
              },
            }),
          }) as never,
      );
      const data = await overview();
      expect(data.unavailableSources).toContain(
        "invoices/verified-payment-events",
      );
      expect(
        data.plans.find((p) => p.plan === "CONTROL")?.activeOrganizations,
      ).toBe(2);
      expect(data.actions.some((a) => a.category === "Data integrity")).toBe(
        true,
      );
    });
    it("surfaces failed payment events with safe transaction drill-downs", async () => {
      const data = await overview();
      expect(
        data.operations.find((m) => m.key === "failedPayments")?.value,
      ).toBe(1);
      expect(
        data.actions.some(
          (a) => a.id === "ops:failedPayments" && a.category === "Billing",
        ),
      ).toBe(true);
      const response = await request(app)
        .get(base + "/business-intelligence/drill-down")
        .query({ ...selection, kind: "BILLING_EVENTS" })
        .auth(token, { type: "bearer" });
      expect(response.body.data.total).toBe(1);
      expect(response.body.data.items[0].kind).toBe("PAYMENT_FAILED");
      expect(response.body.data.items[0].payload).toBeUndefined();
    });
    it("counts unassigned global backlog and billing failures only in live all-plan scope", async () => {
      await Job.create({
        type: "test-fixture-not-executed",
        payload: {},
        status: "QUEUED",
        availableAt: new Date(Date.now() - 86400000),
      });
      await BillingEvent.create({
        eventId: "global-failure-fixture",
        provider: "INTERNAL",
        type: "PAYMENT_FAILED",
        status: "FAILED",
        externalReference: "test-global-failure",
      });
      const live = await overview({ dataset: "LIVE" });
      expect(live.operations.find((m) => m.key === "queueBacklog")?.value).toBe(
        1,
      );
      expect(
        live.operations.find((m) => m.key === "failedBillingEvents")?.value,
      ).toBe(1);
      const drill = await request(app)
        .get(base + "/business-intelligence/drill-down")
        .query({ dataset: "LIVE", kind: "BILLING_EVENTS" })
        .auth(token, { type: "bearer" });
      expect(drill.body.data.total).toBe(1);
      expect(drill.body.data.items[0].payload).toBeUndefined();
      expect(
        (await overview()).operations.find((m) => m.key === "queueBacklog")
          ?.value,
      ).toBe(0);
      expect(
        (await overview({ dataset: "LIVE", plan: "CONTROL" })).operations.find(
          (m) => m.key === "queueBacklog",
        )?.value,
      ).toBe(0);
    });
    it("keeps recorded platform-global security/operational alerts out of tier and simulated scopes", async () => {
      await PlatformMonitorAlert.create({
        environment: monitoringEnvironment(),
        fingerprint: "global-fixture-alert",
        area: "system",
        scope: "PLATFORM",
        code: "DATABASE_DEGRADED",
        title: "Recorded platform degradation",
        severity: "CRITICAL",
        firstAt: new Date(),
        lastAt: new Date(),
        observedValue: 1,
      });
      const live = await overview({ dataset: "LIVE" });
      expect(
        live.actions.some(
          (a) =>
            a.title === "Recorded platform degradation" &&
            a.severity === "CRITICAL",
        ),
      ).toBe(true);
      expect(
        (await overview({ dataset: "LIVE", plan: "CONTROL" })).actions.some(
          (a) => a.title === "Recorded platform degradation",
        ),
      ).toBe(false);
      expect(
        (await overview()).actions.some(
          (a) => a.title === "Recorded platform degradation",
        ),
      ).toBe(false);
    });
    it("prevents non-admin analytics and keeps the existing organization boundary", async () => {
      const organization = await Organization.findOne({
        slug: "platform-bi-demo-0",
      }).orFail();
      const outsider = await User.create({
        phone: "+254700009120",
        firstName: "Outside",
        lastName: "Tenant",
      });
      const tenantToken = jwt.sign(
        { sub: String(outsider._id), type: "access" },
        env.JWT_ACCESS_SECRET,
      );
      expect(
        (
          await request(app)
            .get(base + "/business-intelligence")
            .auth(tenantToken, { type: "bearer" })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .get(
              `/api/v1/organizations/${organization._id}/landlord-onboarding`,
            )
            .auth(tenantToken, { type: "bearer" })
        ).status,
      ).toBe(403);
    });
    it("does not expose a demo organization through a live dataset drill-down", async () => {
      const org = await Organization.findOne({
        "settings.platformDemoDataset": DEMO_DATASET,
      }).orFail();
      const response = await request(app)
        .get(base + "/business-intelligence/drill-down")
        .query({ dataset: "LIVE", organizationId: String(org._id) })
        .auth(token, { type: "bearer" });
      expect(response.body.data.total).toBe(0);
    });
  },
);
