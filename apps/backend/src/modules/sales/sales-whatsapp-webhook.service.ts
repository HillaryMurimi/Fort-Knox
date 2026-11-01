import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/AppError.js';
import { SalesMessage, SalesRecipientControl, SalesConversationEntry } from '../../database/models/SalesCommunication.js';
import { SalesLead } from '../../database/models/SalesLead.js';
import { WebhookEvent } from '../../database/models/WebhookEvent.js';
import { Notification } from '../../database/models/Notification.js';
import { Job } from '../../database/models/Job.js';
import { AuditService } from '../audit/audit.service.js';
import { verifySalesWhatsAppSignature } from '../../integrations/notifications/sales-whatsapp-webhook.js';
import { SalesConsentService } from './sales-consent.service.js';
import { salesTransaction } from './sales-agent.repository.js';
import { recipientHash, opaqueHash } from './sales-outreach.policy.js';

const id = z.string().min(1).max(512), phone = z.string().regex(/^[1-9]\d{7,14}$/), timestamp = z.string().regex(/^\d{1,12}$/);
const incoming = z.object({ id, from: phone, timestamp, type: z.string().max(40), text: z.object({ body: z.string().max(10000) }).optional(), button: z.object({ text: z.string().max(200), payload: z.string().max(200) }).optional() });
const status = z.object({ id, recipient_id: phone, timestamp, status: z.enum(['sent', 'delivered', 'read', 'failed']), biz_opaque_callback_data: z.string().regex(/^[a-f\d]{24}$/i).optional() });
const envelope = z.object({ object: z.literal('whatsapp_business_account'), entry: z.array(z.object({ id: z.string().regex(/^\d{5,40}$/), changes: z.array(z.object({ field: z.string().max(80), value: z.object({ metadata: z.object({ phone_number_id: z.string().regex(/^\d{5,40}$/) }), messages: z.array(incoming).max(100).optional(), statuses: z.array(status).max(100).optional() }) })).max(20) })).max(20) });
export function requestsWhatsAppOptOut(text: string) { return /^(stop|unsubscribe|opt[ -]?out|stop (?:messages|messaging|contacting me)|do not contact me)[.!\s]*$/i.test(text.trim()); }
export class SalesWhatsAppWebhookService {
  static async receive(raw: Buffer | undefined, signature: string | undefined) {
    verifySalesWhatsAppSignature(raw, signature);
    let decoded: unknown;
    try { decoded = JSON.parse(raw!.toString('utf8')); } catch { throw new AppError(400, 'WHATSAPP_CALLBACK_INVALID', 'Invalid callback body'); }
    const body = envelope.parse(decoded), observedAt = new Date();
    const count = body.entry.reduce((sum, entry) => sum + entry.changes.reduce((n, change) => n + (change.value.messages?.length ?? 0) + (change.value.statuses?.length ?? 0), 0), 0);
    if (count > 100) throw new AppError(413, 'WHATSAPP_CALLBACK_TOO_LARGE', 'Callback exceeds the bounded event batch');
    // All effects are database-only and commit atomically with the deduplication record.
    for (const entry of body.entry) for (const change of entry.changes) {
      if (change.field !== 'messages') continue;
      const senderId = change.value.metadata.phone_number_id;
      for (const item of [...(change.value.messages ?? []), ...(change.value.statuses ?? [])]) {
        const inbound = 'from' in item, sourceAt = new Date(Number(item.timestamp) * 1000);
        if (!Number.isFinite(sourceAt.getTime()) || sourceAt > new Date(observedAt.getTime() + 300000)) throw new AppError(400, 'WHATSAPP_CALLBACK_TIME_INVALID', 'Invalid provider event time');
        const state = inbound ? 'received' : item.status, hash = recipientHash('WHATSAPP', '+' + (inbound ? item.from : item.recipient_id));
        const text = inbound ? item.type === 'text' ? item.text?.body ?? '' : item.type === 'button' ? item.button?.payload ?? item.button?.text ?? '' : '' : '';
        const eventId = item.id + ':' + state, digest = opaqueHash(JSON.stringify({ id: item.id, state, source: item.timestamp, hash, senderId, business: entry.id, textHash: opaqueHash(text) }));
        await salesTransaction(async session => {
          const existing = await WebhookEvent.findOne({ provider: 'WHATSAPP_SALES', eventId }).session(session);
          if (existing) { if (existing.payloadHash !== digest) throw new AppError(409, 'WEBHOOK_EVENT_CONFLICT', 'WhatsApp event conflicts with recorded evidence'); return; }
          let message;
          if (inbound) {
            if (senderId !== env.WHATSAPP_PHONE_NUMBER_ID || entry.id !== env.SALES_WHATSAPP_BUSINESS_ACCOUNT_ID) return;
            const leads = await SalesLead.find({ phone: '+' + item.from, mergedInto: { $exists: false } }).limit(2).select('mergedLeadIds').session(session);
            const lead = leads.length === 1 ? leads[0] : undefined;
            message = lead ? await SalesMessage.findOne({ leadId: { $in: [lead._id, ...lead.mergedLeadIds] }, channel: 'WHATSAPP', provider: 'WHATSAPP_CLOUD', recipientHash: hash, 'whatsappTemplate.phoneNumberId': senderId, 'whatsappTemplate.businessAccountId': entry.id, firstAttemptAt: { $type: 'date' } }).sort({ createdAt: -1 }).session(session) : null;
          } else {
            message = await SalesMessage.findOne({ channel: 'WHATSAPP', provider: 'WHATSAPP_CLOUD', ...(item.biz_opaque_callback_data ? { _id: item.biz_opaque_callback_data } : { providerMessageId: item.id }), recipientHash: hash, 'whatsappTemplate.phoneNumberId': senderId, 'whatsappTemplate.businessAccountId': entry.id, firstAttemptAt: { $type: 'date' } }).session(session);
            if (message?.providerMessageId && message.providerMessageId !== item.id) message = null;
          }
          const [event] = await WebhookEvent.create([{ provider: 'WHATSAPP_SALES', eventId, externalReference: item.id, payloadHash: digest, payload: { status: state, recipientHash: hash, phoneNumberId: senderId, sourceOccurredAt: sourceAt }, receivedAt: observedAt, processedAt: observedAt, status: message || inbound ? 'PROCESSED' : 'IGNORED' }], { session });
          if (inbound) {
            await SalesRecipientControl.updateOne({ channel: 'WHATSAPP', recipientHash: hash }, { $max: { lastResponseAt: observedAt, lastReplyAt: observedAt } }, { session, upsert: true });
            if (requestsWhatsAppOptOut(text)) {
              if (message) await SalesConsentService.suppress(message.leadId, { channel: 'WHATSAPP', recipientHash: hash }, 'PROVIDER_REPLY', 'Signed WhatsApp callback recorded an explicit stop request.', session);
              else await SalesRecipientControl.updateOne({ channel: 'WHATSAPP', recipientHash: hash }, { $inc: { epoch: 1 }, $set: { suppressedAt: observedAt, suppressionReason: 'OPT_OUT' } }, { session, upsert: true });
            }
            if (message) {
              const expiry = new Date(observedAt.getTime() + env.SALES_OUTREACH_CONTENT_RETENTION_DAYS * 86400000);
              await SalesConversationEntry.create([{ sourceKey: 'whatsapp-inbound:' + item.id, leadId: message.leadId, messageId: message._id, direction: 'INBOUND', provider: 'WHATSAPP_CLOUD', text: text || 'Incoming WhatsApp message had no supported text; media was not retrieved.', occurredAt: sourceAt, correlation: 'RECIPIENT_MATCHED', senderAuthentication: 'UNKNOWN', contentExpiresAt: expiry }], { session });
              await SalesMessage.updateOne({ _id: message._id }, { $max: { lastResponseAt: observedAt, lastReplyAt: observedAt } }, { session });
              await Job.create([{ type: 'sales.outreach.expire', payload: { messageId: String(message._id) }, availableAt: expiry, maxAttempts: 5, dedupeKey: 'sales-whatsapp-retention:' + item.id }], { session });
            }
          } else if (message) {
            const rank = state === 'delivered' || state === 'read' ? 4 : state === 'failed' ? 3 : 2;
            message.providerMessageId = item.id; message.providerAcceptedAt ??= sourceAt; message.status = 'SENT';
            if (rank >= message.deliveryEventRank) {
              message.deliveryStatus = rank === 4 ? 'DELIVERED' : rank === 3 ? 'FAILED' : 'ACCEPTED'; message.deliveryEventRank = rank; message.deliveryEventAt = sourceAt;
              if (rank === 4) message.deliveredAt ??= sourceAt;
              message.errorCode = rank === 3 ? 'WHATSAPP_DELIVERY_FAILED' : undefined;
            }
            await message.save({ session });
            await SalesConversationEntry.updateOne({ sourceKey: 'outbound:' + message._id }, { $setOnInsert: { leadId: message.leadId, messageId: message._id, direction: 'OUTBOUND', provider: 'WHATSAPP_CLOUD', text: message.body, occurredAt: message.providerAcceptedAt, contentExpiresAt: message.contentExpiresAt, ...(message.redactedAt ? { redactedAt: message.redactedAt } : {}) } }, { session, upsert: true });
            await Notification.updateOne({ _id: message.notificationId, salesMessageId: message._id }, { $set: { status: message.deliveryStatus === 'DELIVERED' ? 'DELIVERED' : message.deliveryStatus === 'FAILED' ? 'FAILED' : 'SENT', sentAt: message.providerAcceptedAt, ...(message.errorCode ? { failureReason: message.errorCode } : {}) }, ...(!message.errorCode ? { $unset: { failureReason: 1 } } : {}) }, { session });
          }
          if (event) await AuditService.record({ action: 'sales.whatsapp.callback.verified', resourceType: 'WebhookEvent', resourceId: event._id, metadata: { providerMessageId: item.id, status: state, matchedMessage: !!message, sourceOccurredAt: sourceAt, humanReadingConfirmed: false, accountAuthenticated: false } }, session);
        }).catch(async (error: unknown) => {
          if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
            const existing = await WebhookEvent.findOne({ provider: 'WHATSAPP_SALES', eventId, payloadHash: digest });
            if (existing) return;
          }
          throw error;
        });
      }
    }
    return { received: true };
  }
}
