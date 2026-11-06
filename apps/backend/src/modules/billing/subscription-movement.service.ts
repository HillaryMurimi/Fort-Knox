import mongoose, { Types, type ClientSession } from "mongoose";
import {
  SubscriptionMovement,
  type SubscriptionMovementRecord,
} from "../../database/models/SubscriptionMovement.js";
import { OrganizationSubscription } from "../../database/models/OrganizationSubscription.js";
import { MovementRepository as repository } from "./subscription-movement.repository.js";
import { AppError } from "../../core/errors/AppError.js";
import { AuditService } from "../audit/audit.service.js";
import { env } from "../../config/env.js";
import { DEMO_DATASET } from "../platform-control/platform-business.schemas.js";

type Entry = Omit<SubscriptionMovementRecord, "recordedAt" | "sequence">;
export async function assertMovementIndexes() {
  if (env.NODE_ENV !== "production") return;
  const indexes = await SubscriptionMovement.collection
    .indexes()
    .catch(() => []);
  if (
    !indexes.some(
      (i) =>
        i.name === "subscription_movement_source_unique" &&
        i.unique &&
        !i.partialFilterExpression &&
        !i.sparse &&
        Object.keys(i.key).length === 1 &&
        i.key.sourceKey === 1,
    ) ||
    !indexes.some(
      (i) =>
        i.name === "subscription_movement_sequence_unique" &&
        i.unique &&
        !i.partialFilterExpression &&
        !i.sparse &&
        Object.keys(i.key).length === 2 &&
        i.key.subscriptionId === 1 &&
        i.key.sequence === 1,
    )
  )
    throw new AppError(
      503,
      "MOVEMENT_INDEXES_REQUIRED",
      "Install subscription movement indexes before processing billing",
    );
}
async function append(entry: Entry, session: ClientSession) {
  if (!session.inTransaction())
    throw new AppError(
      500,
      "MOVEMENT_TRANSACTION_REQUIRED",
      "Movement and billing must commit together",
    );
  await assertMovementIndexes();
  const prior = await repository.source(entry.sourceKey, session);
  if (prior) {
    if (
      String(prior.subscriptionId) !== String(entry.subscriptionId) ||
      prior.currency !== entry.currency ||
      prior.newMinor !== entry.newMinor ||
      prior.effectiveAt.getTime() !== entry.effectiveAt.getTime()
    )
      throw new AppError(
        409,
        "MOVEMENT_SOURCE_CONFLICT",
        "Movement evidence changed on replay",
      );
    return prior;
  }
  const head = await repository.latest(entry.subscriptionId, session);
  const [event] = await SubscriptionMovement.create(
    [{ ...entry, recordedAt: new Date(), sequence: (head?.sequence ?? 0) + 1 }],
    { session },
  );
  if (!event)
    throw new AppError(
      500,
      "MOVEMENT_WRITE_FAILED",
      "Could not retain subscription movement",
    );
  await AuditService.record(
    {
      organizationId: entry.organizationId,
      action: "billing.movement.recorded",
      resourceType: "SubscriptionMovement",
      resourceId: event._id,
      metadata: {
        kind: entry.kind,
        sourceKey: entry.sourceKey,
        sequence: event.sequence,
      },
    },
    session,
  );
  return event;
}
const exact = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Called only after provider proof is persisted in the payment's transaction. No catalog reads. */
export async function recordPaidMovement(
  invoiceId: Types.ObjectId,
  periodStart: Date,
  periodEnd: Date,
  session: ClientSession,
) {
  const sourceKey = `paid:${invoiceId}`;
  const replay = await repository.source(sourceKey, session);
  if (replay) {
    if (
      replay.effectiveAt.getTime() !== periodStart.getTime() ||
      replay.paidThrough?.getTime() !== periodEnd.getTime()
    )
      throw new AppError(
        409,
        "MOVEMENT_SOURCE_CONFLICT",
        "Paid term changed on replay",
      );
    return replay;
  }
  const evidence = await repository.paidEvidence(invoiceId, session);
  const invoice = evidence?.invoice;
  const snapshot = invoice?.commercialSnapshot as
    { monthlyMinor?: unknown; currency?: unknown } | undefined;
  if (
    !invoice ||
    !evidence?.contract ||
    !evidence.proof ||
    !evidence.organization ||
    !exact(invoice.totalMinor) ||
    !exact(snapshot?.monthlyMinor) ||
    snapshot.currency !== invoice.currency ||
    !invoice.paidAt ||
    Math.round(invoice.amountPaid * 100) < invoice.totalMinor
  )
    throw new AppError(
      409,
      "MOVEMENT_PAYMENT_EVIDENCE_REQUIRED",
      "Exact paid invoice and signed contract evidence are required",
    );
  if (
    !evidence.subscription ||
    evidence.subscription.currentPeriodStart.getTime() !==
      periodStart.getTime() ||
    evidence.subscription.currentPeriodEnd.getTime() !== periodEnd.getTime() ||
    !(periodEnd > periodStart)
  )
    throw new AppError(
      409,
      "MOVEMENT_SUBSCRIPTION_EVIDENCE_REQUIRED",
      "Verified paid subscription term must match the movement",
    );
  let head = await repository.latest(invoice.subscriptionId, session);
  // A genuine gap after a verified paid term creates an explicit boundary event,
  // even if the expiry worker has not run yet. No current catalog/state inference.
  if (
    head &&
    head.newMinor !== "0" &&
    head.paidThrough &&
    head.paidThrough < periodStart
  ) {
    await recordEndMovement(
      invoice.subscriptionId,
      "EXPIRATION",
      head.paidThrough,
      `expiry:${invoice.subscriptionId}:${head.paidThrough.toISOString()}`,
      "PAID_TERM_BOUNDARY",
      session,
    );
    head = await repository.latest(invoice.subscriptionId, session);
  }
  const newMinor = String(snapshot.monthlyMinor);
  const baseline = !head && !!invoice.contractId && !evidence.priorPaid;
  const gaps = [...(head?.gaps ?? [])];
  if (!head && !baseline) gaps.push("OPENING_HISTORY_MISSING");
  if (head && head.currency !== invoice.currency) gaps.push("CURRENCY_CHANGED");
  if (head && periodStart <= head.effectiveAt)
    gaps.push("OUT_OF_ORDER_OR_BOUNDARY_CONFLICT");
  const previousMinor =
    head?.currency === invoice.currency ? head.newMinor : baseline ? "0" : null;
  const kind = baseline
    ? "ACTIVATION"
    : previousMinor === "0"
      ? "REACTIVATION"
      : previousMinor === null || previousMinor === newMinor
        ? "RENEWAL"
        : BigInt(newMinor) > BigInt(previousMinor)
          ? "EXPANSION"
          : "CONTRACTION";
  return append(
    {
      organizationId: invoice.organizationId,
      subscriptionId: invoice.subscriptionId,
      kind,
      currency: invoice.currency,
      previousMinor,
      newMinor,
      effectiveAt: periodStart,
      paidThrough: periodEnd,
      previousEventId: head?._id,
      sourceKey,
      invoiceId: invoice._id,
      contractId: evidence.contract._id,
      billingEventId: evidence.proof._id,
      sourceKind: "VERIFIED_PAYMENT",
      sourceReference: invoice.providerInvoiceId!,
      completeFromStart:
        (baseline || !!head?.completeFromStart) && gaps.length === 0,
      gaps: [...new Set(gaps)],
      dataset:
        (
          evidence.organization.settings as
            { platformDemoDataset?: unknown } | undefined
        )?.platformDemoDataset === DEMO_DATASET
          ? "DEMO"
          : "LIVE",
    },
    session,
  );
}

export async function recordEndMovement(
  subscriptionId: Types.ObjectId,
  kind: "CANCELLATION" | "EXPIRATION",
  effectiveAt: Date,
  sourceKey: string,
  sourceKind:
    "PAID_TERM_BOUNDARY" | "AUTHORIZED_CANCELLATION" | "VERIFIED_WEBHOOK",
  session: ClientSession,
  actorUserId?: Types.ObjectId,
  webhookEventId?: Types.ObjectId,
) {
  const replay = await repository.source(sourceKey, session);
  if (replay) {
    if (
      String(replay.subscriptionId) !== String(subscriptionId) ||
      replay.kind !== kind ||
      replay.effectiveAt.getTime() !== effectiveAt.getTime()
    )
      throw new AppError(
        409,
        "MOVEMENT_SOURCE_CONFLICT",
        "Lifecycle evidence changed on replay",
      );
    return replay;
  }
  const head = await repository.latest(subscriptionId, session);
  // Legacy records without a verified opening are diagnosed, never given a fabricated balance.
  if (!head || (head.newMinor === "0" && kind === "EXPIRATION")) return;
  const gaps = [...head.gaps];
  if (effectiveAt < head.effectiveAt)
    gaps.push("OUT_OF_ORDER_OR_BOUNDARY_CONFLICT");
  if (
    sourceKind === "PAID_TERM_BOUNDARY" &&
    head.paidThrough?.getTime() !== effectiveAt.getTime()
  )
    gaps.push("PAID_TERM_BOUNDARY_CONFLICT");
  return append(
    {
      organizationId: head.organizationId,
      subscriptionId,
      currency: head.currency,
      kind,
      effectiveAt,
      previousMinor: head.newMinor,
      newMinor: "0",
      previousEventId: head._id,
      sourceKey,
      sourceKind,
      sourceReference: sourceKey,
      invoiceId: head.invoiceId,
      contractId: head.contractId,
      billingEventId: head.billingEventId,
      actorUserId,
      webhookEventId,
      completeFromStart: head.completeFromStart && gaps.length === 0,
      gaps,
      dataset: head.dataset,
    },
    session,
  );
}

/** State change and analytical evidence share one transaction; transport stays outside. */
export async function endSubscription(input: {
  subscriptionId: Types.ObjectId;
  kind: "CANCELLATION" | "EXPIRATION";
  sourceKind:
    "PAID_TERM_BOUNDARY" | "AUTHORIZED_CANCELLATION" | "VERIFIED_WEBHOOK";
  reference: string;
  at?: Date;
  actorUserId?: Types.ObjectId;
  webhookEventId?: Types.ObjectId;
  expectedPeriodEnd?: Date;
}) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const subscription = await OrganizationSubscription.findById(
        input.subscriptionId,
      ).session(session);
      if (
        !subscription ||
        subscription.status === "CANCELLED" ||
        subscription.status === "EXPIRED"
      )
        return;
      if (
        input.expectedPeriodEnd &&
        (subscription.currentPeriodEnd.getTime() !==
          input.expectedPeriodEnd.getTime() ||
          subscription.currentPeriodEnd > new Date())
      )
        return;
      const effectiveAt = input.at ?? new Date();
      const head = await repository.latest(subscription._id, session);
      if (
        head?.newMinor === "0" &&
        subscription.status === "PAST_DUE" &&
        input.kind === "EXPIRATION"
      )
        return;
      await recordEndMovement(
        subscription._id,
        input.kind,
        effectiveAt,
        input.reference,
        input.sourceKind,
        session,
        input.actorUserId,
        input.webhookEventId,
      );
      subscription.status =
        input.kind === "CANCELLATION" ? "CANCELLED" : "PAST_DUE";
      if (input.kind === "CANCELLATION") subscription.cancelledAt = effectiveAt;
      if (input.actorUserId) subscription.updatedBy = input.actorUserId;
      await subscription.save({ session });
      await AuditService.record(
        {
          organizationId: subscription.organizationId,
          actorUserId: input.actorUserId,
          action: "billing.subscription.ended",
          resourceType: "OrganizationSubscription",
          resourceId: subscription._id,
          metadata: {
            kind: input.kind,
            effectiveAt: effectiveAt.toISOString(),
            reference: input.reference,
          },
        },
        session,
      );
    });
  } finally {
    await session.endSession();
  }
}
