import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/AppError.js';
import { hashPayload } from '../../core/integrations/webhook.security.js';
import { SalesMessage, SalesConversationEntry, SalesRecipientControl } from '../../database/models/SalesCommunication.js';
import { SalesActivity } from '../../database/models/SalesActivity.js';
import { Notification } from '../../database/models/Notification.js';
import { WebhookEvent } from '../../database/models/WebhookEvent.js';
import { Job } from '../../database/models/Job.js';
import { AuditService } from '../audit/audit.service.js';
import { verifySalesResendWebhook, type ResendSignatureHeaders } from '../../integrations/notifications/sales-resend-webhook.js';
import { normalizedMailbox, salesInboundProvider } from '../../integrations/notifications/sales-inbound.provider.js';
import { salesTransaction } from './sales-agent.repository.js';
import { assertOutreachIndexes } from './sales-success-indexes.js';
import { opaqueHash, recipientHash, requestsSalesOptOut } from './sales-outreach.policy.js';
import { SalesConsentService } from './sales-consent.service.js';
const eventTypes = ['email.sent', 'email.delivered', 'email.failed', 'email.bounced', 'email.complained', 'email.received'] as const;
const envelope = z.object({ type: z.string().max(80), created_at: z.iso.datetime({ offset: true }), data: z.unknown() });
const mailData = z.object({ email_id: z.uuid(), from: z.string().max(1000), to: z.array(z.string().max(320)).max(50), tags: z.record(z.string().max(256), z.string().max(256)).optional() });
const normalizedEvent = z.object({
  type: z.enum(eventTypes), emailId: z.uuid(), messageId: z.string().regex(/^[a-f\d]{24}$/i), occurredAt: z.iso.datetime({ offset: true }), verified: z.literal(true),
}).strict();
const replyAliases = (addresses: string[]) => addresses.map(normalizedMailbox).filter((v): v is string => !!v).flatMap(mailbox => {
  const match = mailbox.match(/^sales-([\w-]{43})@/); return match?.[1] ? [{ mailbox, hash: opaqueHash(match[1]) }] : [];
});
export class SalesOutreachWebhookService {
  static async receive(body: Buffer | undefined, headers: ResendSignatureHeaders) {
    if (!body) throw new AppError(401, 'WEBHOOK_SIGNATURE_INVALID', 'Raw signed webhook content is required');
    const eventId = verifySalesResendWebhook(body, headers, env.SALES_RESEND_WEBHOOK_SECRET), digest = hashPayload(body);
    const observedAt = new Date();
    let parsed: z.infer<typeof envelope>;
    try { parsed = envelope.parse(JSON.parse(body.toString('utf8'))); } catch { throw new AppError(400, 'WEBHOOK_PAYLOAD_INVALID', 'Webhook payload is invalid'); }
    await assertOutreachIndexes();
    try {
      return await salesTransaction(async session => {
        const existing = await WebhookEvent.findOne({ provider: 'RESEND_SALES', eventId }).session(session);
        if (existing) {
          if (existing.payloadHash !== digest) throw new AppError(409, 'WEBHOOK_EVENT_CONFLICT', 'Webhook identifier belongs to another payload');
          return { received: true, duplicate: true };
        }
        let payload: z.infer<typeof normalizedEvent> | undefined;
        if ((eventTypes as readonly string[]).includes(parsed.type)) {
          const data = mailData.parse(parsed.data);
          let message;
          if (parsed.type === 'email.received') {
            const aliases = replyAliases(data.to);
            message = aliases.length ? await SalesMessage.findOne({ channel: 'EMAIL', provider: 'RESEND', replyHash: { $in: aliases.map(a => a.hash) }, replyTo: { $in: aliases.map(a => a.mailbox) } }).session(session) : null;
          } else {
            const tag = data.tags?.sales_message_id;
            message = await SalesMessage.findOne({ provider: 'RESEND', channel: 'EMAIL', ...(tag && /^[a-f\d]{24}$/i.test(tag) ? { _id: tag } : { providerMessageId: data.email_id }) }).session(session);
            const sender = normalizedMailbox(data.from), recipients = data.to.map(normalizedMailbox).filter((v): v is string => !!v).map(v => recipientHash('EMAIL', v));
            if (message && (!message.firstAttemptAt || sender !== message.sender.toLowerCase() || !recipients.includes(message.recipientHash) || (message.providerMessageId && message.providerMessageId !== data.email_id))) message = null;
          }
          if (message) payload = normalizedEvent.parse({ type: parsed.type, emailId: data.email_id, messageId: String(message._id), occurredAt: parsed.created_at, verified: true });
        }
        const [event] = await WebhookEvent.create([{ provider: 'RESEND_SALES', eventId, payloadHash: digest, payload: payload ?? { type: 'IGNORED_EVENT', verified: true }, receivedAt: observedAt, status: payload ? 'RECEIVED' : 'IGNORED', ...(payload ? { externalReference: payload.emailId } : { processedAt: observedAt }) }], { session });
        if (!event) throw new AppError(500, 'WEBHOOK_WRITE_FAILED', 'Could not persist verified webhook');
        if (payload) {
          // A response is a stop condition before body retrieval. It is not evidence that the prospect read the pitch.
          if (payload.type === 'email.received') {
            const message = await SalesMessage.findById(payload.messageId).session(session);
            if (message) {
              await SalesMessage.updateOne({ _id: message._id }, { $max: { lastResponseAt: event.receivedAt } }, { session });
              await SalesRecipientControl.updateOne({ channel: message.channel, recipientHash: message.recipientHash }, { $max: { lastResponseAt: event.receivedAt } }, { session, upsert: true });
            }
          }
          await Job.create([{ type: 'sales.outreach.webhook', payload: { webhookId: String(event._id) }, availableAt: new Date(), priority: 10, maxAttempts: 5, dedupeKey: `sales-outreach-webhook:${event._id}` }], { session });
        }
        await AuditService.record({ action: 'sales.outreach.webhook.verified', resourceType: 'WebhookEvent', resourceId: event._id, metadata: { eventId, type: payload?.type ?? 'IGNORED_EVENT', payloadHash: digest } }, session);
        return { received: true, ignored: !payload };
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
        const existing = await WebhookEvent.findOne({ provider: 'RESEND_SALES', eventId }).lean();
        if (existing?.payloadHash === digest) return { received: true, duplicate: true };
        throw new AppError(409, 'WEBHOOK_EVENT_CONFLICT', 'Webhook identifier belongs to another payload');
      }
      throw error;
    }
  }
  static async consume(id: string) {
    const event = await WebhookEvent.findOne({ _id: id, provider: 'RESEND_SALES' });
    if (!event || ['PROCESSED', 'IGNORED'].includes(event.status)) return { skipped: true };
    const payload = normalizedEvent.parse(event.payload);
    try {
      const received = payload.type === 'email.received' ? await (async () => {
        const provider = salesInboundProvider(); if (!provider) throw new AppError(503, 'SALES_INBOUND_NOT_CONFIGURED', 'Business email receiving is unavailable'); return provider.retrieve(payload.emailId);
      })() : undefined;
      return await salesTransaction(async session => {
        const current = await WebhookEvent.findOne({ _id: event._id, status: { $in: ['RECEIVED', 'FAILED'] } }).session(session);
        if (!current) return { skipped: true };
        const message = await SalesMessage.findOne({ _id: payload.messageId, provider: 'RESEND', channel: 'EMAIL' }).session(session);
        if (!message) { current.status = 'IGNORED'; current.error = 'OUTREACH_MESSAGE_UNAVAILABLE'; await current.save({ session }); return { ignored: true }; }
        const occurredAt = new Date(payload.occurredAt), observedAt = event.receivedAt;
        if (received) {
          if (received.id !== payload.emailId || !message.replyTo || !received.to.map(v => v.toLowerCase()).includes(message.replyTo.toLowerCase())) throw new AppError(409, 'SALES_REPLY_ROUTE_MISMATCH', 'Received content no longer matches the recorded reply route');
          const matched = recipientHash('EMAIL', received.from) === message.recipientHash;
          const expiry = new Date(Date.now() + env.SALES_OUTREACH_CONTENT_RETENTION_DAYS * 86400000);
          const body = matched ? received.text || 'Incoming email contained no readable text. Review the receiving provider for original content or attachments.' : 'A response reached this invitation from an unreviewed sender address. Review it in the receiving provider before associating its content with this customer.';
          await SalesConversationEntry.updateOne({ sourceKey: 'inbound:' + payload.emailId }, { $setOnInsert: { leadId: message.leadId, messageId: message._id, direction: 'INBOUND', provider: 'RESEND', subject: matched ? received.subject : 'Reply requires identity review', text: body, occurredAt: received.occurredAt, senderAuthentication: received.domainAuthenticated ? 'DOMAIN_AUTHENTICATED' : 'UNKNOWN', correlation: matched ? 'RECIPIENT_MATCHED' : 'REVIEW_REQUIRED', contentTruncated: received.truncated, contentExpiresAt: expiry } }, { session, upsert: true });
          await SalesMessage.updateOne({ _id: message._id }, { $max: { lastResponseAt: observedAt, ...(matched ? { lastReplyAt: observedAt } : {}) } }, { session });
          await SalesRecipientControl.updateOne({ channel: message.channel, recipientHash: message.recipientHash }, { $max: { lastResponseAt: observedAt, ...(matched ? { lastReplyAt: observedAt } : {}) } }, { session, upsert: true });
          await SalesActivity.updateOne({ leadId: message.leadId, sourceKey: 'outreach-reply:' + payload.emailId }, { $setOnInsert: { actorKind: 'SYSTEM', kind: matched ? 'sales.outreach.reply.received' : 'sales.outreach.reply.review_required', text: matched ? 'A provider-received reply matched the reviewed contact address; sender authentication is retained separately.' : 'An incoming response requires sender identity review before its content is associated.', resourceId: message._id, sourceOccurredAt: received.occurredAt } }, { session, upsert: true });
          await Job.updateOne({ dedupeKey: `sales-outreach-retention:${message._id}:${payload.emailId}` }, { $setOnInsert: { type: 'sales.outreach.expire', payload: { messageId: String(message._id) }, availableAt: expiry, maxAttempts: 5 } }, { session, upsert: true });
          if (requestsSalesOptOut(received.text)) await SalesConsentService.suppress(message.leadId, { channel: message.channel, recipientHash: message.recipientHash }, 'PROVIDER_REPLY', 'Verified receiving provider recorded an explicit stop request on the message reply route.', session);
        } else {
          if (message.providerMessageId && message.providerMessageId !== payload.emailId) throw new AppError(409, 'OUTREACH_PROVIDER_CONFLICT', 'Provider message reference conflicts with the recorded message');
          message.providerMessageId = payload.emailId; message.providerAcceptedAt ??= occurredAt; message.status = 'SENT';
          const summaries = { 'email.sent': ['ACCEPTED', 0], 'email.failed': ['FAILED', 1], 'email.delivered': ['DELIVERED', 2], 'email.bounced': ['BOUNCED', 3] } as const;
          if (payload.type !== 'email.complained' && payload.type !== 'email.received') {
            const [status, rank] = summaries[payload.type];
            if (payload.type === 'email.delivered') message.deliveredAt ??= occurredAt;
            if (payload.type === 'email.bounced') message.bouncedAt ??= occurredAt;
            if ((payload.type !== 'email.sent' || message.deliveryStatus === 'UNKNOWN') && (!message.deliveryEventAt || occurredAt > message.deliveryEventAt || (+occurredAt === +message.deliveryEventAt && rank >= message.deliveryEventRank))) {
              message.deliveryStatus = status; message.deliveryEventAt = occurredAt; message.deliveryEventRank = rank;
            }
            if (status === 'FAILED' && !message.deliveredAt && !message.firstAttemptAt) message.dedupeActive = false;
          }
          if (message.deliveryStatus === 'BOUNCED') message.errorCode = 'RESEND_BOUNCED';
          else if (message.deliveryStatus === 'FAILED') message.errorCode = 'RESEND_FAILED';
          else if (['ACCEPTED', 'DELIVERED'].includes(message.deliveryStatus)) message.errorCode = undefined;
          await message.save({ session });
          await Notification.updateOne({ _id: message.notificationId, salesMessageId: message._id }, { $set: { status: message.deliveryStatus === 'DELIVERED' ? 'DELIVERED' : ['FAILED', 'BOUNCED'].includes(message.deliveryStatus) ? 'FAILED' : 'SENT', sentAt: message.providerAcceptedAt, ...(message.errorCode ? { failureReason: message.errorCode } : {}) }, ...(!message.errorCode ? { $unset: { failureReason: 1 } } : {}) }, { session });
          await SalesConversationEntry.updateOne({ sourceKey: `outbound:${message._id}` }, { $setOnInsert: { leadId: message.leadId, messageId: message._id, direction: 'OUTBOUND', provider: message.provider, subject: message.subject, text: message.body, occurredAt: message.providerAcceptedAt, contentExpiresAt: message.contentExpiresAt, ...(message.redactedAt ? { redactedAt: message.redactedAt } : {}) } }, { session, upsert: true });
          await SalesActivity.updateOne({ leadId: message.leadId, sourceKey: `outreach-provider:${event.eventId}` }, { $setOnInsert: { actorKind: 'SYSTEM', kind: 'sales.outreach.' + payload.type.slice(6), text: 'Verified provider event: ' + payload.type + '. No human-reading claim is implied.', resourceId: message._id, sourceOccurredAt: occurredAt } }, { session, upsert: true });
          if (payload.type === 'email.bounced') await SalesRecipientControl.updateOne({ channel: message.channel, recipientHash: message.recipientHash }, { $inc: { epoch: 1 }, $set: { suppressedAt: new Date(), suppressionReason: 'BOUNCE' } }, { session, upsert: true });
          if (payload.type === 'email.complained') await SalesConsentService.suppress(message.leadId, { channel: message.channel, recipientHash: message.recipientHash }, 'PROVIDER_COMPLAINT', 'Verified provider reported a complaint about the sales message.', session);
        }
        current.status = 'PROCESSED'; current.processedAt = new Date(); current.error = undefined; await current.save({ session });
        await AuditService.record({ action: 'sales.outreach.provider.event.processed', resourceType: 'SalesMessage', resourceId: message._id, metadata: { eventId: event.eventId, type: payload.type, webhookId: String(event._id), senderAuthenticationIsNotAccountAuthentication: true } }, session);
        return { processed: true };
      });
    } catch (error) {
      const code = error instanceof AppError ? error.code : 'OUTREACH_EVENT_PROCESSING_FAILED';
      await WebhookEvent.updateOne({ _id: event._id, status: { $ne: 'PROCESSED' } }, { $set: { status: 'FAILED', error: code } }).catch(() => undefined);
      throw new AppError(503, code, 'Sales provider event processing failed; retry or inspect the recorded event');
    }
  }
}
