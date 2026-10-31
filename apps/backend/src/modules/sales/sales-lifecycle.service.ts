import { lifecycleReplaySchema } from "./sales-identity.schemas.js";
import { randomUUID } from "node:crypto";
import { Types, type ClientSession } from "mongoose";
import { z } from "zod";
import type { AuthenticatedUser } from "../../core/types/auth.js";
import { SalesLead } from "../../database/models/SalesLead.js";
import { SalesActivity } from "../../database/models/SalesActivity.js";
import { SalesProjectionCheckpoint } from "../../database/models/SalesIdentity.js";
import { DomainEvent } from "../../database/models/DomainEvent.js";
import { AuditLog } from "../../database/models/AuditLog.js";
import { Job } from "../../database/models/Job.js";
import { PlatformSwitch } from "../../database/models/PlatformSwitch.js";
import { Organization } from "../../database/models/Organization.js";
import { Property } from "../../database/models/Property.js";
import { Building } from "../../database/models/Building.js";
import { Floor } from "../../database/models/Floor.js";
import { Unit } from "../../database/models/Unit.js";
import { User } from "../../database/models/User.js";
import { AuditService } from "../audit/audit.service.js";
import { AuthorizationService } from "../../core/authorization/authorization.service.js";
import { AppError } from "../../core/errors/AppError.js";
import { SalesIdentityService } from "./sales-identity.service.js";
import { SalesCustomerEvidenceRepository } from "./sales-customer-evidence.repository.js";
import { assertLifecycleIndexes } from './sales-success-indexes.js';
import { salesTransaction } from "./sales-agent.repository.js";
import { objectId } from "./sales-success.schemas.js";
import {
  salesLifecycleEvents as eventNames,
  salesLifecycleAudits as auditNames,
} from "./sales-lifecycle.catalog.js";
const active = () =>
  PlatformSwitch.exists({ key: "SALES_LIFECYCLE", enabled: true, mode: "ON" });
export { sourceStage } from "./sales-lifecycle.catalog.js";
import { sourceStage } from "./sales-lifecycle.catalog.js";
export class SalesLifecycleService {
  static async health(auth: AuthenticatedUser, id: string) {
    AuthorizationService.assertPlatformAdmin(auth);
    return SalesProjectionCheckpoint.find({
      organizationId: objectId.parse(id),
    })
      .select("-inventory")
      .limit(1)
      .lean();
  }
  static async startMonitor(
    session: ClientSession,
    actorUserId?: Types.ObjectId,
  ) {
    const cycleKey = String(Math.floor(Date.now() / 300000));
    await Job.updateOne(
      { dedupeKey: `sales-lifecycle-scan:${cycleKey}:${randomUUID()}` },
      {
        $setOnInsert: {
          type: "sales.lifecycle.scan",
          payload: { cycleKey },
          createdBy: actorUserId,
          status: "QUEUED",
          availableAt: new Date(),
          maxAttempts: 5,
        },
      },
      { upsert: true, session },
    );
  }
  static async scan(raw: unknown) {
    if (!(await active())) return { skipped: "DISABLED" };
    const input = z
      .object({
        cycleKey: z.string().regex(/^\d{1,9}$/),
        afterOrganizationId: objectId.optional(),
      })
      .strict()
      .parse(raw);
    const leads = await Organization.find({
      status: "ACTIVE",
      ...(input.afterOrganizationId
        ? { _id: { $gt: new Types.ObjectId(input.afterOrganizationId) } }
        : {}),
    })
      .select("_id")
      .sort({ _id: 1 })
      .limit(50)
      .lean();
    await salesTransaction(async (session) => {
      for (const lead of leads) {
        await Job.updateOne(
          {
            dedupeKey: `sales-lifecycle-org:${input.cycleKey}:${lead._id}`,
          },
          {
            $setOnInsert: {
              type: "sales.lifecycle.replay",
              organizationId: lead._id,
              payload: { organizationId: String(lead._id) },
              status: "QUEUED",
              availableAt: new Date(),
              maxAttempts: 5,
            },
          },
          { upsert: true, session },
        );
      }
      const last = leads.at(-1),
        more = leads.length === 50 && last;
      const cycleKey = more
        ? input.cycleKey
        : String(Math.floor(Date.now() / 300000) + 1);
      await Job.updateOne(
        {
          dedupeKey: `sales-lifecycle-scan:${cycleKey}:${more ? last._id : "start"}`,
        },
        {
          $setOnInsert: {
            type: "sales.lifecycle.scan",
            payload: {
              cycleKey,
              ...(more ? { afterOrganizationId: String(last._id) } : {}),
            },
            status: "QUEUED",
            availableAt: more
              ? new Date()
              : new Date(Number(cycleKey) * 300000),
            maxAttempts: 5,
          },
        },
        { upsert: true, session },
      );
    });
    return { organizationsScheduled: leads.length };
  }
  static async scheduleAudit(
    event: {
      _id: Types.ObjectId;
      organizationId: Types.ObjectId;
      action: string;
    },
    session: ClientSession,
  ) {
    if (!(auditNames as readonly string[]).includes(event.action)) return;
    if (
      !(await PlatformSwitch.exists({
        key: "SALES_LIFECYCLE",
        enabled: true,
        mode: "ON",
      }).session(session))
    )
      return;
    await Job.updateOne(
      { dedupeKey: `domain-event:sales-audit:${event._id}` },
      {
        $setOnInsert: {
          type: "domain-event.sales-audit",
          organizationId: event.organizationId,
          payload: { auditId: String(event._id) },
          status: "QUEUED",
          availableAt: new Date(),
          maxAttempts: 5,
        },
      },
      { upsert: true, session },
    );
  }
  static async schedule(
    event: { organizationId: Types.ObjectId; eventId: string; name: string },
    session: ClientSession,
  ) {
    if (!(eventNames as readonly string[]).includes(event.name)) return;
    // Scheduling is inert while disabled; the replay command can recover historical source events later.
    if (
      !(await PlatformSwitch.exists({
        key: "SALES_LIFECYCLE",
        enabled: true,
        mode: "ON",
      }).session(session))
    )
      return;
    await Job.updateOne(
      { dedupeKey: `domain-event:sales-lifecycle:${event.eventId}` },
      {
        $setOnInsert: {
          type: "domain-event.sales-lifecycle",
          organizationId: event.organizationId,
          payload: { eventId: event.eventId },
          status: "QUEUED",
          availableAt: new Date(),
          maxAttempts: 5,
        },
      },
      { upsert: true, session },
    );
  }
  static async replay(auth: AuthenticatedUser, raw: unknown) {
    AuthorizationService.assertPlatformAdmin(auth);
    const input = lifecycleReplaySchema.parse(raw);
    input.organizationId = input.organizationId.toLowerCase();
    if (!(await active()))
      throw new AppError(
        503,
        "SERVICE_DISABLED",
        "Enable lifecycle projection through platform controls",
      );
    return salesTransaction(async (session) => {
      if (
        !(await Organization.exists({ _id: input.organizationId }).session(
          session,
        ))
      )
        throw new AppError(
          404,
          "ORGANIZATION_NOT_FOUND",
          "Organization not found",
        );
      if (input.fromBeginning)
        await SalesProjectionCheckpoint.updateOne(
          { organizationId: input.organizationId },
          {
            $unset: {
              domainCursorAt: 1,
              domainCursorId: 1,
              auditCursorAt: 1,
              auditCursorId: 1,
              inventory: 1,
            },
          },
          { session },
        );
      const [job] = await Job.create(
        [
          {
            type: "sales.lifecycle.replay",
            organizationId: input.organizationId,
            payload: { organizationId: input.organizationId },
            createdBy: auth.userId,
            dedupeKey: `sales-replay:${input.organizationId}:${randomUUID()}`,
            availableAt: new Date(),
            maxAttempts: 5,
          },
        ],
        { session },
      );
      await AuditService.record(
        {
          actorUserId: auth.userId,
          organizationId: new Types.ObjectId(input.organizationId),
          action: "sales.lifecycle.replay.requested",
          resourceType: "Organization",
          resourceId: new Types.ObjectId(input.organizationId),
          metadata: { fromBeginning: input.fromBeginning },
        },
        session,
      );
      return { jobId: String(job?._id), status: "QUEUED" };
    });
  }
  static async consume(eventId: string, organizationId: Types.ObjectId) {
    if (!(await active())) return { skipped: "DISABLED" };
    if (
      !(await DomainEvent.exists({
        eventId,
        organizationId,
        name: { $in: eventNames },
      }))
    )
      throw new AppError(
        404,
        "SOURCE_EVENT_NOT_FOUND",
        "Source event does not belong to this organization",
      );
    return this.batch(organizationId);
  }
  static async consumeAudit(id: string, organizationId: Types.ObjectId) {
    if (!(await active())) return { skipped: "DISABLED" };
    if (
      !(await AuditLog.exists({
        _id: id,
        organizationId,
        action: { $in: auditNames },
      }))
    )
      throw new AppError(
        404,
        "SOURCE_EVENT_NOT_FOUND",
        "Audit evidence does not belong to this organization",
      );
    return this.batch(organizationId);
  }
  static async batch(organizationId: Types.ObjectId) {
    try {
      if (await active()) await assertLifecycleIndexes();
      const result = await this.projectBatch(organizationId);
      const { SalesAttributionService } = await import('./sales-attribution.service.js');
      await SalesAttributionService.project(organizationId);
      return result;
    } catch (error) {
      const code = error instanceof AppError ? error.code : 'LIFECYCLE_PROJECTION_FAILED';
      await SalesProjectionCheckpoint.updateOne({ organizationId }, { $set: { lastErrorCode: code } }, { upsert: true }).catch(() => undefined);
      throw new AppError(503, code, 'Customer lifecycle projection failed; durable retry is required');
    }
  }
  private static async projectBatch(organizationId: Types.ObjectId) {
    if (!(await active())) return { skipped: "DISABLED" };
    await salesTransaction(async (session) => {
      await SalesIdentityService.resolve(organizationId, session);
    });
    const lead = await SalesLead.findOne({
      organizationId,
      mergedInto: { $exists: false },
    })
      .select("_id")
      .lean();
    if (!lead) return { skipped: "UNLINKED" };
    const checkpoint = await SalesProjectionCheckpoint.findOne({
      organizationId,
    }).lean();
    const after = (at?: Date | null, id?: Types.ObjectId | null) =>
      at && id
        ? {
            $or: [
              { createdAt: { $gt: at } },
              { createdAt: at, _id: { $gt: id } },
            ],
          }
        : {};
    const [events, audits, evidence] = await Promise.all([
      DomainEvent.find({
        organizationId,
        name: { $in: eventNames },
        ...after(checkpoint?.domainCursorAt, checkpoint?.domainCursorId),
      })
        .select("eventId name occurredAt createdAt version actorUserId")
        .sort({ createdAt: 1, _id: 1 })
        .limit(100)
        .lean(),
      AuditLog.find({
        organizationId,
        action: { $in: auditNames },
        ...after(checkpoint?.auditCursorAt, checkpoint?.auditCursorId),
      })
        .select("action occurredAt createdAt actorUserId metadata.state")
        .sort({ createdAt: 1, _id: 1 })
        .limit(100)
        .lean(),
      SalesCustomerEvidenceRepository.monitor(organizationId),
    ]);
    let inserted = 0;
    await salesTransaction(async (session) => {
      inserted = 0;
      // Serialize checkpoint advancement: workers cannot regress watermarks or double-count processed entries.
      await SalesProjectionCheckpoint.updateOne(
        { organizationId },
        {
          $setOnInsert: { organizationId },
          $set: { lastProcessedAt: new Date() },
        },
        { upsert: true, session },
      );
      const record = async (
        sourceKey: string,
        kind: string,
        at: Date,
        sourceType: "DOMAIN_EVENT" | "AUDIT_EVENT" | "AUTHORITATIVE_RECORD",
        actorUserId?: Types.ObjectId | null,
        version?: number,
      ) => {
        const result = await SalesActivity.updateOne(
          { leadId: lead._id, sourceKey },
          {
            $setOnInsert: {
              leadId: lead._id,
              actorUserId,
              actorKind: "SYSTEM",
              kind,
              sourceKey,
              sourceType,
              sourceOccurredAt: at,
              sourceVersion: version,
            },
          },
          { upsert: true, session },
        );
        inserted += result.upsertedCount;
      };
      const advance = async (name: string, state?: string) => {
        const stage = sourceStage(name, state);
        if (
          !stage ||
          ([12, 13].includes(stage.rank) && !evidence.verifiedPayment) ||
          (stage.rank === 11 && !evidence.checkoutStarted)
        )
          return;
        await SalesLead.updateOne(
          {
            _id: lead._id,
            organizationId,
            $or: [
              { pipelineRank: { $lt: stage.rank } },
              { pipelineRank: { $exists: false } },
            ],
          },
          {
            $set: { pipelineRank: stage.rank, stage: stage.stage },
            $inc: { revision: 1 },
          },
          { session },
        );
      };
      for (const event of events) {
        await record(
          `domain:${event.eventId}`,
          event.name,
          event.occurredAt,
          "DOMAIN_EVENT",
          event.actorUserId,
          event.version,
        );
        await advance(event.name);
      }
      for (const audit of audits) {
        const metadata = audit.metadata as unknown as { state?: unknown };
        const state =
          metadata instanceof Map ? metadata.get("state") : metadata?.state;
        await record(
          `audit:${audit._id}`,
          audit.action + (typeof state === "string" ? `.${state}` : ""),
          audit.occurredAt,
          "AUDIT_EVENT",
          audit.actorUserId,
        );
        await advance(
          audit.action,
          typeof state === "string" ? state : undefined,
        );
      }
      const calculated =
        evidence.verifiedPayment &&
        evidence.subscriptionStatus === "ACTIVE" &&
        evidence.completionPercent === 100
          ? { rank: 15, stage: "ONBOARDED" }
          : evidence.properties > 0 || evidence.registeredUnits > 0
            ? { rank: 14, stage: "ONBOARDING_IN_PROGRESS" }
            : null;
      if (calculated)
        await SalesLead.updateOne(
          {
            _id: lead._id,
            organizationId,
            $or: [
              { pipelineRank: { $lt: calculated.rank } },
              { pipelineRank: { $exists: false } },
            ],
          },
          {
            $set: { pipelineRank: calculated.rank, stage: calculated.stage },
            $inc: { revision: 1 },
          },
          { session },
        );
      const advanceCursor = async (
        atField: string,
        idField: string,
        at: Date,
        id: Types.ObjectId,
      ) => {
        await SalesProjectionCheckpoint.updateOne(
          {
            organizationId,
            $or: [
              { [atField]: { $exists: false } },
              { [atField]: { $lt: at } },
              { [atField]: at, [idField]: { $lt: id } },
            ],
          },
          { $set: { [atField]: at, [idField]: id } },
          { session },
        );
      };
      const lastEvent = events.at(-1),
        lastAudit = audits.at(-1);
      if (lastEvent)
        await advanceCursor(
          "domainCursorAt",
          "domainCursorId",
          lastEvent.createdAt,
          lastEvent._id,
        );
      if (lastAudit)
        await advanceCursor(
          "auditCursorAt",
          "auditCursorId",
          lastAudit.createdAt,
          lastAudit._id,
        );
      // Historical inventory facts come from persisted records, never invented DomainEvent entries.
      let moreInventory = false;
      const readers = [
        [
          "property",
          async (filter: Record<string, unknown>) =>
            Property.find(filter)
              .select("_id createdAt")
              .sort({ createdAt: 1, _id: 1 })
              .limit(100)
              .session(session)
              .lean(),
        ],
        [
          "building",
          async (filter: Record<string, unknown>) =>
            Building.find(filter)
              .select("_id createdAt")
              .sort({ createdAt: 1, _id: 1 })
              .limit(100)
              .session(session)
              .lean(),
        ],
        [
          "floor",
          async (filter: Record<string, unknown>) =>
            Floor.find(filter)
              .select("_id createdAt")
              .sort({ createdAt: 1, _id: 1 })
              .limit(100)
              .session(session)
              .lean(),
        ],
        [
          "unit",
          async (filter: Record<string, unknown>) =>
            Unit.find(filter)
              .select("_id createdAt")
              .sort({ createdAt: 1, _id: 1 })
              .limit(100)
              .session(session)
              .lean(),
        ],
      ] as const;
      for (const [label, read] of readers) {
        const inventory = checkpoint?.inventory;
        const cursor =
          inventory instanceof Map
            ? inventory.get(label)
            : (
                inventory as
                  Record<string, { at?: Date; id?: Types.ObjectId }> | undefined
              )?.[label];
        const records = await read({
          organizationId,
          ...after(cursor?.at, cursor?.id),
        });
        for (const item of records)
          await record(
            `record:${label}:${item._id}`,
            `${label}.created.record`,
            item.createdAt,
            "AUTHORITATIVE_RECORD",
          );
        const last = records.at(-1);
        if (last)
          await advanceCursor(
            `inventory.${label}.at`,
            `inventory.${label}.id`,
            last.createdAt,
            last._id,
          );
        if (records.length === 100) moreInventory = true;
      }
      const org = await Organization.findById(organizationId)
        .select("onboarding.ownerUserId")
        .session(session);
      const owner = org?.onboarding?.ownerUserId
        ? await User.findById(org.onboarding.ownerUserId)
            .select("lastLoginAt")
            .session(session)
        : null;
      if (owner?.lastLoginAt)
        await record(
          `record:login:${owner._id}:${owner.lastLoginAt.toISOString()}`,
          "owner.last_login.record",
          owner.lastLoginAt,
          "AUTHORITATIVE_RECORD",
        );
      const sourceDates = [lastEvent?.occurredAt, lastAudit?.occurredAt, checkpoint?.lastEventAt].filter((d): d is Date => d instanceof Date);
      const sourceWatermark = sourceDates.length ? { $max: { lastEventAt: new Date(Math.max(...sourceDates.map(Number))) } } : {};
      await SalesProjectionCheckpoint.updateOne(
        { organizationId },
        {
          $inc: { processedCount: inserted },
          ...sourceWatermark,
          $unset: { lastErrorCode: 1 },
        },
        { session },
      );
      if (events.length === 100 || audits.length === 100 || moreInventory)
        await Job.create(
          [
            {
              type: "sales.lifecycle.replay",
              organizationId,
              payload: { organizationId: String(organizationId) },
              availableAt: new Date(),
              dedupeKey: `sales-replay:${organizationId}:${randomUUID()}`,
              maxAttempts: 5,
            },
          ],
          { session },
        );
    });
    return { inserted, scanned: events.length + audits.length };
  }
}
