import { Notification } from "../../src/database/models/Notification.js";
import { PaystackProvider } from "../../src/core/integrations/paystack.provider.js";
import { RefundService } from "../../src/modules/finance/refund.service.js";
import { FinanceService } from "../../src/modules/finance/finance.service.js";
import { PlatformSwitch } from "../../src/database/models/PlatformSwitch.js";
import { ContractTemplateService } from "../../src/modules/onboarding/contract-template.service.js";
import { defaultContractDraft } from "../../src/modules/onboarding/contract-default.js";
import { contractVariables } from "../../src/modules/onboarding/contract-snapshot.js";
import { integrationConfig } from "../../src/core/integrations/config.js";
import { PaystackBillingProvider } from "../../src/core/billing/billing-provider.js";
import { IntegrationService } from "../../src/modules/integrations/integration.service.js";
import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import jwt from "jsonwebtoken";
import { randomUUID, createHmac } from "node:crypto";
import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { User } from "../../src/database/models/User.js";
import { Organization } from "../../src/database/models/Organization.js";
import { OrganizationMembership } from "../../src/database/models/OrganizationMembership.js";
import { Role } from "../../src/database/models/Role.js";
import { SubscriptionPlan } from "../../src/database/models/SubscriptionPlan.js";
import { OrganizationSubscription } from "../../src/database/models/OrganizationSubscription.js";
import { SubscriptionInvoice } from "../../src/database/models/SubscriptionInvoice.js";
import { Payment } from "../../src/database/models/Payment.js";
import { Property } from "../../src/database/models/Property.js";
import { Unit } from "../../src/database/models/Unit.js";
import { Tenant } from "../../src/database/models/Tenant.js";
import { Tenancy } from "../../src/database/models/Tenancy.js";
import { RentCharge } from "../../src/database/models/RentCharge.js";
import {
  SalesDemoSession,
  SalesValueEvent,
} from "../../src/database/models/SalesDemoSession.js";
import { AuditService } from "../../src/modules/audit/audit.service.js";
import { AuditLog } from "../../src/database/models/AuditLog.js";
import { EntitlementService } from "../../src/core/billing/entitlement.service.js";
import { IntegrationDispatcher } from "../../src/core/integrations/dispatcher.js";
import { assertOperationalIntegrationAllowed } from "../../src/modules/sales/pilot-safety.js";
import { PlatformBusinessService } from "../../src/modules/platform-control/platform-business.service.js";
import { completedAdminFixture } from "../helpers/admin-assurance.js";
import { SYSTEM_ROLES } from "../../src/modules/roles/role.catalog.js";
import type { DemoSessionView } from "../../src/modules/sales/sales-demo.types.js";
import type { AuthenticatedUser } from "../../src/core/types/auth.js";
describe.skipIf(!process.env.RUN_E2E)(
  "sales engine Mongo / authenticated HTTP E2E",
  () => {
    let mongo: MongoMemoryReplSet,
      adminToken: string,
      ownerToken: string,
      ownerId: mongoose.Types.ObjectId,
      adminAuth: AuthenticatedUser;
    const app = createApp(),
      base = "/api/v1/sales";
    const ownerEmail = "pilot-owner@example.test";
    async function prepare(
      plan = "CONTROL",
      pain = "RENT",
    ): Promise<DemoSessionView> {
      const r = await request(app)
        .post(base + "/demos")
        .auth(adminToken, { type: "bearer" })
        .send({
          profile: {
            companyName: "Acacia Discovery",
            plan,
            primaryPain: pain,
            template: "CONTROL_150",
          },
        });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return r.body.data;
    }
    async function action(
      d: DemoSessionView,
      kind: string,
      resourceId?: string,
      commandId = randomUUID(),
      revision = d.revision,
    ) {
      return request(app)
        .post(`${base}/demos/${d.id}/commands`)
        .auth(adminToken, { type: "bearer" })
        .send({ kind, resourceId, commandId, expectedRevision: revision });
    }
    async function offer(d: DemoSessionView) {
      let r = await action(d, "SIMULATE_PAYMENT", "demo-charge-1");
      expect(r.status).toBe(200);
      r = await action(r.body.data, "COMPLETE_DEMO");
      expect(r.status).toBe(200);
      r = await action(r.body.data, "OFFER_PILOT");
      expect(r.status).toBe(200);
      return r.body.data as DemoSessionView;
    }
    async function pilot(d: DemoSessionView, durationDays?: number) {
      const r = await request(app)
        .post(`${base}/demos/${d.id}/pilot`)
        .auth(adminToken, { type: "bearer" })
        .send({ ownerEmail, name: "Acacia Pilot", durationDays });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return r.body.data.organizationId as string;
    }
    const row = {
      propertyName: "Acacia Court",
      propertyCode: "ACACIA",
      address: "Kilimani",
      buildingName: "Block A",
      buildingCode: "A",
      floorName: "Ground Floor",
      floorLevel: 0,
      unitCode: "A01",
      unitType: "TWO_BEDROOM",
      monthlyRentMinor: 2500000,
      depositMinor: 2500000,
      openingBalanceMinor: 1200000,
      tenantFirstName: "Amina",
      tenantLastName: "Wambui",
      tenantPhone: "+254711009770",
      tenancyStart: "2026-01-01",
    };
    beforeAll(async () => {
      mongo = await MongoMemoryReplSet.create({
        replSet: { count: 1 },
        binary: process.env.MONGOMS_SYSTEM_BINARY
          ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY }
          : {},
      });
      await mongoose.connect(mongo.getUri("sales-conversion-test"), {
        autoIndex: false,
      });
      for (const model of Object.values(mongoose.models))
        await model.createCollection();
      for (const name of [
        "User",
        "Role",
        "Organization",
        "OrganizationMembership",
        "SalesLead",
        "SalesDemoSession",
        "SalesValueEvent",
        "Property",
        "Building",
        "Floor",
        "Unit",
        "Tenancy",
        "RentCharge",
        "AuditLog",
        "PlatformBrief",
      ])
        await mongoose.models[name]!.createIndexes();
    }, 180000);
    beforeEach(async () => {
      for (const c of Object.values(mongoose.connection.collections))
        await c.deleteMany({});
      const admin = await User.create({
        phone: "+254700009770",
        email: "sales-admin@example.test",
        firstName: "Sales",
        lastName: "Admin",
        isPlatformAdmin: true,
        verifiedAt: new Date(),
      });
      adminToken = await completedAdminFixture(admin._id);
      adminAuth = { userId: admin._id, isPlatformAdmin: true, memberships: [] };
      const owner = await User.create({
        phone: "+254700009771",
        email: ownerEmail,
        firstName: "Owner",
        lastName: "Fixture",
        verifiedAt: new Date(),
      });
      ownerId = owner._id;
      ownerToken = jwt.sign(
        { sub: String(owner._id), type: "access" },
        env.JWT_ACCESS_SECRET,
      );
      for (const [key, value] of Object.entries(SYSTEM_ROLES))
        await Role.create({
          ...value,
          key,
          system: true,
          organizationId: null,
        });
      for (const key of ["CONTROL", "FORT_KNOX"])
        await SubscriptionPlan.create({
          key,
          name: key,
          amount: 10000,
          billingInterval: "MONTH",
          entitlements: {
            maxProperties: -1,
            maxUnits: -1,
            maxUsers: -1,
            maxTenants: -1,
            features: key === "FORT_KNOX" ? ["security"] : [],
          },
        });
    });
    const originalPaystack = { ...integrationConfig.paystack };
    afterEach(() => {
      vi.restoreAllMocks();
      Object.assign(integrationConfig.paystack, originalPaystack);
    });
    afterAll(async () => {
      await mongoose.disconnect();
      await mongo?.stop();
    });
    it("Control prepare → arrears → reconciliation → repairs → queue → pilot CTA, with no production writes or providers", async () => {
      const provider = vi.spyOn(IntegrationDispatcher, "payment");
      let d = await prepare();
      expect(d.summary.outstandingMinor).toBe(50000000);
      const orgCount = await Organization.countDocuments();
      for (const [kind, id] of [
        ["REVEAL_ARREARS", undefined],
        ["OPEN_TENANCY", "demo-charge-1"],
        ["SIMULATE_PAYMENT", "demo-charge-1"],
        ["APPROVE_MAINTENANCE", "demo-maintenance-1"],
        ["START_WORK", "demo-maintenance-1"],
        ["COMPLETE_REPAIR", "demo-maintenance-1"],
        ["READ_EVIDENCE", "demo-evidence-maintenance-1-afterrepair"],
        ["COMPLETE_DEMO", undefined],
        ["OFFER_PILOT", undefined],
      ]) {
        const r = await action(d, kind!, id);
        expect(r.status, JSON.stringify(r.body)).toBe(200);
        d = r.body.data;
      }
      expect(d.summary).toMatchObject({
        outstandingMinor: 46400000,
        overdueTenants: 16,
        openMaintenance: 5,
        approvals: 1,
      });
      expect(d.snapshot.maintenance[0].finalCostMinor).toBe(1800000);
      expect(d.events.some((e) => e.kind === "pilot.offered")).toBe(true);
      for (const model of [
        Payment,
        RentCharge,
        SubscriptionInvoice,
        OrganizationSubscription,
      ])
        expect(await model.countDocuments()).toBe(0);
      expect(await Organization.countDocuments()).toBe(orgCount);
      expect(provider).not.toHaveBeenCalled();
      expect(
        await AuditLog.countDocuments({
          action: "sales.payment.reconciled",
          "metadata.dataset": "SALES_DEMO",
        }),
      ).toBe(1);
    });
    it("Fort Knox includes Control value then incident → evidence → escalation → resolution → audit", async () => {
      let d = await prepare("FORT_KNOX", "SECURITY");
      for (const [kind, id] of [
        ["SIMULATE_PAYMENT", "demo-charge-1"],
        ["SIMULATE_SECURITY", undefined],
        ["READ_EVIDENCE", "demo-evidence-incident-1-perimetertelemetry"],
        ["INVESTIGATE_INCIDENT", "demo-incident-1"],
        ["ESCALATE_INCIDENT", "demo-incident-1"],
        ["RESOLVE_INCIDENT", "demo-incident-1"],
        ["COMPLETE_DEMO", undefined],
        ["OFFER_PILOT", undefined],
      ]) {
        const r = await action(d, kind!, id);
        expect(r.status, JSON.stringify(r.body)).toBe(200);
        d = r.body.data;
      }
      expect(d.snapshot.incidents[0].status).toBe("RESOLVED");
      expect(d.summary.attention.some((a) => a.kind === "SECURITY")).toBe(
        false,
      );
      expect(
        d.events.some((e) => e.kind === "security.incident.resolved"),
      ).toBe(true);
    });
    it("reset is deterministic, idempotent and confined to one demo; persistent sales evidence survives", async () => {
      let d = await prepare();
      const other = await prepare();
      const original = d.snapshot;
      d = (await action(d, "SIMULATE_PAYMENT", "demo-charge-1")).body.data;
      const key = randomUUID(),
        reset = await action(d, "RESET", undefined, key);
      expect(reset.status).toBe(200);
      expect(reset.body.data.snapshot).toEqual(original);
      const repeat = await action(d, "RESET", undefined, key);
      expect(repeat.body.data.revision).toBe(reset.body.data.revision);
      expect(repeat.body.data.snapshot).toEqual(original);
      expect(
        reset.body.data.events.some(
          (e: { kind: string }) => e.kind === "payment.reconciled",
        ),
      ).toBe(true);
      const second = await action(reset.body.data, "RESET");
      expect(second.body.data.snapshot).toEqual(original);
      const untouched = await request(app)
        .get(`${base}/demos/${other.id}`)
        .auth(adminToken, { type: "bearer" });
      expect(untouched.body.data.revision).toBe(0);
    });
    it("rejects stale concurrent commands, reused payload keys and production-shaped resource IDs", async () => {
      const d = await prepare(),
        key = randomUUID();
      const responses = await Promise.all([
        action(d, "SIMULATE_PAYMENT", "demo-charge-1", key),
        action(d, "SIMULATE_PAYMENT", "demo-charge-2"),
      ]);
      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
      const good = responses.find((r) => r.status === 200)!;
      const reused = await action(
        good.body.data,
        "FOLLOW_UP",
        "demo-charge-1",
        key,
      );
      if (responses[0]!.status === 200) expect(reused.status).toBe(409);
      const invalid = await action(
        good.body.data,
        "SIMULATE_PAYMENT",
        new mongoose.Types.ObjectId().toString(),
      );
      expect(invalid.status).toBe(400);
    });
    it("denies anonymous, normal landlord, password-only admin, cross-seller and Control security actions", async () => {
      const d = await prepare();
      expect((await request(app).get(`${base}/demos/${d.id}`)).status).toBe(
        401,
      );
      expect(
        (
          await request(app)
            .get(`${base}/demos/${d.id}`)
            .auth(ownerToken, { type: "bearer" })
        ).status,
      ).toBe(403);
      expect((await action(d, "SIMULATE_SECURITY")).status).toBe(403);
      const seller = await User.create({
          phone: "+254700009772",
          firstName: "Seller",
          lastName: "One",
        }),
        role = await Role.create({
          key: "SALES",
          name: "Sales",
          permissions: ["sales.demo.manage"],
        }),
        org = await Organization.create({
          name: "Internal sales",
          slug: "internal-sales",
        });
      await OrganizationMembership.create({
        organizationId: org._id,
        userId: seller._id,
        roleIds: [role._id],
        scope: { allProperties: true },
      });
      const token = jwt.sign(
        { sub: String(seller._id), type: "access" },
        env.JWT_ACCESS_SECRET,
      );
      expect(
        (
          await request(app)
            .get(`${base}/demos/${d.id}`)
            .auth(token, { type: "bearer" })
        ).status,
      ).toBe(404);
      const own = await request(app)
        .post(base + "/demos")
        .auth(token, { type: "bearer" })
        .send({ profile: { companyName: "Private Prospect" } });
      expect(own.status).toBe(201);
      expect(
        (
          await request(app)
            .get("/api/v1/platform-control/sales-intelligence")
            .auth(token, { type: "bearer" })
        ).status,
      ).toBe(403);
      const passwordOnly = jwt.sign(
        { sub: String(adminAuth.userId), type: "access" },
        env.JWT_ACCESS_SECRET,
      );
      expect(
        (
          await request(app)
            .get(`${base}/demos`)
            .auth(passwordOnly, { type: "bearer" })
        ).status,
      ).toBe(401);
    });
    it("rolls back state and sales event when required audit fails", async () => {
      const d = await prepare();
      vi.spyOn(AuditService, "record").mockRejectedValueOnce(
        new Error("Audit unavailable"),
      );
      expect(
        (await action(d, "SIMULATE_PAYMENT", "demo-charge-1")).status,
      ).toBe(500);
      expect((await SalesDemoSession.findById(d.id))!.revision).toBe(0);
      expect(
        await SalesValueEvent.countDocuments({
          sessionId: d.id,
          kind: "payment.reconciled",
        }),
      ).toBe(0);
    });
    it("creates one private configurable pilot, imports validated real records and measures actual readiness without commercial bypass", async () => {
      const d = await offer(await prepare()),
        org = await pilot(d, 3);
      expect(await pilot(d, 3)).toBe(org);
      const grant = (await Organization.findById(org))!.guidedPilot!;
      expect(grant.durationDays).toBe(3);
      expect(await OrganizationSubscription.countDocuments()).toBe(0);
      expect(await SubscriptionInvoice.countDocuments()).toBe(0);
      expect((await EntitlementService.getPlan(org)).key).toBe("CONTROL");
      const preview = await request(app)
        .post(`${base}/organizations/${org}/pilot/import/preview`)
        .auth(ownerToken, { type: "bearer" })
        .send({ rows: [row] });
      expect(preview.status, JSON.stringify(preview.body)).toBe(200);
      expect(preview.body.data.valid).toBe(true);
      const body = {
        rows: preview.body.data.rows,
        digest: preview.body.data.digest,
        confirm: true,
      };
      const changed = await request(app)
        .post(`${base}/organizations/${org}/pilot/import/confirm`)
        .auth(ownerToken, { type: "bearer" })
        .send({ ...body, rows: [{ ...row, monthlyRentMinor: 2600000 }] });
      expect(changed.status).toBe(409);
      const imported = await request(app)
        .post(`${base}/organizations/${org}/pilot/import/confirm`)
        .auth(ownerToken, { type: "bearer" })
        .send(body);
      expect(imported.status, JSON.stringify(imported.body)).toBe(201);
      expect(await Unit.countDocuments({ organizationId: org })).toBe(1);
      expect(await Tenant.countDocuments({ organizationId: org })).toBe(1);
      expect(await Tenancy.countDocuments({ organizationId: org })).toBe(1);
      expect(
        (await RentCharge.findOne({ organizationId: org }))!.balanceAmountMinor,
      ).toBe(1200000);
      const repeat = await request(app)
        .post(`${base}/organizations/${org}/pilot/import/confirm`)
        .auth(ownerToken, { type: "bearer" })
        .send(body);
      expect(repeat.status).toBe(201);
      expect(repeat.body.data.replayed).toBe(true);
      expect(await Unit.countDocuments({ organizationId: org })).toBe(1);
      const p = await request(app)
        .get(`${base}/organizations/${org}/pilot`)
        .auth(ownerToken, { type: "bearer" });
      expect(p.body.data.readiness.percent).toBe(71);
      expect(p.body.data.value).toMatchObject({
        unitsConfigured: 1,
        reconciledPayments: 0,
        openingLedgerEntries: 1,
      });
      expect(p.body.data.commercialState).toBe("ACCOUNT_CREATED");
      expect(
        (
          await request(app)
            .post(`/api/v1/organizations/${org}/landlord-onboarding/checkout`)
            .auth(ownerToken, { type: "bearer" })
        ).status,
      ).not.toBe(200);
    });
    it("links demo → pilot → import → first insight → real repair → activation → signed agreement → verified paid conversion", async () => {
      const d = await offer(await prepare()),
        org = await pilot(d);
      const ppath = `${base}/organizations/${org}/pilot`;
      const preview = await request(app)
        .post(ppath + "/import/preview")
        .auth(ownerToken, { type: "bearer" })
        .send({ rows: [row] });
      expect(
        (
          await request(app)
            .post(ppath + "/import/confirm")
            .auth(ownerToken, { type: "bearer" })
            .send({
              rows: preview.body.data.rows,
              digest: preview.body.data.digest,
              confirm: true,
            })
        ).status,
      ).toBe(201);
      const insight = (
        await request(app).get(ppath).auth(ownerToken, { type: "bearer" })
      ).body.data.insight;
      expect(insight).toMatchObject({ kind: "RENT", amountMinor: 1200000 });
      for (let i = 0; i < 2; i++)
        expect(
          (
            await request(app)
              .post(ppath + "/insight")
              .auth(ownerToken, { type: "bearer" })
              .send({ kind: insight.kind, resourceId: insight.resourceId })
          ).status,
        ).toBe(200);
      expect(
        await AuditLog.countDocuments({
          organizationId: org,
          action: "guided.pilot.insight.reviewed",
        }),
      ).toBe(1);
      const property = (await Property.findOne({ organizationId: org }))!;
      expect(
        (
          await request(app)
            .post(`/api/v1/organizations/${org}/invitations`)
            .auth(ownerToken, { type: "bearer" })
            .send({
              email: "caretaker@example.test",
              role: "CARETAKER",
              propertyIds: [String(property._id)],
            })
        ).status,
      ).toBe(201);
      const unit = (await Unit.findOne({ organizationId: org }))!;
      const created = await request(app)
        .post(`/api/v1/organizations/${org}/maintenance`)
        .auth(ownerToken, { type: "bearer" })
        .send({
          unitId: String(unit._id),
          title: "Kitchen pipe repair",
          description: "Owner recorded an actual pilot request",
          category: "PLUMBING",
          priority: "HIGH",
        });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const mid = created.body.data._id;
      for (const [route, body] of [
        ["triage", {}],
        ["assign", { assignedToUserId: String(ownerId) }],
        ["quote", { quoteAmount: 18000 }],
        ["approve", {}],
        ["progress", { status: "IN_PROGRESS" }],
        ["progress", { status: "COMPLETED", actualAmount: 18000 }],
      ] as const) {
        const r = await request(app)
          .post(`/api/v1/maintenance/${mid}/${route}`)
          .auth(ownerToken, { type: "bearer" })
          .send(body);
        expect(r.status, JSON.stringify(r.body)).toBe(200);
      }
      for (let i = 0; i < 2; i++) {
        const p = await request(app)
          .get(ppath)
          .auth(ownerToken, { type: "bearer" });
        expect(p.body.data.readiness.percent).toBe(100);
        expect(p.body.data.value).toMatchObject({
          completedRepairs: 1,
          approvalsCompleted: 1,
          meaningfulInsights: 2,
        });
      }
      expect(
        await SalesValueEvent.countDocuments({
          kind: "activation.milestone.reached",
        }),
      ).toBe(1);
      for (const key of [
        "LANDLORD_ONBOARDING",
        "PAYSTACK_PAYMENTS",
        "DOCUMENT_STORAGE",
      ])
        await PlatformSwitch.create({
          key,
          name: key,
          description: "Isolated test switch",
          kind: "SERVICE",
          enabled: true,
          mode: "ON",
        });
      const template = await ContractTemplateService.create(adminAuth, {
        ...defaultContractDraft,
        variables: [...contractVariables],
        effectiveAt: new Date("2026-01-01"),
      });
      await ContractTemplateService.status(
        adminAuth,
        String(template!._id),
        "ACTIVE",
      );
      integrationConfig.paystack.secretKey = "sk_test_sales_fixture";
      integrationConfig.paystack.enabled = true;
      vi.spyOn(
        PaystackBillingProvider.prototype,
        "createCustomer",
      ).mockResolvedValue({ providerCustomerId: "CUS_sales" });
      vi.spyOn(
        PaystackBillingProvider.prototype,
        "createPrepaidPlan",
      ).mockResolvedValue("PLN_sales");
      vi.spyOn(
        PaystackBillingProvider.prototype,
        "retryCheckout",
      ).mockImplementation(async (_plan, input) => ({
        checkoutReference: input.checkoutReference ?? "sales-checkout",
        checkoutUrl: "https://checkout.paystack.com/sales-fixture",
      }));
      vi.spyOn(
        PaystackBillingProvider.prototype,
        "scheduleRenewal",
      ).mockImplementation(async (input) => ({
        subscription_code: "SUB_sales",
        email_token: "sales-test-private-token",
        next_payment_date: input.startsAt.toISOString(),
      }));
      const commercial = `/api/v1/organizations/${org}/landlord-onboarding`;
      let r = await request(app)
        .put(commercial + "/details")
        .auth(ownerToken, { type: "bearer" })
        .send({
          legalName: "Acacia Pilot Limited",
          legalIdentifier: "FIXTURE-2026-001",
          billingEmail: ownerEmail,
          unitCount: 1,
        });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      r = await request(app)
        .post(commercial + "/contract")
        .auth(ownerToken, { type: "bearer" })
        .send({
          planKey: "CONTROL",
          prepaidMonths: 3,
          expectedRevision: r.body.data.revision,
        });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      r = await request(app)
        .post(commercial + "/signature")
        .auth(ownerToken, { type: "bearer" })
        .send({
          contractId: r.body.data.contract._id,
          documentHash: r.body.data.contract.sha256,
          signatoryName: "Owner Fixture",
          authorityConfirmed: true,
          termsAccepted: true,
        });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      r = await request(app)
        .post(commercial + "/checkout")
        .auth(ownerToken, { type: "bearer" });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.data.state).toBe("PAYMENT_PENDING");
      const before = await request(app)
        .get("/api/v1/platform-control/sales-intelligence")
        .auth(adminToken, { type: "bearer" });
      expect(before.body.data.cohorts[0].paid).toBe(0);
      const event = {
        event: "charge.success",
        data: {
          status: "success",
          reference: r.body.data.subscription.providerCheckoutReference,
          amount: r.body.data.invoice.totalMinor,
          currency: "KES",
          paid_at: new Date().toISOString(),
          customer: { customer_code: "CUS_sales" },
          authorization: {
            authorization_code: "AUTH_sales_fixture",
            reusable: true,
          },
        },
      };
      const raw = Buffer.from(JSON.stringify(event));
      await IntegrationService.handleWebhook(
        "PAYSTACK",
        raw,
        createHmac("sha512", integrationConfig.paystack.secretKey!)
          .update(raw)
          .digest("hex"),
      );
      const after = await request(app)
        .get("/api/v1/platform-control/sales-intelligence")
        .auth(adminToken, { type: "bearer" });
      expect(after.body.data.cohorts[0]).toMatchObject({
        prospects: 1,
        pilots: 1,
        activated: 1,
        paid: 1,
        retained: 0,
      });
      const initial = await SubscriptionInvoice.findOne({
        organizationId: org,
      }).orFail();
      await SubscriptionInvoice.create({
        organizationId: org,
        subscriptionId: initial.subscriptionId,
        invoiceNumber: "RENEWAL-sales-fixture",
        periodStart: initial.periodEnd,
        periodEnd: new Date(initial.periodEnd.getTime() + 30 * 86400000),
        subtotal: 10000,
        tax: 0,
        total: 10000,
        amountPaid: 10000,
        currency: "KES",
        status: "PAID",
        paidAt: new Date(),
        dueDate: initial.periodEnd,
        provider: "PAYSTACK",
        providerInvoiceId: "renewal-sales-fixture",
        createdBy: ownerId,
        updatedBy: ownerId,
      });
      const retained = await request(app)
        .get("/api/v1/platform-control/sales-intelligence")
        .auth(adminToken, { type: "bearer" });
      expect(retained.body.data.cohorts[0].retained).toBe(1);
      await OrganizationSubscription.updateOne(
        { organizationId: org },
        { $set: { status: "CANCELLED", updatedBy: ownerId } },
      );
      const historical = await request(app)
        .get("/api/v1/platform-control/sales-intelligence")
        .auth(adminToken, { type: "bearer" });
      expect(historical.body.data.cohorts[0].paid).toBe(1);
      await expect(EntitlementService.getPlan(org)).rejects.toMatchObject({
        code: "SUBSCRIPTION_REQUIRED",
      });
      await expect(
        assertOperationalIntegrationAllowed(org),
      ).resolves.toBeUndefined();
      expect((await Organization.findById(org))!.onboarding!.state).toBe(
        "ACTIVE",
      );
    });
    it("keeps repeated scenarios on one prospect and resumes its pilot without resetting or extending it", async () => {
      const d = await offer(await prepare()),
        org = await pilot(d, 3),
        expiry = (await Organization.findById(org))!.guidedPilot!.expiresAt;
      const next = await request(app)
        .post(base + "/demos")
        .auth(adminToken, { type: "bearer" })
        .send({
          leadId: d.leadId,
          profile: { ...d.profile, plan: "FORT_KNOX", primaryPain: "SECURITY" },
        });
      expect(next.status).toBe(201);
      const offered = await offer(next.body.data),
        resumed = await pilot(offered);
      expect(resumed).toBe(org);
      expect(await Organization.countDocuments()).toBe(1);
      expect(
        (await Organization.findById(org))!.guidedPilot!.expiresAt,
      ).toEqual(expiry);
      const changed = await request(app)
        .post(`${base}/demos/${offered.id}/pilot`)
        .auth(adminToken, { type: "bearer" })
        .send({
          ownerEmail: "different-owner@example.test",
          name: "Different",
        });
      expect(changed.status).toBe(409);
      const r = await request(app)
        .get("/api/v1/platform-control/sales-intelligence")
        .auth(adminToken, { type: "bearer" });
      expect(r.body.data.cohorts[0]).toMatchObject({ prospects: 1, pilots: 1 });
    });
    it("blocks cross-tenant imports, malformed uploads, existing identity writes and expired pilot mutations", async () => {
      const org = await pilot(await offer(await prepare()));
      const stranger = await User.create({
          phone: "+254700009779",
          firstName: "Other",
          lastName: "Owner",
        }),
        token = jwt.sign(
          { sub: String(stranger._id), type: "access" },
          env.JWT_ACCESS_SECRET,
        );
      expect(
        (
          await request(app)
            .get(`${base}/organizations/${org}/pilot`)
            .auth(token, { type: "bearer" })
        ).status,
      ).toBe(403);
      const invalid = await request(app)
        .post(`${base}/organizations/${org}/pilot/import/preview`)
        .auth(ownerToken, { type: "bearer" })
        .send({ rows: [{ ...row, monthlyRentMinor: -1 }, row, row] });
      expect(invalid.body.data.valid).toBe(false);
      expect(invalid.body.data.errors.length).toBeGreaterThan(1);
      await expect(
        assertOperationalIntegrationAllowed(org),
      ).rejects.toMatchObject({ code: "PILOT_INTEGRATION_BLOCKED" });
      await Organization.updateOne(
        { _id: org },
        { $set: { "guidedPilot.expiresAt": new Date(Date.now() - 1) } },
      );
      await expect(EntitlementService.getPlan(org)).rejects.toMatchObject({
        code: "SUBSCRIPTION_REQUIRED",
      });
      expect(
        (
          await request(app)
            .post(`${base}/organizations/${org}/pilot/import/preview`)
            .auth(ownerToken, { type: "bearer" })
            .send({ rows: [row] })
        ).status,
      ).toBe(410);
      expect(
        (
          await request(app)
            .get(`${base}/organizations/${org}/pilot`)
            .auth(ownerToken, { type: "bearer" })
        ).body.data.expired,
      ).toBe(true);
    });
    it("imports a 300-unit property in one confirmed batch, honors capacity and leaves no partial records on rollback", async () => {
      const org = await pilot(await offer(await prepare()));
      const rows = Array.from({ length: 300 }, (_, i) => ({
        ...row,
        unitCode: `A${i + 1}`,
        floorLevel: Math.floor(i / 20),
        floorName: `Floor ${Math.floor(i / 20)}`,
        tenantFirstName: undefined,
        tenantLastName: undefined,
        tenantPhone: undefined,
        tenancyStart: undefined,
        depositMinor: 0,
        openingBalanceMinor: 0,
      }));
      const preview = await request(app)
        .post(`${base}/organizations/${org}/pilot/import/preview`)
        .auth(ownerToken, { type: "bearer" })
        .send({ rows });
      expect(preview.body.data.valid).toBe(true);
      const body = {
        rows: preview.body.data.rows,
        digest: preview.body.data.digest,
        confirm: true,
      };
      await SubscriptionPlan.updateOne(
        { key: "CONTROL" },
        { $set: { "entitlements.maxUnits": 200 } },
      );
      const blocked = await request(app)
        .post(`${base}/organizations/${org}/pilot/import/confirm`)
        .auth(ownerToken, { type: "bearer" })
        .send(body);
      expect(blocked.status).toBe(403);
      expect(await Unit.countDocuments({ organizationId: org })).toBe(0);
      expect(await Property.countDocuments({ organizationId: org })).toBe(0);
      await SubscriptionPlan.updateOne(
        { key: "CONTROL" },
        { $set: { "entitlements.maxUnits": -1 } },
      );
      const imported = await request(app)
        .post(`${base}/organizations/${org}/pilot/import/confirm`)
        .auth(ownerToken, { type: "bearer" })
        .send(body);
      expect(imported.status, JSON.stringify(imported.body)).toBe(201);
      expect(await Unit.countDocuments({ organizationId: org })).toBe(300);
      expect(await Payment.countDocuments()).toBe(0);
      expect(await RentCharge.countDocuments()).toBe(0);
    }, 30000);
    it("blocks pilot messaging, provider callbacks, refunds and settlement setup before any provider invocation", async () => {
      const org = await pilot(await offer(await prepare()));
      const ids = {
        organizationId: org,
        propertyId: new mongoose.Types.ObjectId(),
        buildingId: new mongoose.Types.ObjectId(),
        floorId: new mongoose.Types.ObjectId(),
        unitId: new mongoose.Types.ObjectId(),
        tenantId: new mongoose.Types.ObjectId(),
        tenancyId: new mongoose.Types.ObjectId(),
        createdBy: ownerId,
        updatedBy: ownerId,
      };
      const payment = await Payment.create({
        ...ids,
        amount: 100,
        currency: "KES",
        method: "CARD",
        provider: "PAYSTACK",
        providerTransactionId: "pilot-operational-fixture",
        status: "CONFIRMED",
      });
      const provider = vi.spyOn(IntegrationDispatcher, "payment"),
        refund = vi.spyOn(PaystackProvider.prototype, "createRefund"),
        subaccount = vi.spyOn(PaystackProvider.prototype, "createSubaccount");
      integrationConfig.paystack.enabled = true;
      integrationConfig.paystack.secretKey = "sk_test_pilot_suppression";
      await expect(
        RefundService.request(
          adminAuth,
          String(payment._id),
          "Isolated test request",
        ),
      ).rejects.toMatchObject({ code: "PILOT_INTEGRATION_BLOCKED" });
      await expect(
        IntegrationService.processPaystack({
          event: "charge.success",
          data: {
            status: "success",
            reference: "pilot-operational-fixture",
            amount: 10000,
            currency: "KES",
          },
        }),
      ).rejects.toMatchObject({ code: "PILOT_INTEGRATION_BLOCKED" });
      await Payment.updateOne(
        { _id: payment._id },
        { $set: { provider: "MPESA" } },
      );
      await expect(
        IntegrationService.processMpesa({
          Body: {
            stkCallback: {
              CheckoutRequestID: "pilot-operational-fixture",
              ResultCode: 0,
            },
          },
        }),
      ).rejects.toMatchObject({ code: "PILOT_INTEGRATION_BLOCKED" });
      await expect(
        FinanceService.createPaymentDestination(adminAuth, org, {
          provider: "PAYSTACK",
          label: "Pilot fixture",
          businessName: "Pilot Fixture",
          bankCode: "001",
          accountNumber: "1234567890",
          currency: "KES",
          country: "KE",
          isDefault: false,
        } as never),
      ).rejects.toMatchObject({ code: "PILOT_INTEGRATION_BLOCKED" });
      const n = await Notification.create({
        organizationId: org,
        recipientUserId: ownerId,
        channel: "SMS",
        type: "PILOT_FIXTURE",
        title: "Pilot fixture",
        body: "No message may leave the test workspace",
      });
      await expect(
        IntegrationDispatcher.sendNotification(n),
      ).rejects.toMatchObject({ code: "PILOT_INTEGRATION_BLOCKED" });
      expect((await Notification.findById(n._id))!.status).toBe("FAILED");
      expect(provider).not.toHaveBeenCalled();
      expect(refund).not.toHaveBeenCalled();
      expect(subaccount).not.toHaveBeenCalled();
      n.channel = "IN_APP";
      await IntegrationDispatcher.sendNotification(n);
      expect(n.status).toBe("SENT");
    });
    it("keeps simulated outcomes out of live BI and counts unique prospect value conversion", async () => {
      await offer(await prepare());
      const bi = await PlatformBusinessService.overview(adminAuth, {
        dataset: "LIVE",
        period: "LAST_30_DAYS",
      });
      expect(bi.revenue.reduce((n, r) => n + r.mrrMinor, 0)).toBe(0);
      const r = await request(app)
        .get("/api/v1/platform-control/sales-intelligence")
        .auth(adminToken, { type: "bearer" });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.data.cohorts[0]).toMatchObject({
        prospects: 1,
        demos: 1,
        offered: 1,
        pilots: 0,
        paid: 0,
      });
      expect(r.headers["cache-control"]).toBe("no-store");
      expect(
        await AuditLog.countDocuments({
          actorUserId: adminAuth.userId,
          action: "sales.intelligence.viewed",
        }),
      ).toBe(1);
      expect(
        r.body.data.valueMoments.find(
          (m: { _id: string }) => m._id === "payment.reconciled",
        ).prospectsReached,
      ).toBe(1);
    });
  },
);
