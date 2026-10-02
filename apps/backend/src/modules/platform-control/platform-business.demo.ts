import mongoose, { type Types } from "mongoose";
import { env } from "../../config/env.js";
import { DEMO_DATASET } from "./platform-business.schemas.js";
import { Organization } from "../../database/models/Organization.js";
import { OrganizationSubscription } from "../../database/models/OrganizationSubscription.js";
import { SubscriptionPlan } from "../../database/models/SubscriptionPlan.js";
import { SubscriptionInvoice } from "../../database/models/SubscriptionInvoice.js";
import { BillingEvent } from "../../database/models/BillingEvent.js";
import { Property } from "../../database/models/Property.js";
import { Building } from "../../database/models/Building.js";
import { Floor } from "../../database/models/Floor.js";
import { Unit } from "../../database/models/Unit.js";
import { SecurityCamera } from "../../database/models/SecurityCamera.js";
import { Incident } from "../../database/models/Incident.js";
import { Evidence } from "../../database/models/Evidence.js";
import { Job } from "../../database/models/Job.js";
import { Notification } from "../../database/models/Notification.js";
import { IntegrationAttempt } from "../../database/models/IntegrationAttempt.js";
import { AuditService } from "../audit/audit.service.js";
import { priceSnapshot, addMonths } from "../onboarding/contract-snapshot.js";

export async function seedPlatformBusinessDemo(
  actorUserId: Types.ObjectId,
  now = new Date(),
) {
  if (
    !["development", "test"].includes(env.NODE_ENV) ||
    !/(?:-demo|-test)$/.test(mongoose.connection.name)
  )
    throw new Error(
      "Demo seeding requires development/test and a database name ending -demo or -test",
    );
  const existing = await Organization.countDocuments({
    "settings.platformDemoDataset": DEMO_DATASET,
  });
  if (existing) return { created: 0, existing };
  const plans = await SubscriptionPlan.find({
    key: { $in: ["CONTROL", "FORT_KNOX"] },
  }).lean();
  if (plans.length !== 2)
    throw new Error(
      "Run the existing billing seed first; demo seeding never rewrites the commercial catalog",
    );
  const cases = [
    {
      name: "Acacia Control",
      plan: "CONTROL",
      units: 55,
      state: "ACTIVE",
      status: "ACTIVE",
      age: 25,
      paid: true,
    },
    {
      name: "Cedar Control",
      plan: "CONTROL",
      units: 24,
      state: "ACTIVE",
      status: "ACTIVE",
      age: 2,
      paid: true,
    },
    {
      name: "Lake Control",
      plan: "CONTROL",
      units: 15,
      state: "CONTRACT_PENDING_SIGNATURE",
      status: "PENDING",
      age: 5,
      paid: false,
    },
    {
      name: "Former Control",
      plan: "CONTROL",
      units: 8,
      state: "ACTIVE",
      status: "CANCELLED",
      age: 40,
      paid: false,
    },
    {
      name: "Citadel Fort Knox",
      plan: "FORT_KNOX",
      units: 80,
      state: "ACTIVE",
      status: "ACTIVE",
      age: 20,
      paid: true,
    },
    {
      name: "Summit Fort Knox",
      plan: "FORT_KNOX",
      units: 50,
      state: "ACTIVE",
      status: "ACTIVE",
      age: 1,
      paid: true,
    },
    {
      name: "Harbor Fort Knox",
      plan: "FORT_KNOX",
      units: 12,
      state: "PAYMENT_PENDING",
      status: "PENDING",
      age: 4,
      paid: false,
    },
    {
      name: "Paused Fort Knox",
      plan: "FORT_KNOX",
      units: 20,
      state: "ACTIVE",
      status: "ACTIVE",
      age: 15,
      paid: false,
      suspended: true,
    },
  ];
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const [index, item] of cases.entries()) {
        const plan = plans.find((p) => p.key === item.plan);
        if (!plan) throw new Error("Demo plan missing");
        const createdAt = new Date(now.getTime() - item.age * 86400000),
          snapshot = priceSnapshot(plan, item.units, 3);
        const organization = new Organization({
          name: "SIMULATED — " + item.name,
          slug: "platform-bi-demo-" + index,
          status: item.suspended ? "SUSPENDED" : "ACTIVE",
          settings: { platformDemoDataset: DEMO_DATASET },
          onboarding: {
            state: item.state,
            stateChangedAt: createdAt,
            unitCount: item.units,
            ...(item.state === "ACTIVE"
              ? { activatedAt: createdAt, paymentVerifiedAt: createdAt }
              : {}),
            ...(item.state === "PAYMENT_PENDING"
              ? { attentionCode: "PAYMENT_FAILED" }
              : {}),
          },
          createdAt,
          updatedAt: createdAt,
        });
        await organization.save({ session, timestamps: false });
        const subscription = new OrganizationSubscription({
          organizationId: organization._id,
          planId: plan._id,
          status: item.status,
          currentPeriodStart: createdAt,
          currentPeriodEnd: addMonths(createdAt, 3),
          provider: "INTERNAL",
          metadata: {
            commercialSnapshot: { ...snapshot, simulated: true },
            simulated: true,
          },
          createdBy: actorUserId,
          updatedBy: actorUserId,
          createdAt,
          updatedAt: createdAt,
        });
        await subscription.save({ session, timestamps: false });
        const invoice = new SubscriptionInvoice({
          organizationId: organization._id,
          subscriptionId: subscription._id,
          invoiceNumber: "DEMO-" + index,
          periodStart: createdAt,
          periodEnd: addMonths(createdAt, 3),
          subtotal: snapshot.totalMinor / 100,
          tax: 0,
          total: snapshot.totalMinor / 100,
          totalMinor: snapshot.totalMinor,
          amountPaid: item.paid ? snapshot.totalMinor / 100 : 0,
          currency: "KES",
          status: item.paid ? "PAID" : "OPEN",
          dueDate: createdAt,
          paidAt: item.paid ? createdAt : undefined,
          issuedAt: createdAt,
          provider: "INTERNAL",
          providerInvoiceId: item.paid ? "DEMO-PAYMENT-" + index : undefined,
          commercialSnapshot: { ...snapshot, simulated: true },
          createdBy: actorUserId,
          updatedBy: actorUserId,
          createdAt,
          updatedAt: createdAt,
        });
        await invoice.save({ session, timestamps: false });
        if (!organization.onboarding)
          throw new Error("Demo onboarding missing");
        organization.onboarding.invoiceId = invoice._id;
        await organization.save({ session, timestamps: false });
        if (item.paid)
          await BillingEvent.create(
            [
              {
                eventId: "platform-demo-" + index,
                organizationId: organization._id,
                provider: "INTERNAL",
                type: "INVOICE_PAID",
                externalReference: "DEMO-PAYMENT-" + index,
                status: "PROCESSED",
                processedAt: createdAt,
                payload: {
                  invoiceId: String(invoice._id),
                  totalMinor: snapshot.totalMinor,
                  currency: "KES",
                  simulated: true,
                },
              },
            ],
            { session },
          );
        if (index === 6)
          await BillingEvent.create(
            [
              {
                eventId: "platform-demo-failed-payment-6",
                organizationId: organization._id,
                provider: "INTERNAL",
                type: "PAYMENT_FAILED",
                externalReference: "DEMO-FAILED-PAYMENT-6",
                status: "PROCESSED",
                processedAt: createdAt,
                payload: { simulated: true, invoiceId: String(invoice._id) },
              },
            ],
            { session },
          );
        const [property] = await Property.create(
          [
            {
              organizationId: organization._id,
              name: item.name + " property",
              code: "DEMO-P",
              propertyType: "APARTMENT",
              address: {
                addressLine1: "Simulated road",
                city: "Nairobi",
                country: "KE",
              },
              createdBy: actorUserId,
              updatedBy: actorUserId,
              metadata: { simulated: true },
            },
          ],
          { session },
        );
        const [building] = await Building.create(
          [
            {
              organizationId: organization._id,
              propertyId: property._id,
              name: "Demo building",
              code: "DEMO-B",
              createdBy: actorUserId,
              updatedBy: actorUserId,
            },
          ],
          { session },
        );
        const [floor] = await Floor.create(
          [
            {
              organizationId: organization._id,
              propertyId: property._id,
              buildingId: building._id,
              name: "Demo floor",
              code: "DEMO-F",
              level: 0,
              createdBy: actorUserId,
              updatedBy: actorUserId,
            },
          ],
          { session },
        );
        await Unit.insertMany(
          Array.from({ length: item.units }, (_, n) => ({
            organizationId: organization._id,
            propertyId: property._id,
            buildingId: building._id,
            floorId: floor._id,
            name: "Demo unit " + (n + 1),
            code: "DEMO-U" + n,
            unitType: "ONE_BEDROOM",
            status:
              n === item.units - 1
                ? "INACTIVE"
                : n % 3 === 0
                  ? "VACANT"
                  : "OCCUPIED",
            monthlyRent: 15000,
            createdBy: actorUserId,
            updatedBy: actorUserId,
            metadata: { simulated: true },
          })),
          { session },
        );
        if (item.plan === "FORT_KNOX") {
          await SecurityCamera.insertMany(
            ["ONLINE", "OFFLINE", "DEGRADED", "UNKNOWN"].map((status, n) => ({
              organizationId: organization._id,
              propertyId: property._id,
              name: "Simulated camera " + (n + 1),
              cameraCode: "DEMO-CAM-" + n,
              provider: "DEMO",
              connectionType: "SDK",
              status: status === "UNKNOWN" ? "OFFLINE" : status,
              ...(status === "UNKNOWN"
                ? {}
                : {
                    lastHeartbeatAt:
                      status === "OFFLINE"
                        ? new Date(now.getTime() - 3600000)
                        : now,
                  }),
              metadata: { simulated: true },
              createdBy: actorUserId,
              updatedBy: actorUserId,
            })),
            { session },
          );
          const [incident] = await Incident.create(
            [
              {
                organizationId: organization._id,
                propertyId: property._id,
                incidentNumber: "DEMO-INCIDENT",
                title: "Simulated access-control incident",
                category: "ACCESS_CONTROL",
                severity: index === 4 ? "CRITICAL" : "MEDIUM",
                status: "INVESTIGATING",
                reportedAt: new Date(now.getTime() - 3600000),
                metadata: { simulated: true },
                createdBy: actorUserId,
                updatedBy: actorUserId,
              },
            ],
            { session },
          );
          await Evidence.create(
            [
              {
                organizationId: organization._id,
                propertyId: property._id,
                evidenceType: "OTHER",
                source: "SYSTEM",
                capturedAt: now,
                relatedResourceType: "SECURITY_EVENT",
                relatedResourceId: incident._id,
                title: "Simulated incident evidence; no real surveillance",
                metadata: { simulated: true },
                createdBy: actorUserId,
              },
            ],
            { session },
          );
          await IntegrationAttempt.create(
            [
              {
                organizationId: organization._id,
                provider: "CCTV",
                operation: "DEMO_CONNECTIVITY",
                status: "FAILED",
                attempt: 1,
                maxAttempts: 1,
                externalReference: "DEMO-CCTV-" + index,
                metadata: { simulated: true },
              },
            ],
            { session },
          );
        }
        if (item.state === "PAYMENT_PENDING") {
          await Job.create(
            [
              {
                organizationId: organization._id,
                type: "DEMO_SIMULATION_ONLY",
                payload: { simulated: true },
                status: "DEAD_LETTER",
                availableAt: now,
                failedAt: now,
              },
            ],
            { session },
          );
          await Notification.create(
            [
              {
                organizationId: organization._id,
                recipientUserId: actorUserId,
                channel: "IN_APP",
                type: "DEMO_SIMULATION_ONLY",
                title: "Simulated failed notice",
                body: "Development fixture. No message was sent.",
                status: "FAILED",
                data: { simulated: true },
              },
            ],
            { session },
          );
        }
      }
      await Organization.create(
        [
          {
            name: "SIMULATED — New signup",
            slug: "platform-bi-demo-unassigned",
            settings: { platformDemoDataset: DEMO_DATASET },
            onboarding: { state: "ACCOUNT_CREATED" },
          },
        ],
        { session },
      );
      await AuditService.record(
        {
          actorUserId,
          actorRole: "SUPER_ADMIN",
          action: "platform.demo.seeded",
          resourceType: "PlatformBusinessIntelligence",
          metadata: {
            dataset: DEMO_DATASET,
            organizations: 9,
            simulated: true,
          },
        },
        session,
      );
    });
    return { created: 9, existing: 0 };
  } finally {
    await session.endSession();
  }
}
