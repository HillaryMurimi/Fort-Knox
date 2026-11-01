import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/AppError.js';
import { SalesMessage, SalesRecipientControl, SalesConversationEntry } from '../../database/models/SalesCommunication.js';
import { SalesLead } from '../../database/models/SalesLead.js';
import { SalesActivity } from '../../database/models/SalesActivity.js';
import { WebhookEvent } from '../../database/models/WebhookEvent.js';
import { Notification } from '../../database/models/Notification.js';
import { Job } from '../../database/models/Job.js';
import { AuditService } from '../audit/audit.service.js';
import { verifySalesTwilioWebhook } from '../../integrations/notifications/sales-twilio-webhook.js';
import { salesSmsInboundProvider, twilioMessageSid } from '../../integrations/notifications/sales-sms-inbound.provider.js';
import { requestsSmsOptOut } from '../../integrations/notifications/sales-sms.policy.js';
import { SalesConsentService } from './sales-consent.service.js';
import { salesTransaction } from './sales-agent.repository.js';
import { recipientHash, opaqueHash } from './sales-outreach.policy.js';
import { payloadHash } from './sales-agent.service.js';
const phone = z.string().regex(/^\+[1-9]\d{7,14}$/);
const statuses = z.enum(['accepted', 'scheduled', 'queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'canceled', 'received']);
const normalized = z.object({ sid: twilioMessageSid, status: statuses, messageId: z.string().regex(/^[a-f\d]{24}$/i).nullable(), recipientHash: z.string().regex(/^[a-f\d]{64}$/), sender: phone, stop: z.boolean(), bodyHash: z.string(), errorCode: z.string().regex(/^\d{1,10}$/).optional() }).strict();
export class SalesSmsWebhookService {
  static async receive(raw: unknown, signature: string | undefined, messageId?: string) {
    const params = verifySalesTwilioWebhook(raw, signature, messageId);
    const sid = twilioMessageSid.parse(params.MessageSid), status = statuses.parse(params.MessageStatus ?? params.SmsStatus), from = phone.parse(params.From), to = phone.parse(params.To);
    const inbound = status === 'received', hash = recipientHash('SMS', inbound ? from : to), sender = inbound ? to : from;
    const stop = inbound && requestsSmsOptOut(params.Body ?? '', params.OptOutType);
    const eventId = sid + ':' + status;
    const observedAt = new Date();
    let verifiedDigest: string | undefined;
    return salesTransaction(async session => {
      let message;
      if (inbound) {
        const leads = await SalesLead.find({ phone: from, mergedInto: { $exists: false } }).select('mergedLeadIds').limit(2).session(session);
        const lead = leads.length === 1 ? leads[0] : undefined;
        message = lead ? await SalesMessage.findOne({ leadId: { $in: [lead._id, ...lead.mergedLeadIds] }, channel: 'SMS', provider: 'TWILIO', recipientHash: hash, sender, firstAttemptAt: { $type: 'date' } }).sort({ createdAt: -1, _id: -1 }).session(session) : null;
        const dedicated = sender === env.SALES_SMS_FROM && sender !== env.SMS_FROM;
        if (!message && !dedicated) return { received: true, ignored: true };
      } else {
        message = await SalesMessage.findOne({ channel: 'SMS', provider: 'TWILIO', ...(messageId ? { _id: messageId } : { providerMessageId: sid }) }).session(session);
        if (message && (!message.firstAttemptAt || message.sender !== sender || message.recipientHash !== hash || (message.providerMessageId && message.providerMessageId !== sid))) message = null;
      }
      const value = normalized.parse({ sid, status, messageId: message ? String(message._id) : null, recipientHash: hash, sender, stop, bodyHash: inbound ? opaqueHash(params.Body ?? '') : '', ...(params.ErrorCode && /^\d{1,10}$/.test(params.ErrorCode) ? { errorCode: params.ErrorCode } : {}) });
      const digest = payloadHash({ ...value, messageId: undefined }); verifiedDigest = digest;
      const existing = await WebhookEvent.findOne({ provider: 'TWILIO_SALES', eventId }).session(session);
      if (existing) {
        if (existing.payloadHash !== digest) throw new AppError(409, 'WEBHOOK_EVENT_CONFLICT', 'SMS callback identity conflicts with recorded evidence');
        return { received: true, duplicate: true };
      }
      const process = !!message || inbound;
      const [event] = await WebhookEvent.create([{ provider: 'TWILIO_SALES', eventId, externalReference: sid, payloadHash: digest, payload: value, receivedAt: observedAt, status: process ? 'RECEIVED' : 'IGNORED', ...(!process ? { processedAt: observedAt } : {}) }], { session });
      if (!event) throw new AppError(500, 'WEBHOOK_WRITE_FAILED', 'Could not persist SMS callback');
      if (inbound) {
        if (message) await SalesMessage.updateOne({ _id: message._id }, { $max: { lastResponseAt: event.receivedAt } }, { session });
        await SalesRecipientControl.updateOne({ channel: 'SMS', recipientHash: hash }, { $max: { lastResponseAt: event.receivedAt } }, { session, upsert: true });
      }
      // Signed stop instructions are denial-only and must take effect before optional body retrieval.
      if (stop) {
        if (message) await SalesConsentService.suppress(message.leadId, { channel: 'SMS', recipientHash: hash }, 'PROVIDER_REPLY', 'Verified sales SMS callback recorded an explicit stop request.', session);
        else await SalesRecipientControl.updateOne({ channel: 'SMS', recipientHash: hash }, { $inc: { epoch: 1 }, $set: { suppressedAt: new Date(), suppressionReason: 'OPT_OUT' } }, { session, upsert: true });
      }
      if (message) await Job.create([{ type: 'sales.sms.webhook', payload: { webhookId: String(event._id) }, priority: 10, maxAttempts: 5, availableAt: new Date(), dedupeKey: 'sales-sms-webhook:' + event._id }], { session });
      else if (inbound) { event.status = 'PROCESSED'; event.processedAt = new Date(); await event.save({ session }); }
      await AuditService.record({ action: 'sales.sms.callback.verified', resourceType: 'WebhookEvent', resourceId: event._id, metadata: { providerMessageId: sid, status, matchedMessage: !!message, stop, payloadHash: digest, accountAuthentication: false } }, session);
      return { received: true, ignored: !process };
    }).catch(async (error: unknown) => {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000 && verifiedDigest) {
        const existing = await WebhookEvent.findOne({ provider: 'TWILIO_SALES', eventId }).lean();
        if (existing?.payloadHash === verifiedDigest) return { received: true, duplicate: true };
        throw new AppError(409, 'WEBHOOK_EVENT_CONFLICT', 'SMS callback identity conflicts with recorded evidence');
      }
      throw error;
    });
  }
  static async consume(id: string) {
    const event = await WebhookEvent.findOne({ _id: id, provider: 'TWILIO_SALES' });
    if (!event || ['PROCESSED', 'IGNORED'].includes(event.status)) return { skipped: true };
    const value = normalized.parse(event.payload);
    try {
      const received = value.status === 'received' ? await (async () => {
        const provider = salesSmsInboundProvider(); if (!provider) throw new AppError(503, 'SALES_SMS_INBOUND_NOT_CONFIGURED', 'Sales SMS receiving is unavailable'); return provider.retrieve(value.sid);
      })() : undefined;
      return await salesTransaction(async session => {
        const current = await WebhookEvent.findOne({ _id: event._id, status: { $in: ['RECEIVED', 'FAILED'] } }).session(session);
        if (!current) return { skipped: true };
        const message = await SalesMessage.findOne({ _id: value.messageId, channel: 'SMS', provider: 'TWILIO', recipientHash: value.recipientHash, sender: value.sender }).session(session);
        if (!message) { current.status = 'IGNORED'; current.error = 'SALES_SMS_MESSAGE_UNAVAILABLE'; await current.save({ session }); return { ignored: true }; }
        if (received) {
          if (received.id !== value.sid || received.to !== value.sender || recipientHash('SMS', received.from) !== value.recipientHash) throw new AppError(409, 'SALES_SMS_REPLY_MISMATCH', 'Retrieved SMS does not match its verified callback');
          const expiry = new Date(Date.now() + env.SALES_OUTREACH_CONTENT_RETENTION_DAYS * 86400000);
          await SalesConversationEntry.updateOne({ sourceKey: 'sms-inbound:' + value.sid }, { $setOnInsert: { leadId: message.leadId, messageId: message._id, direction: 'INBOUND', provider: 'TWILIO', text: received.text || 'Incoming SMS had no readable text; attachments were not retrieved.', occurredAt: received.occurredAt, correlation: 'RECIPIENT_MATCHED', senderAuthentication: 'UNKNOWN', contentTruncated: received.truncated, contentExpiresAt: expiry } }, { session, upsert: true });
          await SalesMessage.updateOne({ _id: message._id }, { $max: { lastReplyAt: event.receivedAt, lastResponseAt: event.receivedAt } }, { session });
          await SalesRecipientControl.updateOne({ channel: 'SMS', recipientHash: value.recipientHash }, { $max: { lastReplyAt: event.receivedAt, lastResponseAt: event.receivedAt } }, { session, upsert: true });
          await Job.updateOne({ dedupeKey: `sales-outreach-retention:${message._id}:${value.sid}` }, { $setOnInsert: { type: 'sales.outreach.expire', payload: { messageId: String(message._id) }, availableAt: expiry, maxAttempts: 5 } }, { session, upsert: true });
          if (!value.stop && requestsSmsOptOut(received.text)) await SalesConsentService.suppress(message.leadId, { channel: 'SMS', recipientHash: value.recipientHash }, 'PROVIDER_REPLY', 'Authenticated provider retrieval recorded an explicit SMS stop request.', session);
        } else {
          if (message.providerMessageId && message.providerMessageId !== value.sid) throw new AppError(409, 'OUTREACH_PROVIDER_CONFLICT', 'SMS provider reference conflicts with the recorded message');
          message.providerMessageId = value.sid; message.providerAcceptedAt ??= event.receivedAt; message.status = 'SENT';
          const rank = value.status === 'delivered' ? 4 : ['failed', 'undelivered', 'canceled'].includes(value.status) ? 3 : value.status === 'sent' ? 2 : 1;
          if (rank >= message.deliveryEventRank) {
            message.deliveryStatus = rank === 4 ? 'DELIVERED' : rank === 3 ? 'FAILED' : 'ACCEPTED'; message.deliveryEventRank = rank; message.deliveryEventAt = event.receivedAt;
            if (rank === 4) message.deliveredAt ??= event.receivedAt;
            message.errorCode = rank === 3 ? 'TWILIO_' + value.status.toUpperCase() + (value.errorCode ? '_' + value.errorCode : '') : undefined;
          }
          await message.save({ session });
          await Notification.updateOne({ _id: message.notificationId, salesMessageId: message._id }, { $set: { status: message.deliveryStatus === 'DELIVERED' ? 'DELIVERED' : message.deliveryStatus === 'FAILED' ? 'FAILED' : 'SENT', sentAt: message.providerAcceptedAt, ...(message.errorCode ? { failureReason: message.errorCode } : {}) }, ...(!message.errorCode ? { $unset: { failureReason: 1 } } : {}) }, { session });
          await SalesConversationEntry.updateOne({ sourceKey: 'outbound:' + message._id }, { $setOnInsert: { leadId: message.leadId, messageId: message._id, direction: 'OUTBOUND', provider: 'TWILIO', text: message.body, occurredAt: message.providerAcceptedAt, contentExpiresAt: message.contentExpiresAt, ...(message.redactedAt ? { redactedAt: message.redactedAt } : {}) } }, { session, upsert: true });
          if (value.errorCode === '21610') await SalesConsentService.suppress(message.leadId, { channel: 'SMS', recipientHash: message.recipientHash }, 'PROVIDER_REPLY', 'Verified provider reported a previously opted-out SMS recipient (21610); no new reply is inferred.', session);
          else if (rank === 3 && ['30003', '30005', '30006'].includes(value.errorCode ?? '')) await SalesRecipientControl.updateOne({ channel: 'SMS', recipientHash: message.recipientHash }, { $inc: { epoch: 1 }, $set: { suppressedAt: new Date(), suppressionReason: 'BOUNCE' } }, { session, upsert: true });
        }
        await SalesActivity.updateOne({ leadId: message.leadId, sourceKey: 'sms-event:' + event.eventId }, { $setOnInsert: { actorKind: 'SYSTEM', kind: value.status === 'received' ? 'sales.outreach.reply.received' : 'sales.outreach.sms.' + value.status, text: 'Verified SMS provider event: ' + value.status + '. Network address correlation is not account authentication or human-reading evidence.', resourceId: message._id, sourceOccurredAt: received?.occurredAt ?? event.receivedAt } }, { session, upsert: true });
        current.status = 'PROCESSED'; current.processedAt = new Date(); current.error = undefined; await current.save({ session });
        await AuditService.record({ action: 'sales.sms.event.processed', resourceType: 'SalesMessage', resourceId: message._id, metadata: { webhookId: String(event._id), providerMessageId: value.sid, status: value.status, sourceTime: received ? 'PROVIDER_CREATED_AT' : 'APPLICATION_OBSERVED_AT' } }, session);
        return { processed: true };
      });
    } catch (error) {
      const code = error instanceof AppError ? error.code : 'SALES_SMS_EVENT_FAILED';
      await WebhookEvent.updateOne({ _id: event._id, status: { $ne: 'PROCESSED' } }, { $set: { status: 'FAILED', error: code } }).catch(() => undefined);
      throw new AppError(503, code, 'Sales SMS event processing failed; inspect or retry the recorded event');
    }
  }
}
