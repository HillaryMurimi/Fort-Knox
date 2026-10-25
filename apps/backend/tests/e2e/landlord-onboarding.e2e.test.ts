import { authRateLimit } from "../../src/core/api/rate-limits.js";
import { setOtpTestDelivery } from "../../src/modules/auth/otp-delivery.js";
import { completedAdminFixture } from "../helpers/admin-assurance.js";
import { RefreshSession } from "../../src/database/models/RefreshSession.js";
import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose, { Types } from "mongoose";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createHmac } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { integrationConfig } from "../../src/core/integrations/config.js";
import { PaystackBillingProvider } from "../../src/core/billing/billing-provider.js";
import { PaystackProvider } from "../../src/core/integrations/paystack.provider.js";
import { Organization } from "../../src/database/models/Organization.js";
import { OrganizationContract } from "../../src/database/models/OrganizationContract.js";
import { ContractTemplate } from "../../src/database/models/ContractTemplate.js";
import { OrganizationSubscription } from "../../src/database/models/OrganizationSubscription.js";
import { SubscriptionInvoice } from "../../src/database/models/SubscriptionInvoice.js";
import { Document } from "../../src/database/models/Document.js";
import { Evidence } from "../../src/database/models/Evidence.js";
import { BillingEvent } from "../../src/database/models/BillingEvent.js";
import { Role } from "../../src/database/models/Role.js";
import { User } from "../../src/database/models/User.js";
import { PlatformSwitch } from "../../src/database/models/PlatformSwitch.js";
import { AuditLog } from "../../src/database/models/AuditLog.js";
import { SubscriptionPlan } from "../../src/database/models/SubscriptionPlan.js";
import { OrganizationMembership } from "../../src/database/models/OrganizationMembership.js";
import { ContractTemplateService } from "../../src/modules/onboarding/contract-template.service.js";
import { defaultContractDraft } from "../../src/modules/onboarding/contract-default.js";
import {
  contractVariables,
  addMonths,
  hash,
} from "../../src/modules/onboarding/contract-snapshot.js";
import { LandlordOnboardingService } from "../../src/modules/onboarding/landlord-onboarding.service.js";
import { IntegrationService } from "../../src/modules/integrations/integration.service.js";
import { BillingService } from "../../src/modules/billing/billing.service.js";
import { AuditService } from "../../src/modules/audit/audit.service.js";
import type { AuthenticatedUser } from "../../src/core/types/auth.js";

import { AcquisitionJourney } from "../../src/database/models/AcquisitionJourney.js";
import { AcquisitionFunnelService } from "../../src/modules/sales/acquisition-funnel.service.js";
import { OnboardingRecoveryService } from "../../src/modules/onboarding/onboarding-recovery.service.js";
import { enqueueJobSchema } from "../../src/modules/jobs/job.schemas.js";
import { Property } from "../../src/database/models/Property.js";
import { Unit } from "../../src/database/models/Unit.js";
import { Job } from "../../src/database/models/Job.js";
import { Notification } from "../../src/database/models/Notification.js";
import { NotificationPreference } from "../../src/database/models/NotificationPreference.js";
import { SYSTEM_ROLES } from "../../src/modules/roles/role.catalog.js";
const permissions = [...SYSTEM_ROLES.LANDLORD.permissions];
describe.skipIf(!process.env.RUN_E2E)(
  "landlord onboarding replica-set / HTTP end-to-end certification",
  () => {
    let mongo: MongoMemoryReplSet;
    let deliveredOtp = "";
    let org: string,
      token: string,
      owner: AuthenticatedUser,
      admin: AuthenticatedUser,
      adminToken: string;
    const app = createApp(),
      originalPaystack = { ...integrationConfig.paystack };
    const path = (suffix = "") =>
      `/api/v1/organizations/${org}/landlord-onboarding${suffix}`;
    const call = (suffix: string, data?: unknown) =>
      request(app)
        .post(path(suffix))
        .auth(token, { type: "bearer" })
        .send(data ?? {});
    beforeAll(async () => {
      mongo = await MongoMemoryReplSet.create({
        replSet: { count: 1 },
        binary: process.env.MONGOMS_SYSTEM_BINARY
          ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY }
          : {},
      });
      await mongoose.connect(mongo.getUri(), { autoIndex: false });
      for (const model of [
        AcquisitionJourney,
        Property,
        Unit,
        Job,
        Notification,
        NotificationPreference,
        mongoose.models.Building!,
        mongoose.models.Floor!,
        mongoose.models.Tenant!,
        mongoose.models.Tenancy!,
        mongoose.models.RentCharge!,
        RefreshSession,
        Organization,
        ContractTemplate,
        OrganizationContract,
        OrganizationSubscription,
        SubscriptionInvoice,
        Document,
        Evidence,
        BillingEvent,
        Role,
        User,
        OrganizationMembership,
        AuditLog,
        mongoose.models.DomainEvent!,
        mongoose.models.EventCounter!,
        mongoose.models.EventOutbox!,
      ].filter(Boolean)) {
        await model.createCollection();
        await model.createIndexes();
      }
    }, 180000);
    beforeEach(async () => {
      authRateLimit.resetKey("::ffff:127.0.0.1");
      authRateLimit.resetKey("127.0.0.1");
      setOtpTestDelivery(async (_channel, _destination, code) => {
        deliveredOtp = code;
      });
      for (const collection of Object.values(mongoose.connection.collections))
        await collection.deleteMany({});
      const role = await Role.create({
        name: "Landlord",
        key: "LANDLORD",
        system: true,
        organizationId: null,
        permissions,
      });
      const signup = await request(app)
        .post("/api/v1/auth/bootstrap-landlord")
        .send({
          firstName: "Jane",
          lastName: "Landlord",
          phone: "+254700009001",
          email: "owner@example.com",
          password: "Secure-test-password-2026!",
          organization: { name: "Acacia Portfolio", slug: "acacia-test" },
        });
      expect(signup.status, JSON.stringify(signup.body)).toBe(201);
      org = String(signup.body.data.organizationId);
      const loginProof = await request(app)
        .post("/api/v1/auth/login")
        .send({
          method: "email",
          email: "owner@example.com",
          password: "Secure-test-password-2026!",
          channel: "EMAIL",
        });
      const emailProof = await request(app)
        .post("/api/v1/auth/account-otp/verify")
        .send({
          challengeToken: loginProof.body.data.challengeToken,
          channel: "EMAIL",
          code: deliveredOtp,
        });
      expect(emailProof.status, JSON.stringify(emailProof.body)).toBe(200);
      const userId = new Types.ObjectId(signup.body.data.userId);
      owner = {
        userId,
        isPlatformAdmin: false,
        memberships: [
          {
            organizationId: new Types.ObjectId(org),
            roleIds: [role._id],
            roles: ["LANDLORD"],
            permissions,
            scope: {
              allProperties: true,
              propertyIds: [],
              buildingIds: [],
              unitIds: [],
            },
          },
        ],
      };
      token = jwt.sign(
        { sub: String(userId), type: "access" },
        env.JWT_ACCESS_SECRET,
      );
      const administrator = await User.create({
        phone: "+254700009002",
        email: "admin@example.com",
        firstName: "Platform",
        lastName: "Admin",
        isPlatformAdmin: true,
      });
      admin = {
        userId: administrator._id,
        isPlatformAdmin: true,
        memberships: [],
      };
      adminToken = await completedAdminFixture(admin.userId);
      await SubscriptionPlan.create({
        key: "CONTROL",
        name: "Control",
        currency: "KES",
        amount: 10000,
        billingInterval: "MONTH",
        trialDays: 14,
        metadata: {
          pricingModel: "BASE_PLUS_ACTIVE_UNITS",
          includedUnits: 50,
          additionalUnitAmount: 200,
        },
        entitlements: {
          maxProperties: -1,
          maxUnits: -1,
          maxUsers: -1,
          maxTenants: -1,
          features: ["documents"],
        },
      });
      for (const key of [
        "LANDLORD_ONBOARDING",
        "PAYSTACK_PAYMENTS",
        "DOCUMENT_STORAGE",
      ])
        await PlatformSwitch.create({
          key,
          name: key,
          description: "Test fixture",
          kind: "SERVICE",
          enabled: true,
          mode: "ON",
        });
      const template = await ContractTemplateService.create(admin, {
        ...defaultContractDraft,
        variables: [...contractVariables],
        effectiveAt: new Date("2026-01-01"),
      });
      await ContractTemplateService.status(
        admin,
        String(template!._id),
        "ACTIVE",
      );
      integrationConfig.paystack.secretKey = "sk_test_contract_fixture";
      integrationConfig.paystack.enabled = true;
      vi.spyOn(
        PaystackBillingProvider.prototype,
        "createCustomer",
      ).mockResolvedValue({ providerCustomerId: "CUS_contract" });
      vi.spyOn(
        PaystackBillingProvider.prototype,
        "createPrepaidPlan",
      ).mockResolvedValue("PLN_contract");
      vi.spyOn(
        PaystackBillingProvider.prototype,
        "retryCheckout",
      ).mockImplementation(async (_plan, input) => ({
        checkoutReference: input.checkoutReference ?? "recovered-checkout",
        checkoutUrl: "https://checkout.paystack.com/contract",
      }));
      vi.spyOn(
        PaystackBillingProvider.prototype,
        "scheduleRenewal",
      ).mockImplementation(async (input) => ({
        subscription_code: "SUB_contract",
        email_token: "test-private-token",
        next_payment_date: input.startsAt.toISOString(),
      }));
    });
    afterEach(() => {
      env.SMS_ENABLED = true;
      env.ONBOARDING_RECOVERY_ENABLED = false;
      env.ONBOARDING_RECOVERY_APPROVAL_CASE = undefined;
      setOtpTestDelivery();
      vi.restoreAllMocks();
      Object.assign(integrationConfig.paystack, originalPaystack);
    });
    afterAll(async () => {
      await mongoose.disconnect();
      await mongo?.stop();
    });

    const portfolioPath = (suffix = "") =>
      "/api/v1/organizations/" + org + "/portfolio-onboarding" + suffix;
    const portfolio = async (
      method: "get" | "post" | "put",
      suffix: string,
      data?: unknown,
    ) =>
      request(app)
        [method](portfolioPath(suffix))
        .auth(token, { type: "bearer" })
        .send(data ?? {});
    const row = (unitCode = "A1") => ({
      propertyName: "Acacia Import",
      propertyCode: "IMP",
      address: "Import Road",
      city: "Nairobi",
      buildingName: "Main",
      buildingCode: "MAIN",
      floorName: "Ground",
      floorLevel: 0,
      unitCode,
      unitType: "ONE_BEDROOM",
      monthlyRentMinor: 1250025,
    });
    async function activate(units = 55) {
      const state = await checkout(units);
      await signedWebhook(charge(state));
      return state;
    }
    it('serves configured prices by tier and unit count after an authorized plan update', async () => {
      const plan = await SubscriptionPlan.findOne({ key: 'CONTROL' }).orFail();
      const denied = await request(app).patch(`/api/v1/billing/plans/${plan.id}`).auth(token, { type: 'bearer' }).send({ metadata: { additionalUnitAmount: 250 } });
      expect(denied.status).toBe(403);
      const updated = await request(app).patch(`/api/v1/billing/plans/${plan.id}`).auth(adminToken, { type: 'bearer' }).send({ metadata: { additionalUnitAmount: 250 } });
      expect(updated.status, JSON.stringify(updated.body)).toBe(200);
      expect(updated.body.data.metadata).toMatchObject({ includedUnits: 50, additionalUnitAmount: 250 });
      expect(await AuditLog.countDocuments({ action: 'BILLING_PLAN_UPDATED', resourceId: plan._id })).toBe(1);
      const invalidBase = await request(app).patch(`/api/v1/billing/plans/${plan.id}`).auth(adminToken, { type: 'bearer' }).send({ amount: 0 });
      expect(invalidBase.status).toBe(400);
      expect((await SubscriptionPlan.findById(plan._id).orFail()).amount).toBe(10000);
      const create = await request(app).post('/api/v1/billing/plans').auth(adminToken, { type: 'bearer' }).send({
        key: 'FORT_KNOX', name: 'Fort Knox', amount: 30000, billingInterval: 'MONTH',
        entitlements: { maxProperties: -1, maxUnits: -1, maxUsers: -1, maxTenants: -1, features: ['security'] },
        metadata: { pricingModel: 'BASE_PLUS_ACTIVE_UNITS', includedUnits: 50, additionalUnitAmount: 300 },
      });
      expect(create.status, JSON.stringify(create.body)).toBe(201);
      expect(await AuditLog.countDocuments({ action: 'BILLING_PLAN_CREATED' })).toBe(1);
      for (const [units, control, fort] of [[50, 1000000, 3000000], [55, 1125000, 3150000]]) {
        const response = await request(app).get(`/api/v1/acquisition/plans?units=${units}&months=3`);
        expect(response.status, JSON.stringify(response.body)).toBe(200);
        expect(response.body.data.plans).toMatchObject([
          { key: 'CONTROL', pricing: { includedUnits: 50, additionalUnitMinor: 25000, monthlyMinor: control, totalMinor: control * 3 } },
          { key: 'FORT_KNOX', pricing: { includedUnits: 50, additionalUnitMinor: 30000, monthlyMinor: fort, totalMinor: fort * 3 } },
        ]);
      }
    });
    it("connects anonymous demo, chosen plan, real email verification, payment and actual first-value evidence", async () => {
      let journeyToken = "";
      for (const event of [
        "landing_viewed",
        "demo_started",
        "demo_completed",
        "plan_selected",
        "signup_started",
      ]) {
        const result = await request(app)
          .post("/api/v1/acquisition/events")
          .send({
            event,
            source: "PUBLIC_DEMO",
            planKey: "CONTROL",
            ...(journeyToken ? { journeyToken } : {}),
          });
        expect(result.status, JSON.stringify(result.body)).toBe(200);
        journeyToken = result.body.data.journeyToken;
      }
      const duplicate = await request(app)
        .post("/api/v1/acquisition/events")
        .send({ event: "demo_started", journeyToken, source: "PUBLIC_DEMO" });
      expect(duplicate.status).toBe(200);
      expect(await AcquisitionJourney.countDocuments()).toBe(1);
      const created = await request(app)
        .post("/api/v1/auth/bootstrap-landlord")
        .send({
          firstName: "New",
          lastName: "Owner",
          phone: "+254700009010",
          email: "new-owner@example.com",
          password: "Secure-test-password-2026!",
          organization: { name: "New Portfolio" },
          acquisition: {
            selectedPlanKey: "CONTROL",
            unitCount: 55,
            prepaidMonths: 3,
            journeyToken,
            source: "PUBLIC_DEMO",
          },
        });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      org = String(created.body.data.organizationId);
      const login = await request(app)
        .post("/api/v1/auth/login")
        .send({
          method: "email",
          email: "new-owner@example.com",
          password: "Secure-test-password-2026!",
          channel: "EMAIL",
        });
      const proof = await request(app)
        .post("/api/v1/auth/account-otp/verify")
        .send({
          challengeToken: login.body.data.challengeToken,
          channel: "EMAIL",
          code: deliveredOtp,
        });
      expect(proof.status).toBe(200);
      token = proof.body.data.accessToken;
      const saved = await Organization.findById(org).orFail();
      expect(saved.onboarding?.selectedPlanKey).toBe("CONTROL");
      expect(
        (
          await AcquisitionJourney.findOne({ organizationId: org })
            .select("+tokenHash")
            .orFail()
        ).tokenHash,
      ).toBeUndefined();
      expect((await portfolio("get", "")).status).toBe(402);
      const before = await AcquisitionFunnelService.report(admin, { days: 30 });
      expect(before.accounts.verifiedPayments).toBe(0);
      expect(before.revenue).toEqual([]);
      await activate();
      const preview = await portfolio("post", "/import/preview", {
        rows: [row()],
      });
      expect(preview.body.data.valid).toBe(true);
      expect(
        (
          await portfolio("post", "/import/confirm", {
            ...preview.body.data,
            rows: preview.body.data.rows,
            digest: preview.body.data.digest,
            confirm: true,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await portfolio("post", "/import/confirm", {
            rows: preview.body.data.rows,
            digest: preview.body.data.digest,
            confirm: true,
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await request(app)
            .get("/api/v1/organizations/" + org + "/command-center")
            .auth(token, { type: "bearer" })
        ).status,
      ).toBe(200);
      expect(
        (
          await request(app)
            .get("/api/v1/organizations/" + org + "/cctv/cameras")
            .auth(token, { type: "bearer" })
        ).status,
      ).toBe(403);
      expect((await portfolio("post", "/dashboard-visit")).status).toBe(200);
      expect((await portfolio("post", "/dashboard-visit")).status).toBe(200);
      expect(
        await AuditLog.countDocuments({
          organizationId: org,
          action: "portfolio.first_dashboard.visited",
        }),
      ).toBe(1);
      const funnel = await AcquisitionFunnelService.report(admin, { days: 30 });
      expect(funnel.public.demoStarted).toBe(1);
      expect(funnel.accounts).toMatchObject({
        accounts: 2,
        verifiedPayments: 1,
        activations: 1,
        properties: 1,
        imports: 1,
        firstValue: 1,
      });
      expect(funnel.linkedVisitorConversion).toMatchObject({
        sessions: 1,
        verifiedPaid: 1,
        rate: 100,
      });
      expect(funnel.revenue).toEqual([
        {
          currency: "KES",
          organizations: 1,
          mrrMinor: "1100000",
          arrMinor: "13200000",
        },
      ]);
      expect(funnel.timeToFirstValue?.observations).toBe(1);
      expect(
        (
          await request(app)
            .get("/api/v1/platform-control/acquisition-funnel")
            .auth(token, { type: "bearer" })
        ).status,
      ).toBe(403);
    });
    it("saves private drafts, rejects stale revisions and reloads after a new authenticated session", async () => {
      await activate();
      const input = {
        stage: "UNITS",
        expectedRevision: 0,
        property: {
          name: "Draft only",
          code: "DRAFT",
          address: "Draft Road",
          city: "Nairobi",
          propertyType: "APARTMENT",
        },
        importRows: [{ tenantEmail: "private-tenant@example.com" }],
      };
      const saved = await portfolio("put", "/draft", input);
      expect(saved.status, JSON.stringify(saved.body)).toBe(200);
      expect(saved.body.data.revision).toBe(1);
      expect(saved.body.data.facts.properties).toBe(0);
      expect(saved.body.data.percent).toBe(25);
      expect((await portfolio("put", "/draft", input)).status).toBe(409);
      const listed = await request(app)
        .get("/api/v1/organizations")
        .auth(token, { type: "bearer" });
      expect(JSON.stringify(listed.body)).not.toContain("private-tenant");
      const login = await request(app)
        .post("/api/v1/auth/login")
        .send({
          method: "email",
          email: "owner@example.com",
          password: "Secure-test-password-2026!",
          channel: "EMAIL",
        });
      const proof = await request(app)
        .post("/api/v1/auth/account-otp/verify")
        .send({
          challengeToken: login.body.data.challengeToken,
          channel: "EMAIL",
          code: deliveredOtp,
        });
      expect(proof.status).toBe(200);
      token = proof.body.data.accessToken;
      expect(
        (await portfolio("get", "")).body.data.draft.importRows[0].tenantEmail,
      ).toBe("private-tenant@example.com");
      expect((await portfolio("post", "/dashboard-visit")).status).toBe(409);
    });
    it("corrects invalid imports, commits genuine tenancies and scoped caretakers, and safely replays uploads with SMS off", async () => {
      env.SMS_ENABLED = false;
      await Role.create({
        key: "TENANT",
        name: "Tenant",
        system: true,
        organizationId: null,
        permissions: [],
      });
      await Role.create({
        key: "CARETAKER",
        name: "Caretaker",
        system: true,
        organizationId: null,
        permissions: ["property.view"],
      });
      await activate();
      const occupied = {
        ...row(),
        occupancyStatus: "OCCUPIED",
        tenantFirstName: "Tenant",
        tenantLastName: "Actual",
        tenantPhone: "+254700009011",
        tenancyStart: new Date().toISOString().slice(0, 10),
        caretakerFirstName: "Care",
        caretakerLastName: "Taker",
        caretakerPhone: "+254700009012",
        caretakerEmail: "care@example.com",
      };
      const invalid = await portfolio("post", "/import/preview", {
        rows: [{ ...occupied, monthlyRentMinor: -1 }, occupied],
      });
      expect(invalid.body.data.valid).toBe(false);
      expect(
        invalid.body.data.errors.some((e: { row: number }) => e.row === 1),
      ).toBe(true);
      expect(
        invalid.body.data.errors.some((e: { row: number }) => e.row === 2),
      ).toBe(true);
      const valid = await portfolio("post", "/import/preview", {
        rows: [{ ...occupied, tenantEmail: "tenant@example.com" }, row("A2")],
      });
      expect(valid.body.data.valid, JSON.stringify(valid.body)).toBe(true);
      const payload = {
        rows: valid.body.data.rows,
        digest: valid.body.data.digest,
        confirm: true,
      };
      const imported = await portfolio("post", "/import/confirm", payload);
      expect(imported.status, JSON.stringify(imported.body)).toBe(201);
      expect(
        (await portfolio("post", "/import/confirm", payload)).body.data
          .replayed,
      ).toBe(true);
      const retry = await portfolio("post", "/import/preview", {
        rows: payload.rows,
      });
      expect(retry.body.data.replayed).toBe(true);
      const progress = (await portfolio("get", "")).body.data;
      expect(progress.facts).toMatchObject({
        properties: 1,
        units: 2,
        occupied: 1,
        vacant: 1,
        currentTenancies: 1,
        knownMonthlyRentMinor: 1250025,
        staff: 1,
      });
      expect(progress.brief.predictions).toEqual([]);
      expect(
        await mongoose.models.Payment!.countDocuments({ organizationId: org }),
      ).toBe(0);
      const tenant = await User.findOne({
          email: "tenant@example.com",
        }).orFail(),
        care = await User.findOne({ email: "care@example.com" }).orFail();
      expect(tenant.emailVerifiedAt).toBeUndefined();
      expect(care.emailVerifiedAt).toBeUndefined();
      const member = await OrganizationMembership.findOne({
        organizationId: org,
        userId: care._id,
      }).orFail();
      expect(member.scope.allProperties).toBe(false);
      expect(member.scope.propertyIds).toHaveLength(1);
      const next = await portfolio("post", "/import/preview", {
        rows: [row("A3")],
      });
      expect(next.body.data.summary.newProperties).toBe(0);
      expect(
        (
          await portfolio("post", "/import/confirm", {
            rows: next.body.data.rows,
            digest: next.body.data.digest,
            confirm: true,
          })
        ).status,
      ).toBe(201);
      expect(await Property.countDocuments({ organizationId: org })).toBe(1);
      expect(await Unit.countDocuments({ organizationId: org })).toBe(3);
    });
    it("commits 500-row batches atomically, resumes the next batch and does not duplicate hierarchy", async () => {
      await activate(501);
      const rows = Array.from({ length: 500 }, (_, i) => row("U" + i));
      const preview = await portfolio("post", "/import/preview", { rows });
      expect(preview.status).toBe(200);
      expect(preview.body.data.valid).toBe(true);
      const payload = {
        rows: preview.body.data.rows,
        digest: preview.body.data.digest,
        confirm: true,
      };
      const imported = await portfolio("post", "/import/confirm", payload);
      expect(imported.status, JSON.stringify(imported.body)).toBe(201);
      const next = await portfolio("post", "/import/preview", {
        rows: [row("U500")],
      });
      expect(
        (
          await portfolio("post", "/import/confirm", {
            rows: next.body.data.rows,
            digest: next.body.data.digest,
            confirm: true,
          })
        ).status,
      ).toBe(201);
      expect(
        (await portfolio("post", "/import/confirm", payload)).body.data
          .replayed,
      ).toBe(true);
      expect(await Property.countDocuments({ organizationId: org })).toBe(1);
      expect(await Unit.countDocuments({ organizationId: org })).toBe(501);
      const beyond = await portfolio("post", "/import/preview", {
        rows: [row("U501")],
      });
      expect(
        (
          await portfolio("post", "/import/confirm", {
            rows: beyond.body.data.rows,
            digest: beyond.body.data.digest,
            confirm: true,
          })
        ).status,
      ).toBe(403);
      expect(await Unit.countDocuments({ organizationId: org })).toBe(501);
    }, 60000);
    it("rejects imported contact takeover, digest tampering, duplicate units and foreign workspace access", async () => {
      await activate();
      const takeover = {
        ...row(),
        tenantFirstName: "Jane",
        tenantLastName: "Landlord",
        tenantPhone: "+254700009001",
        tenantEmail: "owner@example.com",
        tenancyStart: new Date().toISOString().slice(0, 10),
      };
      expect(
        (await portfolio("post", "/import/preview", { rows: [takeover] })).body
          .data.valid,
      ).toBe(false);
      const preview = await portfolio("post", "/import/preview", {
        rows: [row()],
      });
      expect(
        (
          await portfolio("post", "/import/confirm", {
            rows: preview.body.data.rows,
            digest: "0".repeat(64),
            confirm: true,
          })
        ).status,
      ).toBe(409);
      expect(await Property.countDocuments({ organizationId: org })).toBe(0);
      const other = await Organization.create({
          name: "Foreign",
          slug: "foreign",
        }),
        foreign = await User.create({
          firstName: "Other",
          lastName: "Owner",
          phone: "+254700009015",
        }),
        role = await Role.findOne({ key: "LANDLORD" }).orFail();
      await OrganizationMembership.create({
        organizationId: other._id,
        userId: foreign._id,
        roleIds: [role._id],
        scope: { allProperties: true },
      });
      const foreignToken = jwt.sign(
        { sub: String(foreign._id), type: "access" },
        env.JWT_ACCESS_SECRET,
      );
      for (const [method, suffix] of [
        ["get", ""],
        ["put", "/draft"],
        ["post", "/import/preview"],
        ["post", "/import/confirm"],
        ["post", "/dashboard-visit"],
      ] as const)
        expect(
          (
            await request(app)
              [method](portfolioPath(suffix))
              .auth(foreignToken, { type: "bearer" })
              .send(
                suffix === "/import/confirm"
                  ? {
                      rows: preview.body.data.rows,
                      digest: preview.body.data.digest,
                      confirm: true,
                    }
                  : suffix === "/import/preview"
                    ? { rows: [row()] }
                    : {},
              )
          ).status,
        ).toBe(403);
    });
    it("keeps reminders off, applies opt-in, preference, cooldown and bounded event delivery when explicitly configured in tests", async () => {
      expect(env.ONBOARDING_RECOVERY_ENABLED).toBe(false);
      expect(
        await Job.countDocuments({ type: "domain-event.onboarding-recovery" }),
      ).toBe(0);
      const event = await mongoose.models
        .DomainEvent!.findOne({
          organizationId: org,
          name: "landlord.email.verified",
        })
        .orFail();
      expect(
        await OnboardingRecoveryService.consume(
          event.eventId,
          new Types.ObjectId(org),
        ),
      ).toMatchObject({ skipped: "DISABLED" });
      expect(
        await Notification.countDocuments({ type: "ONBOARDING_RECOVERY" }),
      ).toBe(0);
      env.ONBOARDING_RECOVERY_ENABLED = true;
      env.ONBOARDING_RECOVERY_APPROVAL_CASE = "isolated-test-only";
      expect(
        (
          await OnboardingRecoveryService.consume(
            event.eventId,
            new Types.ObjectId(org),
          )
        ).queued,
      ).toBe(false);
      await Organization.updateOne(
        { _id: org },
        { $set: { "settings.onboardingRecovery.emailOptIn": true } },
      );
      await NotificationPreference.create({
        organizationId: org,
        userId: owner.userId,
        eventType: "ONBOARDING_RECOVERY",
        enabled: false,
        channels: ["EMAIL"],
      });
      expect(
        (
          await OnboardingRecoveryService.consume(
            event.eventId,
            new Types.ObjectId(org),
          )
        ).queued,
      ).toBe(false);
      await NotificationPreference.updateOne(
        { organizationId: org },
        { $set: { enabled: true } },
      );
      expect(
        (
          await OnboardingRecoveryService.consume(
            event.eventId,
            new Types.ObjectId(org),
          )
        ).queued,
      ).toBe(true);
      expect(
        (
          await OnboardingRecoveryService.consume(
            event.eventId,
            new Types.ObjectId(org),
          )
        ).queued,
      ).toBe(false);
      expect(
        await Notification.countDocuments({ type: "ONBOARDING_RECOVERY" }),
      ).toBe(1);
      const notice = await Notification.findOne({
        type: "ONBOARDING_RECOVERY",
      }).orFail();
      expect(
        await OnboardingRecoveryService.mayDeliver(
          new Types.ObjectId(org),
          owner.userId,
          notice.data.get("stage"),
          notice.data.get("approvalCase"),
        ),
      ).toBe(true);
      await NotificationPreference.updateOne(
        { organizationId: org },
        { $set: { enabled: false } },
      );
      expect(
        await OnboardingRecoveryService.mayDeliver(
          new Types.ObjectId(org),
          owner.userId,
          notice.data.get("stage"),
          notice.data.get("approvalCase"),
        ),
      ).toBe(false);
      await expect(
        OnboardingRecoveryService.consume(event.eventId, new Types.ObjectId()),
      ).rejects.toMatchObject({ code: "RECOVERY_EVENT_NOT_FOUND" });
      expect(
        enqueueJobSchema.safeParse({
          type: "domain-event.onboarding-recovery",
          payload: { eventId: event.eventId },
        }).success,
      ).toBe(false);
    });
    it("requires owner email proof for agreement signature and checkout", async () => {
      await User.updateOne(
        { _id: owner.userId },
        { $unset: { emailVerifiedAt: 1 } },
      );
      const state = await generate();
      expect(
        (
          await call("/signature", {
            contractId: state.contract._id,
            documentHash: state.contract.sha256,
            signatoryName: "Jane Landlord",
            authorityConfirmed: true,
            termsAccepted: true,
          })
        ).status,
      ).toBe(403);
      expect((await call("/checkout")).status).toBe(403);
    });

    it("rolls back failed import audits and serializes manual unit creation against the remaining signed capacity", async () => {
      await activate(2);
      const preview = await portfolio("post", "/import/preview", {
        rows: [row()],
      });
      const payload = {
        rows: preview.body.data.rows,
        digest: preview.body.data.digest,
        confirm: true,
      };
      const failure = vi
        .spyOn(AuditService, "record")
        .mockRejectedValueOnce(new Error("Isolated import audit failure"));
      expect((await portfolio("post", "/import/confirm", payload)).status).toBe(
        500,
      );
      failure.mockRestore();
      expect(await Unit.countDocuments({ organizationId: org })).toBe(0);
      expect(await Property.countDocuments({ organizationId: org })).toBe(0);
      expect((await portfolio("post", "/import/confirm", payload)).status).toBe(
        201,
      );
      const first = await Unit.findOne({ organizationId: org }).orFail();
      const second = await portfolio("post", "/import/preview", {
        rows: [row("A2")],
      });
      const manual = {
        floorId: String(first.floorId),
        name: "Manual third",
        code: "A3",
        unitType: "ONE_BEDROOM",
        monthlyRent: 12500.25,
      };
      const results = await Promise.all([
        portfolio("post", "/import/confirm", {
          rows: second.body.data.rows,
          digest: second.body.data.digest,
          confirm: true,
        }),
        request(app)
          .post("/api/v1/organizations/" + org + "/units")
          .auth(token, { type: "bearer" })
          .send(manual),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([201, 403]);
      expect(await Unit.countDocuments({ organizationId: org })).toBe(2);
      expect(
        (
          await request(app)
            .patch("/api/v1/units/" + first._id)
            .auth(token, { type: "bearer" })
            .send({ status: "INACTIVE" })
        ).status,
      ).toBe(200);
      expect(
        (
          await request(app)
            .post("/api/v1/organizations/" + org + "/units")
            .auth(token, { type: "bearer" })
            .send({ ...manual, code: "A4" })
        ).status,
      ).toBe(201);
      expect(
        (
          await request(app)
            .patch("/api/v1/units/" + first._id)
            .auth(token, { type: "bearer" })
            .send({ status: "VACANT" })
        ).status,
      ).toBe(403);
      expect((await Unit.findById(first._id).orFail()).status).toBe("INACTIVE");
    });

    async function generate(unitCount = 55) {
      const configured = await request(app)
        .put(path("/details"))
        .auth(token, { type: "bearer" })
        .send({
          legalName: "Acacia Holdings Limited",
          legalIdentifier: "REG-2026-001",
          billingEmail: "owner@example.com",
          unitCount,
        });
      expect(configured.status, JSON.stringify(configured.body)).toBe(200);
      const generated = await call("/contract", {
        planKey: "CONTROL",
        prepaidMonths: 3,
        expectedRevision: configured.body.data.revision,
      });
      expect(generated.status, JSON.stringify(generated.body)).toBe(200);
      return generated.body.data;
    }
    async function sign(unitCount = 55) {
      const state = await generate(unitCount);
      const signed = await call("/signature", {
        contractId: state.contract._id,
        documentHash: state.contract.sha256,
        signatoryName: "Jane Landlord",
        authorityConfirmed: true,
        termsAccepted: true,
      });
      expect(signed.status, JSON.stringify(signed.body)).toBe(200);
      return signed.body.data;
    }
    async function checkout(unitCount = 55) {
      await sign(unitCount);
      const response = await call("/checkout");
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      return response.body.data;
    }
    function charge(
      state: {
        subscription: { providerCheckoutReference: string };
        invoice: { totalMinor: number };
      },
      amount?: number,
    ) {
      return {
        event: "charge.success",
        data: {
          status: "success",
          reference: state.subscription.providerCheckoutReference,
          amount: amount ?? state.invoice.totalMinor,
          currency: "KES",
          paid_at: new Date().toISOString(),
          customer: { customer_code: "CUS_contract" },
          authorization: {
            authorization_code: "AUTH_test_fixture",
            reusable: true,
          },
        },
      };
    }
    async function signedWebhook(body: unknown) {
      const raw = Buffer.from(JSON.stringify(body)),
        signature = createHmac("sha512", integrationConfig.paystack.secretKey!)
          .update(raw)
          .digest("hex");
      await IntegrationService.handleWebhook("PAYSTACK", raw, signature);
    }
    it("completes new signup, owner step-up, pricing, contract, signature, invoice, verified payment and property access", async () => {
      const initialStatus = (
        await request(app).get(path()).auth(token, { type: "bearer" })
      ).body.data;
      expect(initialStatus.state).toBe("ACCOUNT_CREATED");
      expect(initialStatus.organization.pilotPrepared).toBe(false);
      const login = await request(app)
        .post("/api/v1/auth/login")
        .send({
          method: "email",
          email: "owner@example.com",
          password: "Secure-test-password-2026!",
        });
      expect(login.body.data.accountOtpRequired).toBe(true);
      const verification = await request(app)
        .post("/api/v1/auth/account-otp/verify")
        .send({
          challengeToken: login.body.data.challengeToken,
          channel: "EMAIL",
          code: deliveredOtp,
        });
      expect(verification.status).toBe(200);
      token = verification.body.data.accessToken;
      const propertyInput = {
        name: "First Property",
        code: "FIRST",
        propertyType: "APARTMENT",
        address: {
          addressLine1: "Test Road",
          city: "Nairobi",
          country: "Kenya",
        },
      };
      expect(
        (
          await request(app)
            .post(`/api/v1/organizations/${org}/properties`)
            .auth(token, { type: "bearer" })
            .send(propertyInput)
        ).status,
      ).toBe(402);
      const state = await checkout();
      expect(state.state).toBe("PAYMENT_PENDING");
      expect(state.invoice.total).toBe(33000);
      expect(state.contract.body).toContain("Acacia Holdings Limited");
      expect(state.contract.body).toContain("33000.00");
      expect(
        PaystackBillingProvider.prototype.retryCheckout,
      ).toHaveBeenCalledWith(
        "PLN_contract",
        expect.objectContaining({
          initialAmount: 33000,
          amount: 11000,
          prepaidMonths: 3,
        }),
      );
      await signedWebhook(charge(state));
      const activated = (
        await request(app).get(path()).auth(token, { type: "bearer" })
      ).body.data;
      expect(activated.state).toBe("ACTIVE");
      expect(activated.nextStep).toBe("COMPLETE");
      expect(activated.invoice.status).toBe("PAID");
      expect(activated.subscription.renewalState).toBe("SCHEDULED");
      expect(
        PaystackBillingProvider.prototype.scheduleRenewal,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          startsAt: new Date(activated.subscription.currentPeriodEnd),
        }),
      );
      expect(
        (
          await request(app)
            .post(`/api/v1/organizations/${org}/properties`)
            .auth(token, { type: "bearer" })
            .send(propertyInput)
        ).status,
      ).toBe(201);
      expect(
        await AuditLog.countDocuments({
          organizationId: org,
          "metadata.state": "ACTIVE",
        }),
      ).toBe(1);
      for (const [name, id] of [
        ["contract", activated.contract.documentId],
        ["signed-contract", activated.contract.signedDocumentId],
        ["invoice", activated.invoice.documentId],
        ["receipt", activated.invoice.receiptDocumentId],
      ]) {
        const doc = await Document.findById(id)
          .select("+artifactBody")
          .orFail();
        expect(hash(Buffer.from(doc.artifactBody!))).toBe(doc.sha256);
        expect(doc.immutableArtifact).toBe(true);
        expect(doc.renderVersion).toBe(2);
        expect(doc.storageKey).toMatch(/\/v2$/);
        if (process.env.PCC_PDF_QA_DIR)
          await writeFile(
            `${process.env.PCC_PDF_QA_DIR}/${name}.pdf`,
            Buffer.from(doc.artifactBody!),
          );
        const downloaded = await request(app)
          .get(`/api/v1/documents/${id}/pdf`)
          .auth(token, { type: "bearer" });
        expect(downloaded.status).toBe(200);
        expect(downloaded.headers["content-type"]).toContain("application/pdf");
      }
      expect(await Evidence.countDocuments({ organizationId: org })).toBe(4);
    });
    it("persists resume state and makes generation, signing, checkout and duplicate provider events idempotent", async () => {
      const state = await checkout();
      await call("/contract", {
        planKey: "CONTROL",
        prepaidMonths: 3,
        expectedRevision: 0,
      });
      const repeat = await call("/signature", {
        contractId: state.contract._id,
        documentHash: state.contract.sha256,
        signatoryName: "Jane Landlord",
        authorityConfirmed: true,
        termsAccepted: true,
      });
      expect(repeat.status).toBe(200);
      await call("/checkout");
      expect(
        PaystackBillingProvider.prototype.retryCheckout,
      ).toHaveBeenCalledTimes(1);
      const event = charge(state);
      await signedWebhook(event);
      await signedWebhook(event);
      expect(
        await OrganizationContract.countDocuments({ organizationId: org }),
      ).toBe(1);
      expect(
        await SubscriptionInvoice.countDocuments({ organizationId: org }),
      ).toBe(1);
      expect(await BillingEvent.countDocuments({ organizationId: org })).toBe(
        1,
      );
      expect(
        PaystackBillingProvider.prototype.scheduleRenewal,
      ).toHaveBeenCalledTimes(1);
    });
    it("rejects unsigned checkout, bad hashes, missing authority and frontend activation claims", async () => {
      const state = await generate();
      expect((await call("/checkout")).status).toBe(409);
      const valid = {
        contractId: state.contract._id,
        documentHash: state.contract.sha256,
        signatoryName: "Jane Landlord",
        authorityConfirmed: true,
        termsAccepted: true,
      };
      expect(
        (await call("/signature", { ...valid, documentHash: "0".repeat(64) }))
          .status,
      ).toBe(409);
      expect(
        (await call("/signature", { ...valid, authorityConfirmed: false }))
          .status,
      ).toBe(400);
      expect(
        (await call("/signature", { ...valid, state: "ACTIVE" })).status,
      ).toBe(400);
      expect(
        (await Organization.findById(org).orFail()).onboarding!.state,
      ).toBe("CONTRACT_PENDING_SIGNATURE");
    });
    it("prevents cross-organization reads, invoice access, signatures, onboarding edits, activation and PDFs", async () => {
      const state = await sign(),
        other = await Organization.create({
          name: "Other organization",
          slug: "other-org",
          onboarding: { state: "ACCOUNT_CREATED" },
        });
      const otherOwner = await User.create({
        phone: "+254700009003",
        email: "other-owner@example.com",
        emailVerifiedAt: new Date(),
        firstName: "Other",
        lastName: "Owner",
      });
      const role = await Role.findOne({ key: "LANDLORD" }).orFail();
      await OrganizationMembership.create({
        organizationId: other._id,
        userId: otherOwner._id,
        roleIds: [role._id],
        scope: { allProperties: true },
      });
      const otherToken = jwt.sign(
        { sub: String(otherOwner._id), type: "access" },
        env.JWT_ACCESS_SECRET,
      );
      for (const suffix of ["", "/quote?planKey=CONTROL&prepaidMonths=3"])
        expect(
          (
            await request(app)
              .get(path(suffix))
              .auth(otherToken, { type: "bearer" })
          ).status,
        ).toBe(403);
      for (const suffix of [
        "/contract",
        "/signature",
        "/checkout",
        "/reconcile",
      ])
        expect(
          (
            await request(app)
              .post(path(suffix))
              .auth(otherToken, { type: "bearer" })
              .send({})
          ).status,
        ).toBe(403);
      expect(
        (
          await request(app)
            .put(path("/details"))
            .auth(otherToken, { type: "bearer" })
            .send({})
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .get(`/api/v1/billing/organizations/${org}/invoices`)
            .auth(otherToken, { type: "bearer" })
        ).status,
      ).toBe(403);
      for (const id of [
        state.contract.documentId,
        state.contract.signedDocumentId,
        state.invoice.documentId,
      ])
        expect(
          (
            await request(app)
              .get(`/api/v1/documents/${id}/pdf`)
              .auth(otherToken, { type: "bearer" })
          ).status,
        ).toBe(403);
      const injected = await request(app)
        .post(
          `/api/v1/organizations/${other._id}/landlord-onboarding/signature`,
        )
        .auth(otherToken, { type: "bearer" })
        .send({
          contractId: state.contract._id,
          documentHash: state.contract.sha256,
          signatoryName: "Other Owner",
          authorityConfirmed: true,
          termsAccepted: true,
        });
      expect(injected.status).toBe(404);
      expect(
        (await Organization.findById(other._id).orFail()).onboarding!.state,
      ).toBe("ACCOUNT_CREATED");
    });
    it("keeps signed contracts, template versions, invoice amounts and retained PDFs immutable, including for Super Admin", async () => {
      const state = await sign();
      const contract = await OrganizationContract.findById(
        state.contract._id,
      ).orFail();
      contract.body = "changed";
      await expect(contract.save()).rejects.toThrow(
        "SIGNED_CONTRACT_IMMUTABLE",
      );
      await expect(
        OrganizationContract.findByIdAndUpdate(contract._id, {
          body: "changed",
        }),
      ).rejects.toThrow("CONTRACT_SNAPSHOT_IMMUTABLE");
      const invoice = await SubscriptionInvoice.findById(
        state.invoice._id,
      ).orFail();
      invoice.total += 1;
      await expect(invoice.save()).rejects.toThrow(
        "INVOICE_SNAPSHOT_IMMUTABLE",
      );
      const edit = await request(app)
        .patch(`/api/v1/documents/${state.contract.signedDocumentId}`)
        .auth(adminToken, { type: "bearer" })
        .send({ title: "Rewritten" });
      expect(edit.status).toBe(409);
      await expect(
        Document.updateMany({}, { status: "ARCHIVED" }),
      ).rejects.toThrow("DOCUMENT_ARTIFACT_IMMUTABLE");
      const template = await ContractTemplate.findOne({
        status: "ACTIVE",
      }).orFail();
      template.body = "changed";
      await expect(template.save()).rejects.toThrow(
        "CONTRACT_TEMPLATE_VERSION_IMMUTABLE",
      );
      const impersonate = await request(app)
        .post(path("/signature"))
        .auth(adminToken, { type: "bearer" })
        .send({
          contractId: state.contract._id,
          documentHash: state.contract.sha256,
          signatoryName: "Admin",
          authorityConfirmed: true,
          termsAccepted: true,
        });
      expect(impersonate.status).toBe(403);
    });
    it("retains historical bytes and prices after a new template is published and the catalog changes", async () => {
      const state = await sign(),
        before = await Document.findById(state.contract.signedDocumentId)
          .select("+artifactBody")
          .orFail();
      const newer = await ContractTemplateService.create(admin, {
        ...defaultContractDraft,
        version: 2,
        body: defaultContractDraft.body + "\nNew commercial review clause.",
        effectiveAt: new Date("2026-01-02"),
        variables: [...contractVariables],
      });
      await ContractTemplateService.status(admin, String(newer!._id), "ACTIVE");
      await SubscriptionPlan.updateOne({ key: "CONTROL" }, { amount: 20000 });
      const after = await Document.findById(state.contract.signedDocumentId)
        .select("+artifactBody")
        .orFail();
      expect(
        Buffer.from(after.artifactBody!).equals(
          Buffer.from(before.artifactBody!),
        ),
      ).toBe(true);
      expect(
        (await OrganizationContract.findById(state.contract._id).orFail())
          .templateVersion,
      ).toBe(1);
      expect(
        (await SubscriptionInvoice.findById(state.invoice._id).orFail()).total,
      ).toBe(33000);
      expect(
        (await ContractTemplate.findOne({ version: 1 }).orFail()).status,
      ).toBe("RETIRED");
    });
    it("allows only an explicit audited pre-payment replacement and retains the signed predecessor and void invoice", async () => {
      const state = await sign();
      await OrganizationSubscription.updateOne(
        { organizationId: org },
        {
          providerPlanCode: "PLN_unused_predecessor",
          providerCustomerId: "CUS_unused_predecessor",
        },
      );
      const replacement = await call("/replacement", {
        planKey: "CONTROL",
        prepaidMonths: 6,
        expectedRevision: state.revision,
        reason: "Owner requested six prepaid months.",
        details: {
          legalName: "Corrected Acacia Holdings",
          legalIdentifier: "REG-CORRECTED",
          billingEmail: "owner@example.com",
          unitCount: 55,
        },
      });
      expect(replacement.status, JSON.stringify(replacement.body)).toBe(200);
      expect(
        replacement.body.data.subscription.providerPlanCode,
      ).toBeUndefined();
      expect(replacement.body.data.contract.body).toContain(
        "Corrected Acacia Holdings",
      );
      expect(replacement.body.data.contract.replacesContractId).toBe(
        state.contract._id,
      );
      expect(replacement.body.data.contract.status).toBe("PENDING_SIGNATURE");
      expect(replacement.body.data.invoice.total).toBe(66000);
      expect(
        (await OrganizationContract.findById(state.contract._id).orFail())
          .status,
      ).toBe("SIGNED");
      expect(
        (await SubscriptionInvoice.findById(state.invoice._id).orFail()).status,
      ).toBe("VOID");
      expect(
        await AuditLog.countDocuments({
          "metadata.replacesContractId": state.contract._id,
        }),
      ).toBeGreaterThan(0);
    });
    it("rejects wrong amount, invalid webhook signatures and manual payment bypass without activating", async () => {
      const state = await checkout();
      await expect(signedWebhook(charge(state, 1))).rejects.toMatchObject({
        code: "PROVIDER_AMOUNT_MISMATCH",
      });
      await expect(
        IntegrationService.handleWebhook(
          "PAYSTACK",
          Buffer.from(JSON.stringify(charge(state))),
          "invalid",
        ),
      ).rejects.toThrow();
      const manual = await request(app)
        .post(
          `/api/v1/billing/organizations/${org}/invoices/${state.invoice._id}/mark-paid`,
        )
        .auth(adminToken, { type: "bearer" })
        .send({ amount: 33000 });
      expect(manual.status).toBe(409);
      expect(
        (await Organization.findById(org).orFail()).onboarding!.state,
      ).toBe("PAYMENT_PENDING");
      expect(
        (await SubscriptionInvoice.findById(state.invoice._id).orFail()).status,
      ).toBe("OPEN");
    });
    it("rolls back invoice, receipt, activation and events when the atomic audit fails, then recovers via webhook retry", async () => {
      const state = await checkout(),
        event = charge(state),
        record = vi
          .spyOn(AuditService, "record")
          .mockRejectedValueOnce(new Error("audit unavailable"));
      await expect(signedWebhook(event)).rejects.toThrow("audit unavailable");
      record.mockRestore();
      expect(
        (await SubscriptionInvoice.findById(state.invoice._id).orFail()).status,
      ).toBe("OPEN");
      expect(
        (await Organization.findById(org).orFail()).onboarding!.state,
      ).toBe("PAYMENT_PENDING");
      expect(await Document.countDocuments({ organizationId: org })).toBe(3);
      await signedWebhook(event);
      expect(
        (await Organization.findById(org).orFail()).onboarding!.state,
      ).toBe("ACTIVE");
    });
    it("verifies payment on server reconciliation when a webhook is delayed", async () => {
      const state = await checkout(),
        body = charge(state);
      vi.spyOn(PaystackProvider.prototype, "query").mockResolvedValue({
        provider: "PAYSTACK",
        providerTransactionId: body.data.reference,
        status: "CONFIRMED",
        amountMinorUnits: body.data.amount,
        currency: "KES",
        paidAt: new Date(body.data.paid_at),
        raw: body.data,
      });
      const result = await BillingService.reconcile();
      expect(result.prepaid.verified).toBe(1);
      expect(
        (await Organization.findById(org).orFail()).onboarding!.state,
      ).toBe("ACTIVE");
    });
    it("preserves failed payment progress, safely creates a replacement checkout, and never duplicates invoices", async () => {
      const state = await checkout();
      vi.spyOn(PaystackProvider.prototype, "query").mockResolvedValue({
        provider: "PAYSTACK",
        providerTransactionId: state.subscription.providerCheckoutReference,
        status: "FAILED",
      });
      await BillingService.reconcile();
      expect(
        (await Organization.findById(org).orFail()).onboarding!.attentionCode,
      ).toBe("PAYMENT_FAILED");
      const recovered = await call("/reconcile");
      expect(recovered.status, JSON.stringify(recovered.body)).toBe(200);
      expect(recovered.body.data.subscription.providerCheckoutReference).toBe(
        "recovered-checkout",
      );
      expect(
        await SubscriptionInvoice.countDocuments({ organizationId: org }),
      ).toBe(1);
      expect(
        (await Organization.findById(org).orFail()).onboarding!.state,
      ).toBe("PAYMENT_PENDING");
    });
    it("shows admin progress and evidence while denying non-admin oversight and scoped staff signing", async () => {
      const state = await sign();
      const oversight = await request(app)
        .get("/api/v1/platform-control/landlord-onboarding")
        .auth(adminToken, { type: "bearer" });
      expect(oversight.status).toBe(200);
      expect(oversight.body.data.items[0].onboarding.state).toBe(
        "INVOICE_ISSUED",
      );
      expect(
        (
          await request(app)
            .get("/api/v1/platform-control/landlord-onboarding")
            .auth(token, { type: "bearer" })
        ).status,
      ).toBe(403);
      const role = await Role.create({
        name: "Manager",
        key: "PROPERTY_MANAGER",
        system: true,
        permissions,
      });
      await OrganizationMembership.updateOne(
        { organizationId: org, userId: owner.userId },
        { roleIds: [role._id], scope: { allProperties: true } },
      );
      expect(
        (
          await call("/signature", {
            contractId: state.contract._id,
            documentHash: state.contract.sha256,
            signatoryName: "Jane Manager",
            authorityConfirmed: true,
            termsAccepted: true,
          })
        ).status,
      ).toBe(403);
    });
    it("collects correctly priced monthly renewals only after the prepaid term and retains renewal PDFs", async () => {
      const state = await checkout();
      await signedWebhook(charge(state));
      const subscription = await OrganizationSubscription.findOne({
        organizationId: org,
      }).orFail();
      const renewal = {
        event: "charge.success",
        data: {
          status: "success",
          reference: "renewal-test-1",
          subscription: { subscription_code: "SUB_contract" },
          amount: 1100000,
          currency: "KES",
          paid_at: subscription.currentPeriodEnd.toISOString(),
        },
      };
      await signedWebhook(renewal);
      await signedWebhook(renewal);
      const invoice = await SubscriptionInvoice.findOne({
        providerInvoiceId: "renewal-test-1",
      }).orFail();
      expect(invoice.total).toBe(11000);
      expect(invoice.documentId).toBeTruthy();
      expect(invoice.receiptDocumentId).toBeTruthy();
      expect(
        (
          await OrganizationSubscription.findById(subscription._id).orFail()
        ).currentPeriodEnd.toISOString(),
      ).toBe(addMonths(subscription.currentPeriodEnd, 1).toISOString());
      expect(
        await SubscriptionInvoice.countDocuments({ organizationId: org }),
      ).toBe(2);
    });
    it("flags ambiguous remote renewal submission without repeating the debit schedule", async () => {
      const state = await checkout();
      vi.mocked(
        PaystackBillingProvider.prototype.scheduleRenewal,
      ).mockRejectedValue(new Error("network timeout"));
      await signedWebhook(charge(state));
      expect(
        (
          await OrganizationSubscription.findOne({
            organizationId: org,
          }).orFail()
        ).renewalState,
      ).toBe("REQUIRES_ATTENTION");
      vi.spyOn(
        PaystackBillingProvider.prototype,
        "findRenewal",
      ).mockResolvedValue(undefined);
      await BillingService.reconcile();
      expect(
        PaystackBillingProvider.prototype.scheduleRenewal,
      ).toHaveBeenCalledTimes(1);
      expect(
        (await Organization.findById(org).orFail()).onboarding!.state,
      ).toBe("ACTIVE");
    });
    it("supports concurrent duplicate generation and multiple unpaid organizations without provider index collisions", async () => {
      await request(app)
        .put(path("/details"))
        .auth(token, { type: "bearer" })
        .send({
          legalName: "Acacia Holdings",
          legalIdentifier: "REG-A",
          billingEmail: "owner@example.com",
          unitCount: 50,
        });
      const input = {
        planKey: "CONTROL",
        prepaidMonths: 3,
        expectedRevision: 1,
      };
      const responses = await Promise.all([
        call("/contract", input),
        call("/contract", input),
      ]);
      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      expect(
        await OrganizationContract.countDocuments({ organizationId: org }),
      ).toBe(1);
      const second = await Organization.create({
        name: "Second",
        slug: "second",
        onboarding: {
          state: "ORGANIZATION_CONFIGURED",
          revision: 1,
          legalName: "Second Legal",
          legalIdentifier: "REG-B",
          billingEmail: "second@example.com",
          unitCount: 50,
        },
      });
      const secondOwner = {
        ...owner,
        memberships: [{ ...owner.memberships[0]!, organizationId: second._id }],
      };
      await LandlordOnboardingService.generate(
        secondOwner,
        String(second._id),
        input,
      );
      expect(await SubscriptionInvoice.countDocuments({ status: "OPEN" })).toBe(
        2,
      );
    });
  },
);
