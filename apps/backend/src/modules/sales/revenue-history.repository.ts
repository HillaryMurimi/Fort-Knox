import mongoose, { Types, type PipelineStage } from "mongoose";
import { SubscriptionMovement } from "../../database/models/SubscriptionMovement.js";
import { SubscriptionInvoice } from "../../database/models/SubscriptionInvoice.js";
import { OrganizationSubscription } from "../../database/models/OrganizationSubscription.js";
import { BillingEvent } from "../../database/models/BillingEvent.js";
import { WebhookEvent } from "../../database/models/WebhookEvent.js";
import { OrganizationContract } from "../../database/models/OrganizationContract.js";
import {
  invoicePipeline,
  organizationJoin,
} from "../platform-control/platform-business.repository.js";
import { businessQuery } from "../platform-control/platform-business.schemas.js";
import type {
  EvidenceGap,
  MovementEvidence,
} from "./revenue-history.calculations.js";
const scope = businessQuery.parse({ dataset: "LIVE", plan: "ALL" });
const maximum = 10000;
interface InvoiceEvidence {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  subscriptionId: Types.ObjectId;
  paidAt: Date;
  verified: boolean;
  contractId?: Types.ObjectId;
  originContractId?: Types.ObjectId;
  totalMinor?: number;
  commercialSnapshot?: { monthlyMinor?: number; currency?: string };
  providerInvoiceId?: string;
  metadata?: { originContractId?: string };
  currency: string;
}
const safeMinor = (n: unknown) =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
export const RevenueHistoryRepository = {
  async load(currency: string, now: Date) {
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(
        async () => {
          // Sequential reads in one snapshot prevent a payment commit being observed
          // halfway between its invoice, movement and subscription writes.
          const rawEvents = await SubscriptionMovement.aggregate([
            {
              $match: { currency, dataset: "LIVE", recordedAt: { $lte: now } },
            },
            ...organizationJoin(scope),
            { $sort: { subscriptionId: 1, sequence: 1 } },
            { $limit: maximum + 1 },
          ])
            .session(session)
            .option({ maxTimeMS: 15000 });
          const invoices = await SubscriptionInvoice.aggregate<InvoiceEvidence>(
            [
              {
                $match: {
                  currency,
                  provider: "PAYSTACK",
                  status: "PAID",
                  $or: [{ paidAt: { $lte: now } }, { paidAt: null }],
                },
              },
              ...invoicePipeline(scope, now),
              { $sort: { paidAt: 1, _id: 1 } },
              { $limit: maximum + 1 },
            ],
          )
            .session(session)
            .option({ maxTimeMS: 15000 });
          const subscriptions = await OrganizationSubscription.aggregate<{
            _id: Types.ObjectId;
            organizationId: Types.ObjectId;
            currentPeriodStart: Date;
          }>([
            {
              $match: {
                provider: "PAYSTACK",
                status: { $in: ["ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"] },
              },
            },
            ...organizationJoin(scope),
            {
              $match: {
                $or: [
                  { "metadata.commercialSnapshot.currency": currency },
                  {
                    "metadata.commercialSnapshot.currency": { $exists: false },
                  },
                ],
              },
            },
            { $sort: { _id: 1 } },
            { $limit: maximum + 1 },
            { $project: { _id: 1, organizationId: 1, currentPeriodStart: 1 } },
          ])
            .session(session)
            .option({ maxTimeMS: 15000 });
          const contracts = await OrganizationContract.find({
            _id: {
              $in: invoices.flatMap((i) =>
                (i.contractId ?? i.originContractId)
                  ? [i.contractId ?? i.originContractId]
                  : [],
              ),
            },
            status: "SIGNED",
          })
            .select("_id organizationId")
            .limit(maximum)
            .session(session)
            .lean();
          const signedContracts = new Set(
            contracts.map((c) => `${c.organizationId}:${c._id}`),
          );
          const events: MovementEvidence[] = rawEvents
            .slice(0, maximum)
            .map((e) => ({
              id: String(e._id),
              organizationId: String(e.organizationId),
              subscriptionId: String(e.subscriptionId),
              sequence: e.sequence,
              previousEventId: e.previousEventId
                ? String(e.previousEventId)
                : undefined,
              kind: e.kind,
              currency: e.currency,
              effectiveAt: e.effectiveAt.toISOString(),
              recordedAt: e.recordedAt.toISOString(),
              previousMinor: e.previousMinor ?? null,
              newMinor: e.newMinor,
              paidThrough: e.paidThrough?.toISOString(),
              completeFromStart: e.completeFromStart,
              gaps: e.gaps,
              sourceKey: e.sourceKey,
              sourceKind: e.sourceKind,
              sourceReference: e.sourceReference,
              invoiceId: e.invoiceId ? String(e.invoiceId) : undefined,
              contractId: e.contractId ? String(e.contractId) : undefined,
              billingEventId: e.billingEventId
                ? String(e.billingEventId)
                : undefined,
              webhookEventId: e.webhookEventId
                ? String(e.webhookEventId)
                : undefined,
            }));
          const gaps: EvidenceGap[] = [];
          const proofRows = await BillingEvent.find({
            _id: {
              $in: events.flatMap((e) =>
                e.billingEventId ? [new Types.ObjectId(e.billingEventId)] : [],
              ),
            },
            provider: "PAYSTACK",
            type: "INVOICE_PAID",
            status: "PROCESSED",
          })
            .select("_id organizationId externalReference")
            .limit(maximum)
            .session(session)
            .lean();
          const proofs = new Map(proofRows.map((p) => [String(p._id), p]));
          const sources = new Map(
            events
              .filter((e) => e.sourceKind === "VERIFIED_PAYMENT")
              .map((e) => [e.invoiceId, e]),
          );
          for (const invoice of invoices.slice(0, maximum)) {
            const base = {
              sourceId: String(invoice._id),
              organizationId: String(invoice.organizationId),
              effectiveAt: invoice.paidAt?.toISOString(),
            };
            if (!invoice.paidAt)
              gaps.push({ ...base, code: "PAYMENT_EFFECTIVE_DATE_MISSING" });
            if (!invoice.verified)
              gaps.push({ ...base, code: "MISSING_PROVIDER_PROOF" });
            if (!invoice.contractId && !invoice.originContractId)
              gaps.push({
                ...base,
                code: invoice.metadata?.originContractId
                  ? "LEGACY_METADATA_ONLY_RENEWAL"
                  : "MISSING_CONTRACT_LINK",
              });
            else if (
              !signedContracts.has(
                `${invoice.organizationId}:${invoice.contractId ?? invoice.originContractId}`,
              )
            )
              gaps.push({ ...base, code: "SIGNED_CONTRACT_PROOF_MISSING" });
            if (
              !safeMinor(invoice.totalMinor) ||
              !safeMinor(invoice.commercialSnapshot?.monthlyMinor) ||
              invoice.commercialSnapshot?.currency !== invoice.currency
            )
              gaps.push({ ...base, code: "EXACT_SNAPSHOT_MISSING" });
            if (!sources.has(String(invoice._id)))
              gaps.push({ ...base, code: "MISSING_MOVEMENT" });
            const movement = sources.get(String(invoice._id));
            const proof = movement?.billingEventId
              ? proofs.get(movement.billingEventId)
              : undefined;
            if (
              movement &&
              (!proof ||
                String(proof.organizationId) !== movement.organizationId ||
                proof.externalReference !== invoice.providerInvoiceId ||
                movement.sourceReference !== invoice.providerInvoiceId)
            )
              gaps.push({ ...base, code: "MOVEMENT_PROVIDER_PROOF_CONFLICT" });
            if (
              movement &&
              (movement.organizationId !== String(invoice.organizationId) ||
                movement.subscriptionId !== String(invoice.subscriptionId) ||
                movement.newMinor !==
                  String(invoice.commercialSnapshot?.monthlyMinor) ||
                movement.contractId !==
                  String(invoice.contractId ?? invoice.originContractId))
            )
              gaps.push({ ...base, code: "MOVEMENT_SOURCE_CONFLICT" });
          }
          const invoiceIds = new Set(invoices.map((i) => String(i._id)));
          for (const e of events) {
            if (
              e.sourceKind === "VERIFIED_PAYMENT" &&
              (!e.invoiceId || !invoiceIds.has(e.invoiceId))
            )
              gaps.push({
                code: "MOVEMENT_SOURCE_MISSING",
                sourceId: e.id,
                organizationId: e.organizationId,
                effectiveAt: e.effectiveAt,
              });
          }
          // Cancellation webhooks can commit their state before the envelope is marked
          // processed. Until that final verification is retained, reports fail closed.
          const webhookIds = events.flatMap((e) =>
            e.webhookEventId ? [new Types.ObjectId(e.webhookEventId)] : [],
          );
          const confirmed = await WebhookEvent.find({
            _id: { $in: webhookIds },
            provider: "PAYSTACK",
            status: "PROCESSED",
          })
            .select("_id")
            .limit(maximum)
            .session(session)
            .lean();
          const webhookProof = new Set(confirmed.map((e) => String(e._id)));
          for (const e of events.filter(
            (e) => e.sourceKind === "VERIFIED_WEBHOOK",
          ))
            if (!e.webhookEventId || !webhookProof.has(e.webhookEventId))
              gaps.push({
                code: "LIFECYCLE_PROVIDER_PROOF_MISSING",
                sourceId: e.id,
                organizationId: e.organizationId,
                effectiveAt: e.effectiveAt,
              });
          const streams = new Set(events.map((e) => e.subscriptionId));
          for (const s of subscriptions.slice(0, maximum))
            if (!streams.has(String(s._id)))
              gaps.push({
                code: "SUBSCRIPTION_OPENING_MISSING",
                sourceId: String(s._id),
                organizationId: String(s.organizationId),
              });
          return {
            events,
            gaps,
            truncated:
              rawEvents.length > maximum ||
              invoices.length > maximum ||
              subscriptions.length > maximum,
            limit: maximum,
          };
        },
        { readConcern: { level: "snapshot" } },
      );
    } finally {
      await session.endSession();
    }
  },
  async movements(currency: string, page: number, organizationId?: string) {
    const match = {
      currency,
      dataset: "LIVE",
      ...(organizationId
        ? { organizationId: new Types.ObjectId(organizationId) }
        : {}),
    };
    const stages: PipelineStage[] = [
      { $match: match },
      ...organizationJoin(scope),
    ];
    const [result] = await SubscriptionMovement.aggregate([
      ...stages,
      {
        $facet: {
          items: [
            { $sort: { effectiveAt: -1, _id: -1 } },
            { $skip: (page - 1) * 20 },
            { $limit: 20 },
            { $unset: ["organization", "org"] },
          ],
          total: [{ $count: "count" }],
        },
      },
    ]).option({ maxTimeMS: 15000 });
    return {
      items: result?.items ?? [],
      total: result?.total[0]?.count ?? 0,
      page,
    };
  },
  async source(id: string) {
    const [event] = await SubscriptionMovement.aggregate([
      { $match: { _id: new Types.ObjectId(id), dataset: "LIVE" } },
      ...organizationJoin(scope),
      { $limit: 1 },
    ]).option({ maxTimeMS: 10000 });
    if (!event) return null;
    const invoice = event.invoiceId
      ? await SubscriptionInvoice.findOne({
          _id: event.invoiceId,
          organizationId: event.organizationId,
          subscriptionId: event.subscriptionId,
        })
          .select(
            "_id invoiceNumber currency totalMinor paidAt periodStart periodEnd status provider contractId originContractId",
          )
          .lean()
      : null;
    const proof = event.billingEventId
      ? await BillingEvent.findOne({
          _id: event.billingEventId,
          organizationId: event.organizationId,
        })
          .select("_id provider type status processedAt externalReference")
          .lean()
      : null;
    const webhook = event.webhookEventId
      ? await WebhookEvent.findById(event.webhookEventId)
          .select("_id provider eventId status receivedAt processedAt")
          .lean()
      : null;
    delete event.organization;
    delete event.org;
    return { event, invoice, proof, webhook };
  },
};
