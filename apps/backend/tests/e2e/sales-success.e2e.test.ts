import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose, { Types } from "mongoose";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { completedAdminFixture } from "../helpers/admin-assurance.js";
import { User } from "../../src/database/models/User.js";
import { Role } from "../../src/database/models/Role.js";
import { OrganizationMembership } from "../../src/database/models/OrganizationMembership.js";
import { Organization } from "../../src/database/models/Organization.js";
import { SalesLead } from "../../src/database/models/SalesLead.js";
import { SalesMeeting } from "../../src/database/models/SalesMeeting.js";
import { SalesActivity } from "../../src/database/models/SalesActivity.js";
import { AuditLog } from "../../src/database/models/AuditLog.js";
import { SubscriptionPlan } from "../../src/database/models/SubscriptionPlan.js";
import { OrganizationSubscription } from "../../src/database/models/OrganizationSubscription.js";
import { SubscriptionInvoice } from "../../src/database/models/SubscriptionInvoice.js";
import { OrganizationContract } from "../../src/database/models/OrganizationContract.js";
import { Property } from "../../src/database/models/Property.js";
import { Unit } from "../../src/database/models/Unit.js";
import { DomainEvent } from "../../src/database/models/DomainEvent.js";
import { SalesSuccessService as service } from "../../src/modules/sales/sales-success.service.js";
import { SalesDelegationService } from "../../src/modules/sales/sales-delegation.service.js";
import type { AuthenticatedUser } from "../../src/core/types/auth.js";

describe.skipIf(!process.env.RUN_E2E)(
  "Sales success authenticated persistence",
  () => {
    let mongo: MongoMemoryReplSet,
      token: string,
      staffToken: string,
      admin: AuthenticatedUser,
      staff: Types.ObjectId,
      org: Types.ObjectId;
    const app = createApp(),
      base = "/api/v1/sales/success";
    const input = {
      name: "Acacia Customer",
      email: "acacia@example.test",
      properties: 3,
      units: "120",
      challenge: "Migrate tenant records carefully",
      source: "Referral",
    };
    const call = (
      method: "get" | "post" | "patch",
      path: string,
      body?: unknown,
      auth = token,
    ) =>
      request(app)
        [method](base + path)
        .auth(auth, { type: "bearer" })
        .send(body);
    async function create() {
      const r = await call("post", "/customers", input);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return r.body.data.id as string;
    }
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
        Role,
        OrganizationMembership,
        Organization,
        SalesLead,
        SalesMeeting,
        SalesActivity,
        AuditLog,
        SubscriptionPlan,
        OrganizationSubscription,
        SubscriptionInvoice,
        OrganizationContract,
        Property,
        Unit,
        DomainEvent,
      ])
        await model.init();
    }, 180000);
    afterAll(async () => {
      await mongoose.disconnect();
      await mongo?.stop();
    });
    beforeEach(async () => {
      for (const c of Object.values(mongoose.connection.collections))
        await c.deleteMany({});
      const u = await User.create({
        phone: "+254700006501",
        email: "sales-admin@example.test",
        firstName: "Sales",
        lastName: "Admin",
        isPlatformAdmin: true,
      });
      token = await completedAdminFixture(u._id);
      admin = {
        userId: u._id,
        isPlatformAdmin: true,
        sessionId: new Types.ObjectId(
          (jwt.decode(token) as { sid: string }).sid,
        ),
        mfaVerifiedAt: new Date(),
        adminDualChannel: true,
        memberships: [],
      };
      const s = await User.create({
        phone: "+254700006502",
        email: "sales-staff@example.test",
        firstName: "Sales",
        lastName: "Staff",
      });
      staff = s._id;
      org = (
        await Organization.create({
          name: "Customer Org",
          slug: "customer-org",
          onboarding: { ownerUserId: staff, unitCount: 100 },
        })
      )._id;
      const r = await Role.create({
        key: "LANDLORD",
        name: "Owner",
        system: true,
        permissions: [
          "role.create",
          "role.update",
          "role.assign",
          "organization.members.manage",
        ],
        organizationId: null,
      });
      await OrganizationMembership.create({
        userId: staff,
        organizationId: org,
        roleIds: [r._id],
        scope: { allProperties: true },
      });
      staffToken = jwt.sign(
        { sub: String(staff), type: "access" },
        env.JWT_ACCESS_SECRET,
      );
    });
    it("requires authentication and denies ordinary roles, including direct customer and agent requests", async () => {
      expect((await request(app).get(base + "/customers")).status).toBe(401);
      const id = await create();
      for (const path of [
        "/customers",
        "/customers/" + id,
        "/agents",
        "/customers/" + id + "/onboarding",
      ])
        expect((await call("get", path, undefined, staffToken)).status).toBe(
          403,
        );
      expect(
        (
          await call(
            "post",
            "/permissions",
            {
              organizationId: String(org),
              userId: String(staff),
              permissions: ["sales.leads.read"],
            },
            staffToken,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await call("post", "/customers", {
            ...input,
            name: "Malicious",
            assignedTo: String(staff),
          })
        ).status,
      ).toBe(400);
    });
    it("persists lead qualification, detects contact duplicates, and rejects stale writes", async () => {
      const id = await create();
      expect((await call("post", "/customers", input)).status).toBe(409);
      expect(
        (
          await call("post", "/customers", {
            ...input,
            email: "different@example.test",
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await call("patch", "/customers/" + id, {
            revision: 0,
            leadStatus: "Qualified",
            nextAction: "Offer migration briefing",
            consent: "OPTED_OUT",
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await call("patch", "/customers/" + id, {
            revision: 0,
            leadStatus: "New",
          })
        ).status,
      ).toBe(409);
      const view = await call("get", "/customers/" + id);
      expect(view.body.data.customer).toMatchObject({
        leadStatus: "Qualified",
        revision: 1,
        consent: "OPTED_OUT",
      });
      expect(
        await AuditLog.countDocuments({ action: "sales.lead.updated" }),
      ).toBe(1);
      expect((await call("get", "/customers?search=%5B")).status).toBe(200);
    });
    it("delegates only assigned records, limits operations, revokes immediately, and blocks alternate grant paths", async () => {
      const id = await create();
      await SalesDelegationService.grant(admin, {
        organizationId: String(org),
        userId: String(staff),
        permissions: ["sales.leads.read"],
      });
      expect(
        (await call("get", "/customers", undefined, staffToken)).body.data
          .total,
      ).toBe(0);
      expect(
        (await call("get", "/customers/" + id, undefined, staffToken)).status,
      ).toBe(404);
      await service.assign(admin, id, { userId: String(staff), revision: 0 });
      expect(
        (await call("get", "/customers/" + id, undefined, staffToken)).status,
      ).toBe(200);
      expect(
        (
          await call(
            "post",
            `/customers/${id}/notes`,
            { text: "Must not save" },
            staffToken,
          )
        ).status,
      ).toBe(403);
      const grant = await Role.findOne({
        key: `SALES_DELEGATE_${String(staff).toUpperCase()}`,
      });
      const roleResponse = await request(app)
        .patch(`/api/v1/roles/organization/${org}/${grant!._id}`)
        .auth(staffToken, { type: "bearer" })
        .send({ name: "Escalate", permissions: ["sales.leads.update"] });
      expect(roleResponse.status).toBe(403);
      await SalesDelegationService.grant(admin, {
        organizationId: String(org),
        userId: String(staff),
        permissions: [],
      });
      expect(
        (await call("get", "/customers/" + id, undefined, staffToken)).status,
      ).toBe(403);
      expect(
        await AuditLog.countDocuments({ action: "sales.permissions.changed" }),
      ).toBe(2);
      await expect(
        SalesDelegationService.grant({ ...admin, adminDualChannel: false }, {}),
      ).rejects.toMatchObject({ code: "FRESH_AUTH_REQUIRED" });
    });
    it("records meeting outcomes and preserves notes, rejecting overlaps, repeated outcomes and cross-customer IDs", async () => {
      const id = await create();
      const body = {
        representativeId: String(admin.userId),
        startsAt: "2026-11-10T10:00:00+03:00",
        endsAt: "2026-11-10T11:00:00+03:00",
        type: "DEMO",
        description: "Customer manages 120 units. Needs migration support.",
      };
      const r = await call("post", `/customers/${id}/meetings`, body);
      expect(r.status).toBe(201);
      expect(r.body.data.confirmationSent).toBe(false);
      expect(
        (await call("post", `/customers/${id}/meetings`, body)).status,
      ).toBe(409);
      const meeting = r.body.data.id;
      const outcome = {
        revision: 0,
        status: "COMPLETED",
        outcome: "Fort Knox discussed; migration assistance requested.",
        notes: "Follow up next Tuesday.",
      };
      expect(
        (
          await call(
            "patch",
            `/customers/${new Types.ObjectId()}/meetings/${meeting}`,
            outcome,
          )
        ).status,
      ).toBe(404);
      expect(
        (await call("patch", `/customers/${id}/meetings/${meeting}`, outcome))
          .status,
      ).toBe(200);
      expect(
        (await call("patch", `/customers/${id}/meetings/${meeting}`, outcome))
          .status,
      ).toBe(409);
      const view = (await call("get", "/customers/" + id)).body.data;
      expect(view.meetings[0]).toMatchObject({
        status: "COMPLETED",
        description: body.description,
      });
      expect(
        view.timeline.some(
          (a: { text: string }) => a.text === "Follow up next Tuesday.",
        ),
      ).toBe(true);
      const context = await call("post", `/customers/${id}/agent-context`, {
        agent: "MEETING_COORDINATOR",
      });
      expect(context.status).toBe(200);
      expect(context.body.data.executionEnabled).toBe(false);
      expect(JSON.stringify(context.body)).toContain("Follow up next Tuesday.");
      expect(JSON.stringify(context.body)).not.toContain("passwordHash");
    });
    it("serializes concurrent bookings and permits adjacent time slots", async () => {
      const id = await create();
      const body = {
        representativeId: String(admin.userId),
        startsAt: "2026-11-10T10:00:00Z",
        endsAt: "2026-11-10T11:00:00Z",
        type: "CALL",
      };
      const results = await Promise.all([
        service
          .meeting(admin, id, body)
          .then(() => 201)
          .catch((e) => e.statusCode),
        service
          .meeting(admin, id, body)
          .then(() => 201)
          .catch((e) => e.statusCode),
      ]);
      expect(results.sort()).toEqual([201, 409]);
      await expect(
        service.meeting(admin, id, {
          ...body,
          startsAt: body.endsAt,
          endsAt: "2026-11-10T12:00:00Z",
        }),
      ).resolves.toMatchObject({ confirmationSent: false });
    });
    it("does not expose notes to read-only delegates and rejects unauthorized agent context", async () => {
      const id = await create();
      await service.note(admin, id, { text: "Private meeting context" });
      await service.meeting(admin, id, {
        representativeId: String(admin.userId),
        startsAt: "2026-11-10T10:00:00Z",
        endsAt: "2026-11-10T11:00:00Z",
        type: "CALL",
        description: "Private meeting context",
      });
      await service.assign(admin, id, { userId: String(staff), revision: 0 });
      await SalesDelegationService.grant(admin, {
        organizationId: String(org),
        userId: String(staff),
        permissions: [
          "sales.leads.read",
          "sales.meetings.read",
          "sales.agents.read",
        ],
      });
      const view = await call("get", "/customers/" + id, undefined, staffToken);
      expect(view.body.data.timeline).toEqual([]);
      expect(JSON.stringify(view.body)).not.toContain(
        "Private meeting context",
      );
      expect(
        (
          await call(
            "post",
            `/customers/${id}/agent-context`,
            { agent: "CRM_INTELLIGENCE" },
            staffToken,
          )
        ).status,
      ).toBe(403);
    });
    it("reads actual scoped inventory and events, reports stalled onboarding, and never treats checkout as payment", async () => {
      const id = await create();
      await service.link(admin, id, {
        organizationId: String(org),
        revision: 0,
      });
      const old = new Date(Date.now() - 80 * 3600000);
      await Organization.collection.updateOne(
        { _id: org },
        { $set: { createdAt: old, "onboarding.stateChangedAt": old } },
      );
      const plan = await SubscriptionPlan.create({
        key: "CONTROL",
        name: "Control",
        currency: "KES",
        amount: 10000,
        billingInterval: "MONTH",
        entitlements: { maxUnits: 100 },
        active: true,
      });
      const sub = await OrganizationSubscription.create({
        organizationId: org,
        planId: plan._id,
        currentPeriodStart: old,
        currentPeriodEnd: new Date(Date.now() + 86400000),
        providerCheckoutReference: "pending-real-checkout",
        createdBy: admin.userId,
        updatedBy: admin.userId,
      });
      await DomainEvent.create({
        organizationId: org,
        eventId: "signup-event",
        name: "landlord.signup.created",
        aggregateType: "Organization",
        aggregateId: org,
        version: 1,
        payload: {},
        occurredAt: old,
      });
      const before = await service.monitor(admin, id);
      expect(before).toMatchObject({
        linked: true,
        registeredUnits: 0,
        checkoutStarted: true,
        verifiedPayment: false,
        stalled: true,
        completionPercent: 0,
      });
      if (!before.linked) throw new Error("Missing linked customer");
      expect(before.events?.[0]?.name).toBe("landlord.signup.created");
      const p = await Property.create({
        organizationId: org,
        name: "Real Court",
        code: "REAL",
        propertyType: "APARTMENT",
        address: { addressLine1: "1 Main", city: "Nairobi", country: "Kenya" },
        createdBy: admin.userId,
        updatedBy: admin.userId,
      });
      await Unit.create({
        organizationId: org,
        propertyId: p._id,
        buildingId: new Types.ObjectId(),
        floorId: new Types.ObjectId(),
        name: "A1",
        code: "A1",
        unitType: "STUDIO",
        monthlyRent: 12000,
        createdBy: admin.userId,
        updatedBy: admin.userId,
      });
      expect(await service.monitor(admin, id)).toMatchObject({
        registeredUnits: 1,
        properties: 1,
        remainingUnits: 99,
        completionPercent: 1,
        stalled: false,
        verifiedPayment: false,
      });
      const contractId = new Types.ObjectId(),
        invoiceId = new Types.ObjectId();
      // Trusted billing evidence is inserted only in the isolated database fixture.
      await OrganizationContract.collection.insertOne({
        _id: contractId,
        organizationId: org,
        status: "SIGNED",
      });
      await SubscriptionInvoice.collection.insertOne({
        _id: invoiceId,
        organizationId: org,
        subscriptionId: sub._id,
        contractId,
        status: "PAID",
        provider: "PAYSTACK",
        providerInvoiceId: "verified-provider-id",
      });
      await Organization.updateOne(
        { _id: org },
        {
          $set: {
            "onboarding.invoiceId": invoiceId,
            "onboarding.contractId": contractId,
            "onboarding.paymentVerifiedAt": new Date(),
          },
        },
      );
      expect(await service.monitor(admin, id)).toMatchObject({
        verifiedPayment: true,
      });
      const other = await service.create(admin, {
        ...input,
        email: "another@example.test",
      });
      await expect(
        service.link(admin, other.id, {
          organizationId: String(org),
          revision: 0,
        }),
      ).rejects.toMatchObject({ code: "ORGANIZATION_ALREADY_LINKED" });
    });
    it("reports all six agent integrations as unavailable without fake delivery", async () => {
      const r = await call("get", "/agents");
      expect(r.status).toBe(200);
      expect(r.body.data.agents).toHaveLength(6);
      expect(
        r.body.data.agents.every(
          (a: { executionEnabled: boolean }) => a.executionEnabled === false,
        ),
      ).toBe(true);
      expect(r.body.data.outboundSuspended).toBe(true);
    });
  },
);
