import { assertSalesIndexes } from "./sales-indexes.js";
import mongoose, { Types } from "mongoose";
import { createHash, randomUUID } from "node:crypto";
import { AuthorizationService } from "../../core/authorization/authorization.service.js";
import type { AuthenticatedUser } from "../../core/types/auth.js";
import { AppError } from "../../core/errors/AppError.js";
import { SalesLead } from "../../database/models/SalesLead.js";
import {
  SalesDemoSession,
  SalesValueEvent,
} from "../../database/models/SalesDemoSession.js";
import { AuditService } from "../audit/audit.service.js";
import { SalesDemoRepository as repository } from "./sales-demo.repository.js";
import {
  prepareDemoSchema,
  commandSchema,
  paginationSchema,
} from "./sales-demo.schemas.js";
import {
  buildDemo,
  applyDemoAction,
  summarizeDemo,
  demoTemplates,
  demoStories,
} from "./sales-demo.engine.js";
import type { DemoProfile, DemoSnapshot } from "./sales-demo.types.js";
export function assertSalesAccess(auth: AuthenticatedUser) {
  if (auth.isPlatformAdmin) return;
  if (
    !auth.memberships.some(
      (m) =>
        m.scope.allProperties && m.permissions.includes("sales.demo.manage"),
    )
  )
    throw new AppError(
      403,
      "SALES_PERMISSION_REQUIRED",
      "Sales demonstration access must be explicitly delegated",
    );
}
export class SalesDemoService {
  static async catalog(auth: AuthenticatedUser) {
    assertSalesAccess(auth);
    return { templates: demoTemplates, stories: demoStories };
  }
  static async list(auth: AuthenticatedUser, raw: unknown) {
    assertSalesAccess(auth);
    const { page } = paginationSchema.parse(raw);
    const [items, total] = await repository.list(
      auth.userId,
      auth.isPlatformAdmin,
      page,
    );
    return {
      items: items.map((i) => ({ ...i, id: String(i._id) })),
      total,
      page,
    };
  }
  static async view(auth: AuthenticatedUser, id: string) {
    assertSalesAccess(auth);
    AuditService.assertObjectId(id, "demoSessionId");
    const record = await repository.load(id, auth.userId, auth.isPlatformAdmin);
    const snapshot = record.snapshot as DemoSnapshot;
    return {
      id: String(record._id),
      leadId: String(record.leadId),
      revision: record.revision,
      generation: record.generation,
      profile: record.profile as DemoProfile,
      snapshot,
      summary: summarizeDemo(snapshot),
      ...(record.pilotOrganizationId
        ? { pilotOrganizationId: String(record.pilotOrganizationId) }
        : {}),
      events: await repository.events(record._id),
    };
  }
  static async prepare(auth: AuthenticatedUser, raw: unknown) {
    assertSalesAccess(auth);
    await assertSalesIndexes();
    const input = prepareDemoSchema.parse(raw),
      snapshot = buildDemo(input.profile);
    const session = await mongoose.startSession();
    let id = "";
    try {
      await session.withTransaction(async () => {
        const lead = input.leadId
          ? await SalesLead.findOne({
              _id: input.leadId,
              ...(auth.isPlatformAdmin ? {} : { createdBy: auth.userId }),
            }).session(session)
          : new SalesLead({
              reference: `DEMO-${randomUUID()}`,
              name: input.profile.companyName,
              properties:
                input.profile.properties ??
                demoTemplates.find((t) => t.id === input.profile.template)!
                  .properties,
              units: String(snapshot.units.length),
              challenge: input.profile.objective ?? input.profile.primaryPain,
              source: "Sales controller",
              createdBy: auth.userId,
            });
        if (!lead)
          throw new AppError(
            404,
            "LEAD_NOT_FOUND",
            "Prospect not found or not accessible",
          );
        lead.name = input.profile.companyName;
        lead.demoProfile = input.profile;
        lead.stage = "Demo prepared";
        await lead.save({ session });
        const [demo] = await SalesDemoSession.create(
          [
            {
              leadId: lead._id,
              createdBy: auth.userId,
              profile: input.profile,
              snapshot,
            },
          ],
          { session },
        );
        id = String(demo!._id);
        await SalesValueEvent.create(
          [
            {
              sessionId: demo!._id,
              leadId: lead._id,
              generation: 0,
              commandId: randomUUID(),
              payloadHash: "prepare",
              kind: "demo.prepared",
              resourceId: "demo-portfolio",
              actorUserId: auth.userId,
            },
          ],
          { session },
        );
        await AuditService.record(
          {
            actorUserId: auth.userId,
            action: "sales.demo.prepared",
            resourceType: "SalesDemoSession",
            resourceId: demo!._id,
            metadata: {
              dataset: "SALES_DEMO",
              scenario: input.profile.primaryPain,
              plan: input.profile.plan,
            },
          },
          session,
        );
      });
    } finally {
      await session.endSession();
    }
    return this.view(auth, id);
  }
  static async command(auth: AuthenticatedUser, id: string, raw: unknown) {
    assertSalesAccess(auth);
    AuditService.assertObjectId(id, "demoSessionId");
    await assertSalesIndexes();
    const input = commandSchema.parse(raw),
      digest = createHash("sha256")
        .update(
          JSON.stringify({
            kind: input.kind,
            resourceId: input.resourceId,
            amountMinor: input.amountMinor,
          }),
        )
        .digest("hex");
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const demo = await repository.load(
          id,
          auth.userId,
          auth.isPlatformAdmin,
          session,
        );
        const prior = await SalesValueEvent.findOne({
          sessionId: demo._id,
          commandId: input.commandId,
        }).session(session);
        if (prior) {
          if (prior.payloadHash !== digest)
            throw new AppError(
              409,
              "COMMAND_KEY_REUSED",
              "Use a new command key for a different action",
            );
          return;
        }
        if (demo.revision !== input.expectedRevision)
          throw new AppError(
            409,
            "DEMO_CONFLICT",
            "Demo changed; refresh before acting",
          );
        const result =
          input.kind === "RESET"
            ? {
                snapshot: buildDemo(demo.profile as DemoProfile),
                event: "demo.reset",
                outcome: "Scenario restored to deterministic starting state",
              }
            : applyDemoAction(
                demo.snapshot as DemoSnapshot,
                { ...input, kind: input.kind },
                `Demo landlord · ${(demo.profile as DemoProfile).contactName || (demo.profile as DemoProfile).companyName}`,
              );
        const generation = demo.generation + (input.kind === "RESET" ? 1 : 0);
        const changed = await SalesDemoSession.updateOne(
          {
            _id: demo._id,
            revision: input.expectedRevision,
            dataset: "SALES_DEMO",
          },
          {
            $set: { snapshot: result.snapshot, generation },
            $inc: { revision: 1 },
          },
          { session },
        );
        if (changed.modifiedCount !== 1)
          throw new AppError(
            409,
            "DEMO_CONFLICT",
            "Demo changed; refresh before acting",
          );
        await SalesValueEvent.create(
          [
            {
              sessionId: demo._id,
              leadId: demo.leadId,
              generation,
              commandId: input.commandId,
              payloadHash: digest,
              kind: result.event,
              resourceId: input.resourceId ?? "demo-portfolio",
              actorUserId: auth.userId,
            },
          ],
          { session },
        );
        await AuditService.record(
          {
            actorUserId: auth.userId,
            action: `sales.${result.event}`,
            resourceType: "SalesDemoSession",
            resourceId: demo._id,
            metadata: {
              dataset: "SALES_DEMO",
              generation,
              outcome: result.outcome,
            },
          },
          session,
        );
        if (result.event === "demo.completed")
          await SalesLead.updateOne(
            { _id: demo.leadId },
            { $set: { stage: "Demo completed" } },
            { session },
          );
      });
    } finally {
      await session.endSession();
    }
    return this.view(auth, id);
  }
  static assertAdmin(auth: AuthenticatedUser) {
    AuthorizationService.assertPlatformAdmin(auth);
  }
}
