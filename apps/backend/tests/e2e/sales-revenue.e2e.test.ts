import { randomUUID } from "node:crypto";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { User } from "../../src/database/models/User.js";
import { Organization } from "../../src/database/models/Organization.js";
import { OrganizationSubscription } from "../../src/database/models/OrganizationSubscription.js";
import { OrganizationContract } from "../../src/database/models/OrganizationContract.js";
import { SubscriptionInvoice } from "../../src/database/models/SubscriptionInvoice.js";
import { BillingEvent } from "../../src/database/models/BillingEvent.js";
import { SalesRevenueTarget } from "../../src/database/models/SalesRevenueTarget.js";
import { SalesAttribution } from "../../src/database/models/SalesCampaign.js";
import { PlatformSwitch } from "../../src/database/models/PlatformSwitch.js";
import { AuditLog } from "../../src/database/models/AuditLog.js";
import { AuditService } from "../../src/modules/audit/audit.service.js";
import { SalesRevenueService as service } from "../../src/modules/sales/sales-revenue.service.js";
import { SalesRevenueRepository as repository } from "../../src/modules/sales/sales-revenue.repository.js";
import type { AuthenticatedUser } from "../../src/core/types/auth.js";
import { completedAdminFixture } from "../helpers/admin-assurance.js";
import { DEMO_DATASET } from "../../src/modules/platform-control/platform-business.schemas.js";
const now = new Date("2026-11-15T12:00:00Z"),
  from = new Date("2026-10-31T21:00:00Z"),
  to = new Date("2026-11-30T21:00:00Z");
const policy = {
  name: "Measured collections",
  metric: "COLLECTED_CASH",
  currency: "KES",
  period: "MONTHLY",
  periodStart: "2026-11-01",
  baselineMinor: "5000000",
  scope: "DEPARTMENT",
  pipelineCoverageBps: 30000,
};
const reason = "Administrator reviewed the documented commercial assumptions";
describe.skipIf(!process.env.RUN_E2E)(
  "Revenue evidence, target governance and HTTP isolation",
  () => {
    let mongo: MongoMemoryReplSet, admin: AuthenticatedUser, token: string;
    const app = createApp(),
      base = "/api/v1/sales/success/revenue";
    beforeAll(async () => {
      mongo = await MongoMemoryReplSet.create({
        replSet: { count: 1 },
        binary: process.env.MONGOMS_SYSTEM_BINARY
          ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY }
          : {},
      });
      await mongoose.connect(mongo.getUri());
      for (const model of [
        User,
        Organization,
        OrganizationSubscription,
        OrganizationContract,
        SubscriptionInvoice,
        BillingEvent,
        SalesRevenueTarget,
        SalesAttribution,
        PlatformSwitch,
        AuditLog,
      ])
        await model.init();
    }, 180000);
    afterAll(async () => {
      await mongoose.disconnect();
      await mongo?.stop();
    });
    beforeEach(async () => {
      for (const collection of Object.values(mongoose.connection.collections))
        await collection.deleteMany({});
      const user = await User.create({
        phone: "+254700009102",
        email: "revenue-admin@example.test",
        firstName: "Revenue",
        lastName: "Admin",
        isPlatformAdmin: true,
      });
      token = await completedAdminFixture(user._id);
      admin = {
        userId: user._id,
        isPlatformAdmin: true,
        sessionId: new Types.ObjectId(),
        adminDualChannel: true,
        mfaVerifiedAt: new Date(),
        memberships: [],
      };
      await PlatformSwitch.create({
        key: "SALES_ANALYTICS",
        kind: "FEATURE",
        name: "Revenue analytics",
        description: "Controlled test only",
        enabled: true,
        mode: "ON",
      });
    });
    // Raw fixtures deliberately exercise legacy/malformed persisted records without changing production writers.
    async function receipt(
      options: {
        currency?: string;
        paid?: boolean;
        signed?: boolean;
        demo?: boolean;
        minor?: number | null;
        monthly?: number | string;
        organizationId?: Types.ObjectId;
        subscriptionId?: Types.ObjectId;
        proofOrg?: Types.ObjectId;
        paidAt?: Date;
      } = {},
    ) {
      const organizationId = options.organizationId ?? new Types.ObjectId(),
        subscriptionId = options.subscriptionId ?? new Types.ObjectId(),
        contractId = new Types.ObjectId(),
        invoiceId = new Types.ObjectId();
      const currency = options.currency ?? "KES",
        amount = options.minor ?? 3000000,
        reference = randomUUID();
      if (!options.organizationId) {
        await Organization.collection.insertOne({
          _id: organizationId,
          name: "Test owner",
          slug: randomUUID(),
          status: "ACTIVE",
          settings: options.demo ? { platformDemoDataset: DEMO_DATASET } : {},
          onboarding: { state: "ACTIVE" },
        });
        await OrganizationSubscription.collection.insertOne({
          _id: subscriptionId,
          organizationId,
          planId: new Types.ObjectId(),
          status: "ACTIVE",
          currentPeriodEnd: new Date("2099-01-01"),
          metadata: {
            commercialSnapshot: {
              monthlyMinor: options.monthly ?? 1000000,
              currency,
            },
          },
        });
      }
      const generation =
        (await OrganizationContract.countDocuments({ organizationId })) + 1;
      await OrganizationContract.collection.insertOne({
        _id: contractId,
        organizationId,
        generation,
        status: options.signed === false ? "DRAFT" : "SIGNED",
      });
      await SubscriptionInvoice.collection.insertOne({
        _id: invoiceId,
        organizationId,
        subscriptionId,
        contractId,
        invoiceNumber: reference,
        provider: "PAYSTACK",
        providerInvoiceId: reference,
        currency,
        status: "PAID",
        total: amount / 100,
        amountPaid: amount / 100,
        ...(options.minor === null ? {} : { totalMinor: amount }),
        paidAt: options.paidAt ?? new Date("2026-11-05T10:00:00Z"),
      });
      if (options.paid !== false)
        await BillingEvent.collection.insertOne({
          eventId: reference,
          provider: "PAYSTACK",
          externalReference: reference,
          organizationId: options.proofOrg ?? organizationId,
          type: "INVOICE_PAID",
          status: "PROCESSED",
        });
      return { organizationId, subscriptionId, invoiceId };
    }
    it("counts two receipts as cash but the same current subscription only once", async () => {
      const first = await receipt();
      await receipt(first);
      const result = await repository.financials(from, to, "KES", now);
      expect(result.cash).toEqual({ amountMinor: "6000000", count: 2 });
      expect(result.currentMRR).toEqual({ amountMinor: "1000000", count: 1 });
      expect(result.dailyCash).toEqual([
        { day: "2026-11-05", amountMinor: "6000000", count: 2 },
      ]);
      expect(result.campaigns).toEqual([
        { campaignId: null, amountMinor: "6000000", count: 2 },
      ]);
    });
    it("excludes unverified, unsigned, cross-org proof, demo, unsafe and legacy amounts; separates currencies", async () => {
      await receipt({ paid: false });
      await receipt({ signed: false });
      await receipt({ proofOrg: new Types.ObjectId() });
      await receipt({ demo: true });
      await receipt({ minor: null });
      await receipt({ minor: 12.5 });
      await receipt({ minor: Number.MAX_SAFE_INTEGER + 1 });
      await receipt({ currency: "USD" });
      await receipt({ paidAt: new Date("2099-01-01") });
      expect((await repository.financials(from, to, "KES", now)).cash).toEqual({
        amountMinor: "0",
        count: 0,
      });
      expect(
        (await repository.financials(from, to, "USD", now)).cash.amountMinor,
      ).toBe("3000000");
    });
    it("does not substitute catalog prices or coerce malformed recurring snapshots", async () => {
      await receipt({ monthly: "invalid" });
      await receipt({ monthly: 1.5 });
      const r = await repository.financials(from, to, "KES", now);
      expect(r.cash.count).toBe(2);
      expect(r.currentMRR.count).toBe(0);
    });
    it("attributes only the registration cohort without multiplying company revenue", async () => {
      const first = await receipt(),
        campaign = new Types.ObjectId();
      await receipt();
      await SalesAttribution.collection.insertOne({
        organizationId: first.organizationId,
        milestone: "REGISTERED",
        status: "ATTRIBUTED",
        referralCampaignId: campaign,
      });
      const selected = await repository.financials(
        from,
        to,
        "KES",
        now,
        String(campaign),
      );
      expect(selected.cash.count).toBe(1);
      expect(selected.currentMRR.count).toBe(1);
      expect(
        (await repository.financials(from, to, "KES", now)).cash.count,
      ).toBe(2);
    });
    it("handles idempotent concurrent creation, changed commands, revisions and audit snapshots", async () => {
      const input = { commandId: randomUUID(), policy, reason };
      const [one, two] = await Promise.all([
        service.create(admin, input),
        service.create(admin, input),
      ]);
      expect(one.id).toBe(two.id);
      expect(await SalesRevenueTarget.countDocuments()).toBe(1);
      await expect(
        service.create(admin, { ...input, reason: reason + " changed" }),
      ).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
      await service.update(admin, one.id, {
        revision: 0,
        policy: { ...policy, baselineMinor: "6000000" },
        reason,
      });
      await expect(
        service.update(admin, one.id, { revision: 0, policy, reason }),
      ).rejects.toMatchObject({ code: "TARGET_CHANGED" });
      const audit = await AuditLog.findOne({
        action: "sales.revenue.target.updated",
      }).lean();
      expect(audit?.metadata).toMatchObject({
        before: { baselineMinor: "5000000" },
        after: { baselineMinor: "6000000" },
        revision: 1,
      });
      expect(await service.create(admin, input)).toEqual(one);
    });
    it("returns unavailable rather than invented historical/attributed actuals", async () => {
      for (const changes of [
        { metric: "NEW_MRR" },
        { metric: "RECOGNIZED_REVENUE" },
        { scope: "TEAM", scopeId: "growth" },
        { scope: "AGENT", scopeId: "CRM_INTELLIGENCE" },
        { metric: "CURRENT_MRR", periodStart: "2020-01-01" },
        { periodStart: "2099-01-01" },
      ]) {
        const target = await service.create(admin, {
          commandId: randomUUID(),
          policy: { ...policy, ...changes },
          reason,
        });
        const detail = await service.view(admin, target.id);
        expect(detail.actualMinor).toBeNull();
        expect(detail.unavailableReason).toBeTruthy();
        expect(detail.levels.every((l) => l.attainmentPercent === null)).toBe(
          true,
        );
      }
    });
    it("evaluates historical cash against its own period and currency and annualizes only current MRR", async () => {
      await receipt({ paidAt: new Date("2020-01-15T10:00:00Z") });
      await receipt({
        currency: "USD",
        paidAt: new Date("2020-01-15T10:00:00Z"),
      });
      const target = await service.create(admin, {
        commandId: randomUUID(),
        policy: { ...policy, periodStart: "2020-01-01" },
        reason,
      });
      const result = await service.view(admin, target.id);
      expect(result.actualMinor).toBe("3000000");
      expect(result.levels[0]?.attainmentPercent).toBe("60.00");
      expect(result.varianceMinor).toBe("-2000000");
      const overview = await service.overview(admin, {
        from: "2020-01-01",
        to: "2020-01-31",
        currency: "KES",
      });
      expect(overview.cash.amountMinor).toBe("3000000");
      expect(overview.currentARR.amountMinor).toBe("12000000");
    });
    it("rolls back a target revision if audit persistence fails", async () => {
      const target = await service.create(admin, {
        commandId: randomUUID(),
        policy,
        reason,
      });
      const audit = vi
        .spyOn(AuditService, "record")
        .mockRejectedValueOnce(new Error("Controlled audit failure"));
      try {
        await expect(
          service.update(admin, target.id, {
            revision: 0,
            policy: { ...policy, baselineMinor: "123" },
            reason,
          }),
        ).rejects.toThrow("Controlled audit failure");
      } finally {
        audit.mockRestore();
      }
      expect(await SalesRevenueTarget.findById(target.id)).toMatchObject({
        revision: 0,
        policy: { baselineMinor: "5000000" },
      });
    });
    it("enforces authentication, platform authority, fresh assurance, feature switch and validation", async () => {
      expect((await request(app).get(base + "/targets")).status).toBe(401);
      const landlord = {
        ...admin,
        isPlatformAdmin: false,
        memberships: [
          {
            organizationId: new Types.ObjectId(),
            role: "LANDLORD",
            permissions: ["sales.leads.read"],
            scope: { allProperties: true, propertyIds: [], buildingIds: [] },
          },
        ],
      };
      await expect(service.list(landlord, {})).rejects.toMatchObject({
        statusCode: 403,
      });
      await expect(
        service.create(
          { ...admin, mfaVerifiedAt: new Date(0) },
          { commandId: randomUUID(), policy, reason },
        ),
      ).rejects.toMatchObject({ code: "FRESH_AUTH_REQUIRED" });
      expect(
        (
          await request(app)
            .post(base + "/targets")
            .auth(token, { type: "bearer" })
            .send({
              commandId: randomUUID(),
              policy: { ...policy, baselineMinor: "0" },
              reason,
            })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .get(base)
            .auth(token, { type: "bearer" })
            .query({ from: "2026-02-01", to: "2026-01-01" })
        ).status,
      ).toBe(400);
      await PlatformSwitch.updateOne(
        { key: "SALES_ANALYTICS" },
        { $set: { enabled: false, mode: "OFF" } },
      );
      expect(
        (
          await request(app)
            .get(base + "/targets")
            .auth(token, { type: "bearer" })
        ).status,
      ).toBe(503);
      await expect(
        service.create(admin, { commandId: randomUUID(), policy, reason }),
      ).rejects.toMatchObject({ code: "SERVICE_DISABLED" });
      expect(await SalesRevenueTarget.countDocuments()).toBe(0);
    });
    it("serves evidence and audited target journeys through real authenticated HTTP", async () => {
      const created = await request(app)
        .post(base + "/targets")
        .auth(token, { type: "bearer" })
        .send({
          commandId: randomUUID(),
          policy: { ...policy, periodStart: "2020-01-01" },
          reason,
        });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const viewed = await request(app)
        .get(base + "/targets/" + created.body.data.id)
        .auth(token, { type: "bearer" });
      expect(viewed.status, JSON.stringify(viewed.body)).toBe(200);
      expect(viewed.body.data.actualMinor).toBe("0");
      expect(viewed.body.data.history).toHaveLength(1);
      const overview = await request(app)
        .get(base)
        .auth(token, { type: "bearer" })
        .query({ from: "2020-01-01", to: "2020-01-31" });
      expect(overview.status, JSON.stringify(overview.body)).toBe(200);
      expect(overview.body.data.currentARR.amountMinor).toBe("0");
      expect(overview.headers["cache-control"]).toBe("no-store");
      expect(overview.body.data.unavailable).toContain("Recognized revenue");
    });
  },
);
