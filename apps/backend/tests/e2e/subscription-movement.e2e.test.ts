import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { randomUUID } from "node:crypto";
import { SubscriptionMovement } from "../../src/database/models/SubscriptionMovement.js";
import { SubscriptionInvoice } from "../../src/database/models/SubscriptionInvoice.js";
import { OrganizationSubscription } from "../../src/database/models/OrganizationSubscription.js";
import { OrganizationContract } from "../../src/database/models/OrganizationContract.js";
import { Organization } from "../../src/database/models/Organization.js";
import { BillingEvent } from "../../src/database/models/BillingEvent.js";
import { AuditLog } from "../../src/database/models/AuditLog.js";
import { AuditService } from "../../src/modules/audit/audit.service.js";
import {
  recordPaidMovement,
  endSubscription,
} from "../../src/modules/billing/subscription-movement.service.js";
import { RevenueHistoryRepository } from "../../src/modules/sales/revenue-history.repository.js";
import { deriveRevenueHistory } from "../../src/modules/sales/revenue-history.calculations.js";

describe.skipIf(!process.env.RUN_E2E)(
  "Subscription movement transactional evidence",
  () => {
    let mongo: MongoMemoryReplSet,
      org: Types.ObjectId,
      sub: Types.ObjectId,
      contract: Types.ObjectId;
    const actor = new Types.ObjectId();
    beforeAll(async () => {
      mongo = await MongoMemoryReplSet.create({
        replSet: { count: 1 },
        binary: process.env.MONGOMS_SYSTEM_BINARY
          ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY }
          : {},
      });
      await mongoose.connect(mongo.getUri());
      for (const model of [
        SubscriptionMovement,
        SubscriptionInvoice,
        OrganizationSubscription,
        OrganizationContract,
        Organization,
        BillingEvent,
        AuditLog,
      ])
        await model.init();
    }, 180000);
    afterAll(async () => {
      await mongoose.disconnect();
      await mongo.stop();
    });
    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });
    beforeEach(async () => {
      for (const collection of Object.values(mongoose.connection.collections))
        await collection.deleteMany({});
      vi.setSystemTime(new Date("2026-07-02T12:00:00Z"));
      org = new Types.ObjectId();
      sub = new Types.ObjectId();
      contract = new Types.ObjectId();
      await Organization.create({
        _id: org,
        name: "Ledger fixture",
        slug: randomUUID(),
        status: "ACTIVE",
      });
      await OrganizationContract.collection.insertOne({
        _id: contract,
        organizationId: org,
        generation: 1,
        status: "SIGNED",
      });
      await OrganizationSubscription.create({
        _id: sub,
        organizationId: org,
        planId: new Types.ObjectId(),
        provider: "PAYSTACK",
        status: "PENDING",
        currentPeriodStart: new Date("2026-01-01"),
        currentPeriodEnd: new Date("2026-02-01"),
        createdBy: actor,
        updatedBy: actor,
      });
    });
    async function payment(
      at: string,
      through: string,
      monthly: number,
      options: {
        activation?: boolean;
        proof?: boolean;
        foreign?: boolean;
        reference?: string;
      } = {},
    ) {
      const session = await mongoose.startSession(),
        id = new Types.ObjectId(),
        reference = options.reference ?? randomUUID();
      try {
        await session.withTransaction(async () => {
          const subscription = await OrganizationSubscription.findById(sub)
            .session(session)
            .orFail();
          const [invoice] = await SubscriptionInvoice.create(
            [
              {
                _id: id,
                organizationId: org,
                subscriptionId: sub,
                invoiceNumber: reference,
                periodStart: new Date(at),
                periodEnd: new Date(through),
                subtotal: monthly / 100,
                total: monthly / 100,
                totalMinor: monthly,
                amountPaid: monthly / 100,
                currency: "KES",
                status: "PAID",
                paidAt: new Date(at),
                dueDate: new Date(at),
                provider: "PAYSTACK",
                providerInvoiceId: reference,
                ...(options.activation
                  ? { contractId: contract }
                  : { originContractId: contract }),
                commercialSnapshot: { monthlyMinor: monthly, currency: "KES" },
                createdBy: actor,
                updatedBy: actor,
              },
            ],
            { session },
          );
          if (!invoice) throw new Error("Invoice required");
          if (options.proof !== false)
            await BillingEvent.create(
              [
                {
                  organizationId: options.foreign ? new Types.ObjectId() : org,
                  eventId: reference,
                  provider: "PAYSTACK",
                  externalReference: reference,
                  type: "INVOICE_PAID",
                  status: "PROCESSED",
                },
              ],
              { session },
            );
          subscription.status = "ACTIVE";
          subscription.currentPeriodStart = new Date(at);
          subscription.currentPeriodEnd = new Date(through);
          subscription.set("metadata", {
            commercialSnapshot: { monthlyMinor: monthly, currency: "KES" },
          });
          await subscription.save({ session });
          await recordPaidMovement(
            invoice._id,
            subscription.currentPeriodStart,
            subscription.currentPeriodEnd,
            session,
          );
        });
      } finally {
        await session.endSession();
      }
      return id;
    }
    it("records activation, renewal, expansion, contraction, expiry and reactivation without duplicating payment replay", async () => {
      const id = await payment("2026-01-01", "2026-02-01", 10000, {
        activation: true,
      });
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await recordPaidMovement(
            id,
            new Date("2026-01-01"),
            new Date("2026-02-01"),
            session,
          );
        });
      } finally {
        await session.endSession();
      }
      await payment("2026-02-01", "2026-03-01", 10000);
      await payment("2026-03-01", "2026-04-01", 15000);
      await payment("2026-04-01", "2026-05-01", 12000);
      await payment("2026-06-01", "2026-07-01", 13000);
      const entries = await SubscriptionMovement.find().sort({ sequence: 1 });
      expect(entries.map((e) => e.kind)).toEqual([
        "ACTIVATION",
        "RENEWAL",
        "EXPANSION",
        "CONTRACTION",
        "EXPIRATION",
        "REACTIVATION",
      ]);
      expect(entries.map((e) => e.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(entries[4]?.effectiveAt).toEqual(new Date("2026-05-01"));
      const loaded = await RevenueHistoryRepository.load("KES", new Date());
      const history = deriveRevenueHistory(
        loaded.events,
        loaded.gaps,
        "2026-01",
        "2026-06",
        "KES",
        new Date(),
      );
      expect(
        history.bridges.every((b) => b.complete),
        JSON.stringify({
          bridges: history.bridges,
          gaps: loaded.gaps,
          events: loaded.events,
        }),
      ).toBe(true);
      expect(history.bridges[4]?.churnedMinor).toBe("12000");
      expect(history.bridges[5]?.reactivationMinor).toBe("13000");
    });
    it("serializes concurrent expiry, preserves source drill-down, and blocks invoice/history mutation", async () => {
      await payment("2026-01-01", "2026-02-01", 10000, { activation: true });
      const command = {
        subscriptionId: sub,
        kind: "EXPIRATION" as const,
        sourceKind: "PAID_TERM_BOUNDARY" as const,
        reference: "due-boundary",
        at: new Date("2026-02-01"),
        expectedPeriodEnd: new Date("2026-02-01"),
      };
      await Promise.all([endSubscription(command), endSubscription(command)]);
      expect(await SubscriptionMovement.countDocuments()).toBe(2);
      const event = await SubscriptionMovement.findOne({
        kind: "ACTIVATION",
      }).orFail();
      const detail = await RevenueHistoryRepository.source(String(event._id));
      expect(detail?.invoice?.totalMinor).toBe(10000);
      expect(detail?.proof?.status).toBe("PROCESSED");
      expect(JSON.stringify(detail)).not.toContain("authorization_code");
      event.newMinor = "999";
      await expect(event.save()).rejects.toThrow(
        "SUBSCRIPTION_MOVEMENT_IMMUTABLE",
      );
      await expect(
        SubscriptionMovement.updateOne({ _id: event._id }, { newMinor: "999" }),
      ).rejects.toThrow("SUBSCRIPTION_MOVEMENT_IMMUTABLE");
      await expect(SubscriptionMovement.deleteMany({})).rejects.toThrow(
        "SUBSCRIPTION_MOVEMENT_IMMUTABLE",
      );
      await expect(
        SubscriptionMovement.bulkWrite([
          { deleteOne: { filter: { _id: event._id } } },
        ]),
      ).rejects.toThrow("SUBSCRIPTION_MOVEMENT_IMMUTABLE");
    });
    it.each([{ proof: false }, { foreign: true }])(
      "rejects absent/cross-organization provider proof and rolls back all writes: %j",
      async (options) => {
        await expect(
          payment("2026-01-01", "2026-02-01", 10000, {
            activation: true,
            ...options,
          }),
        ).rejects.toMatchObject({ code: "MOVEMENT_PAYMENT_EVIDENCE_REQUIRED" });
        expect(await SubscriptionInvoice.countDocuments()).toBe(0);
        expect(await SubscriptionMovement.countDocuments()).toBe(0);
        expect((await OrganizationSubscription.findById(sub))?.status).toBe(
          "PENDING",
        );
      },
    );
    it("rolls back invoice, provider proof, access and movement if audit fails", async () => {
      vi.spyOn(AuditService, "record").mockRejectedValue(
        new Error("audit unavailable"),
      );
      await expect(
        payment("2026-01-01", "2026-02-01", 10000, { activation: true }),
      ).rejects.toThrow("audit unavailable");
      expect(await SubscriptionInvoice.countDocuments()).toBe(0);
      expect(await BillingEvent.countDocuments()).toBe(0);
      expect(await SubscriptionMovement.countDocuments()).toBe(0);
      expect((await OrganizationSubscription.findById(sub))?.status).toBe(
        "PENDING",
      );
    });
    it("records cancellation with evidence and does not end a later paid term from a stale expiry job", async () => {
      await payment("2026-01-01", "2026-04-01", 10000, { activation: true });
      await endSubscription({
        subscriptionId: sub,
        kind: "EXPIRATION",
        sourceKind: "PAID_TERM_BOUNDARY",
        reference: "old",
        at: new Date("2026-02-01"),
        expectedPeriodEnd: new Date("2026-02-01"),
      });
      expect(await SubscriptionMovement.countDocuments()).toBe(1);
      await endSubscription({
        subscriptionId: sub,
        kind: "CANCELLATION",
        sourceKind: "AUTHORIZED_CANCELLATION",
        reference: "owner-command",
        at: new Date("2026-02-01"),
        actorUserId: actor,
      });
      expect(
        (await SubscriptionMovement.findOne({ kind: "CANCELLATION" }))
          ?.previousMinor,
      ).toBe("10000");
    });
    it("leaves legacy openings and metadata-only renewals unavailable without rewriting invoices", async () => {
      const id = await payment("2026-01-01", "2026-02-01", 10000);
      const event = await SubscriptionMovement.findOne().orFail();
      expect(event.previousMinor).toBeNull();
      expect(event.completeFromStart).toBe(false);
      await SubscriptionInvoice.collection.updateOne(
        { _id: id },
        {
          $unset: { originContractId: 1 },
          $set: { metadata: { originContractId: String(contract) } },
        },
      );
      const before = await SubscriptionInvoice.findById(id).lean();
      const loaded = await RevenueHistoryRepository.load("KES", new Date());
      expect(
        loaded.gaps.some((g) => g.code === "LEGACY_METADATA_ONLY_RENEWAL"),
      ).toBe(true);
      expect(
        deriveRevenueHistory(
          loaded.events,
          loaded.gaps,
          "2026-01",
          "2026-01",
          "KES",
          new Date(),
        ).bridges[0]?.closingMinor,
      ).toBeNull();
      expect(await SubscriptionInvoice.findById(id).lean()).toEqual(before);
    });
    it("retains cancellation after expiry without double counting churn", async () => {
      await payment("2026-01-01", "2026-02-01", 10000, { activation: true });
      await endSubscription({
        subscriptionId: sub,
        kind: "EXPIRATION",
        sourceKind: "PAID_TERM_BOUNDARY",
        reference: "term-end",
        at: new Date("2026-02-01"),
        expectedPeriodEnd: new Date("2026-02-01"),
      });
      await endSubscription({
        subscriptionId: sub,
        kind: "CANCELLATION",
        sourceKind: "AUTHORIZED_CANCELLATION",
        reference: "cancel-after-expiry",
        at: new Date("2026-02-02"),
        actorUserId: actor,
      });
      const entries = await SubscriptionMovement.find().sort({ sequence: 1 });
      expect(entries.map((e) => e.kind)).toEqual([
        "ACTIVATION",
        "EXPIRATION",
        "CANCELLATION",
      ]);
      expect(entries[2]?.previousMinor).toBe("0");
      const loaded = await RevenueHistoryRepository.load("KES", new Date());
      expect(
        deriveRevenueHistory(
          loaded.events,
          loaded.gaps,
          "2026-02",
          "2026-02",
          "KES",
          new Date(),
        ).bridges[0],
      ).toMatchObject({
        churnedMinor: "10000",
        closingMinor: "0",
        reconciled: true,
      });
    });
    it("rejects changed replay periods and diagnoses missing proof and a late boundary conflict", async () => {
      const id = await payment("2026-01-01", "2026-02-01", 10000, {
        activation: true,
      });
      const session = await mongoose.startSession();
      try {
        await expect(
          session.withTransaction(async () =>
            recordPaidMovement(
              id,
              new Date("2026-01-01"),
              new Date("2026-03-01"),
              session,
            ),
          ),
        ).rejects.toMatchObject({ code: "MOVEMENT_SOURCE_CONFLICT" });
      } finally {
        await session.endSession();
      }
      await endSubscription({
        subscriptionId: sub,
        kind: "EXPIRATION",
        sourceKind: "PAID_TERM_BOUNDARY",
        reference: "expiry-before-late-webhook",
        at: new Date("2026-02-01"),
        expectedPeriodEnd: new Date("2026-02-01"),
      });
      await payment("2026-02-01", "2026-03-01", 10000);
      expect(
        (await SubscriptionMovement.findOne({ sequence: 3 }))?.gaps,
      ).toContain("OUT_OF_ORDER_OR_BOUNDARY_CONFLICT");
      await BillingEvent.collection.deleteMany({});
      const loaded = await RevenueHistoryRepository.load("KES", new Date());
      expect(loaded.gaps.some((g) => g.code === "MISSING_PROVIDER_PROOF")).toBe(
        true,
      );
      expect(
        deriveRevenueHistory(
          loaded.events,
          loaded.gaps,
          "2026-02",
          "2026-02",
          "KES",
          new Date(),
        ).bridges[0]?.closingMinor,
      ).toBeNull();
    });
  },
);
