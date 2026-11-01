import { randomBytes, randomUUID } from 'node:crypto';
import { Types, type ClientSession, type HydratedDocument } from 'mongoose';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/AppError.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { SalesMessage, SalesCampaignUsage, SalesRecipientControl, SalesConversationEntry, SalesProviderControl, type SalesMessageRecord } from '../../database/models/SalesCommunication.js';
import { SalesCampaign } from '../../database/models/SalesCampaign.js';
import { SalesAgentApproval, SalesAgentRun } from '../../database/models/SalesAgent.js';
import { SalesActivity } from '../../database/models/SalesActivity.js';
import { Notification } from '../../database/models/Notification.js';
import { Job } from '../../database/models/Job.js';
import { PlatformSwitch } from '../../database/models/PlatformSwitch.js';
import { salesDeliveryProvider } from '../../integrations/notifications/sales-delivery.provider.js';
import { salesSmsBody, salesSmsConfigured, salesTwilioCallbackUrl } from '../../integrations/notifications/sales-sms.policy.js';
import { assertFreshAdmin } from '../auth/admin-security.js';
import { assertSwitchEnabled } from '../platform-control/platform-control.guard.js';
import { AuditService } from '../audit/audit.service.js';
import { SalesAgentRepository, salesTransaction } from './sales-agent.repository.js';
import { payloadHash, authorizeTask } from './sales-agent.service.js';
import { agentOutputSchema } from './sales-agent.schemas.js';
import { SuccessRepository, assertSuccessPermission } from './sales-success.repository.js';
import { SalesConsentService } from './sales-consent.service.js';
import { campaignPayload } from './sales-campaign.service.js';
import { assertOutreachIndexes } from './sales-success-indexes.js';
import { outreachDraftSchema, outreachDecisionSchema, outreachPageSchema, unsubscribeSchema } from './sales-outreach.schemas.js';
import { nextOutreachWindow, opaqueHash, recipientHash } from './sales-outreach.policy.js';

type Message = HydratedDocument<SalesMessageRecord>;
const terminal = ['SENT', 'FAILED', 'UNCERTAIN', 'CANCELLED', 'SUPPRESSED', 'EXPIRED', 'REJECTED'];
export const salesSenderConfigHash = (provider: string) => provider === 'TWILIO'
  ? payloadHash({ provider, sender: env.SALES_SMS_FROM, account: env.TWILIO_ACCOUNT_SID, credentialFingerprint: opaqueHash(env.TWILIO_AUTH_TOKEN ?? ''), callback: salesTwilioCallbackUrl(), cost: env.SALES_SMS_COST_PER_SEGMENT_MICRO_USD, segments: env.SALES_SMS_MAX_SEGMENTS, recipientDailyLimit: env.SALES_RECIPIENT_DAILY_LIMIT })
  : payloadHash({ provider, sender: env.EMAIL_FROM, name: env.EMAIL_FROM_NAME, replyDomain: env.SALES_REPLY_DOMAIN, origin: env.WEB_ORIGIN, credentialFingerprint: opaqueHash(env.RESEND_API_KEY ?? ''), cost: env.SALES_EMAIL_ESTIMATED_MICRO_USD, recipientDailyLimit: env.SALES_RECIPIENT_DAILY_LIMIT });
const transportSwitch = (channel: string) => channel === 'SMS' ? 'SMS_NOTIFICATIONS' : 'EMAIL_NOTIFICATIONS';
const senderFor = (channel: string) => channel === 'SMS' ? env.SALES_SMS_FROM : env.EMAIL_FROM;
const transportReady = (channel: string) => channel === 'SMS' ? salesSmsConfigured() : !!(env.EMAIL_FROM && env.SALES_REPLY_DOMAIN && env.SALES_RESEND_WEBHOOK_SECRET);
// The recipient is deliberately selected only for scoped preview, decision and delivery paths.
export function outreachPayload(m: SalesMessageRecord) {
  return { leadId: String(m.leadId), campaignId: String(m.campaignId), campaignHash: m.campaignHash, channel: m.channel, provider: m.provider,
    recipient: m.recipient, recipientHash: m.recipientHash, consentEventId: String(m.consentEventId), consentEpoch: m.consentEpoch,
    sender: m.sender, senderConfigHash: m.senderConfigHash, subject: m.subject ?? null, body: m.body, timezone: m.timezone,
    recipientDailyLimit: m.recipientDailyLimit, estimatedCostMicroUsd: m.estimatedCostMicroUsd, replyTo: m.replyTo ?? null,
    unsubscribeUrl: m.unsubscribeUrl, originApprovalId: m.originApprovalId ? String(m.originApprovalId) : null,
    followUpId: m.followUpId ? String(m.followUpId) : null, contentExpiresAt: m.contentExpiresAt?.toISOString(),
    ...(m.channel === 'SMS' ? { smsSegments: m.smsSegments, smsEncoding: m.smsEncoding } : {}),
  };
}
async function campaignFor(m: { campaignId: Types.ObjectId; campaignHash?: string }, session?: ClientSession, active = false) {
  const campaign = await SalesCampaign.findById(m.campaignId).session(session ?? null);
  if (!campaign || !(active ? ['ACTIVE'] : ['APPROVED', 'ACTIVE']).includes(campaign.status) || campaign.endsAt <= new Date() || !campaign.approvedHash || campaign.approvedHash !== payloadHash(campaignPayload(campaign)) || (m.campaignHash && m.campaignHash !== campaign.approvedHash))
    throw new AppError(409, 'CAMPAIGN_NOT_ACTIVE', 'Campaign is not currently approved, active or unchanged');
  return campaign;
}
async function enabled(channel: string) { await assertSwitchEnabled('SALES_OUTBOUND'); await assertSwitchEnabled(`SALES_${channel}`); }
async function responsible(m: SalesMessageRecord) {
  const actor = await SalesAgentRepository.principal(m.requestedBy);
  await SuccessRepository.load(actor, String(m.leadId), 'sales.outreach.prepare');
  assertSuccessPermission(actor, 'sales.notes.read');
  if (m.originApprovalId) {
    const proposal = await SalesAgentApproval.findOne({ _id: m.originApprovalId, leadId: m.leadId, tool: 'OUTREACH_DRAFT', status: { $in: ['APPROVED', 'COMPLETED'] } });
    const run = proposal ? await SalesAgentRun.findById(proposal.runId) : null;
    if (!run || !proposal || payloadHash(proposal.payload) !== proposal.payloadHash) throw new AppError(409, 'APPROVAL_CHANGED', 'Origin agent proposal is no longer available');
    const owner = await SalesAgentRepository.principal(run.requestedBy);
    await authorizeTask(owner, String(m.leadId), run.agent);
    assertSuccessPermission(actor, 'sales.meetings.read');
    await assertSwitchEnabled('SALES_AI_RUNTIME'); await assertSwitchEnabled(`SALES_AGENT_${run.agent}`);
    const config = await SalesAgentRepository.config(run.agent);
    if (!config?.enabled || config.paused) throw new AppError(409, 'AGENT_PAUSED', 'Origin agent is disabled or paused');
  }
  return actor;
}
async function consentMatches(m: SalesMessageRecord, session?: ClientSession) {
  const consent = await SalesConsentService.eligible(m.leadId, m.channel, session);
  if (consent.contact !== m.recipient || consent.hash !== m.recipientHash || recipientHash(m.channel, m.recipient) !== m.recipientHash || String(consent.event._id) !== String(m.consentEventId) || (consent.lead.consentRevision ?? 0) !== m.consentEpoch)
    throw new AppError(409, 'OUTREACH_CONSENT_CHANGED', 'Contact or consent changed after the reviewed draft');
  if ((consent.control.lastResponseAt && consent.control.lastResponseAt >= m.createdAt) || (consent.control.lastReplyAt && consent.control.lastReplyAt >= m.createdAt) || (m.lastReplyAt && m.lastReplyAt >= m.createdAt)) throw new AppError(409, 'OUTREACH_REPLY_RECEIVED', 'A response arrived at or after this draft; review the conversation before preparing another message');
  return consent;
}

export class SalesOutreachService {
  static async capabilities(auth: AuthenticatedUser) {
    AuthorizationService.assertPlatformAdmin(auth);
    const provider = salesDeliveryProvider('EMAIL'), last = await SalesMessage.findOne({ channel: 'EMAIL', provider: provider?.key ?? env.EMAIL_PROVIDER, senderConfigHash: salesSenderConfigHash(provider?.key ?? env.EMAIL_PROVIDER), providerAcceptedAt: { $type: 'date' } }).select('providerAcceptedAt provider').sort({ providerAcceptedAt: -1 }).lean();
    const switches = await PlatformSwitch.find({ key: { $in: ['SALES_OUTBOUND', 'SALES_EMAIL', 'EMAIL_NOTIFICATIONS', 'SALES_SMS', 'SMS_NOTIFICATIONS'] } }).select('key enabled mode').lean();
    const on = (key: string) => switches.some(s => s.key === key && s.enabled && s.mode === 'ON');
    const costPolicyConfigured = env.NODE_ENV === 'test' || env.SALES_EMAIL_ESTIMATED_MICRO_USD > 0;
    const sms = salesDeliveryProvider('SMS'), smsCostPolicy = env.NODE_ENV === 'test' || env.SALES_SMS_COST_PER_SEGMENT_MICRO_USD > 0;
    return { email: { provider: provider?.key ?? env.EMAIL_PROVIDER, configured: !!provider, authentication: 'UNVERIFIED', sendingAvailable: !!provider && !!env.EMAIL_FROM && costPolicyConfigured && !!env.SALES_RESEND_WEBHOOK_SECRET && !!env.SALES_REPLY_DOMAIN && ['SALES_OUTBOUND', 'SALES_EMAIL', 'EMAIL_NOTIFICATIONS'].every(on), costPolicyConfigured, webhook: env.SALES_RESEND_WEBHOOK_SECRET ? 'CONFIGURED_UNVERIFIED' : 'NOT_CONFIGURED', inbound: env.SALES_REPLY_DOMAIN ? 'CONFIGURED_UNVERIFIED' : 'NOT_CONFIGURED', lastSuccessfulOperation: last?.providerAcceptedAt ?? null, applicationRequestsPerMinute: env.SALES_EMAIL_REQUESTS_PER_MINUTE, providerRateLimit: 'UNVERIFIED' }, sms: { configured: !!sms && salesSmsConfigured(), salesAdapterAvailable: true, sendingAvailable: !!sms && salesSmsConfigured() && smsCostPolicy && ['SALES_OUTBOUND', 'SALES_SMS', 'SMS_NOTIFICATIONS'].every(on), authentication: 'UNVERIFIED', dedicatedSenderRequired: true, costPolicyConfigured: smsCostPolicy, maximumSegments: env.SALES_SMS_MAX_SEGMENTS, applicationRequestsPerMinute: env.SALES_SMS_REQUESTS_PER_MINUTE, webhook: salesSmsConfigured() ? 'CONFIGURED_UNVERIFIED' : 'NOT_CONFIGURED', providerRateLimit: 'UNVERIFIED', automaticResend: false }, whatsapp: { configured: !!(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN), salesAdapterAvailable: false, sendingAvailable: false } };
  }
  static async list(auth: AuthenticatedUser, id: string, raw: unknown) {
    const lead = await SuccessRepository.load(auth, id, 'sales.leads.read'); assertSuccessPermission(auth, 'sales.outreach.read'); const { page } = outreachPageSchema.parse(raw);
    const items = await SalesMessage.find({ leadId: { $in: [lead._id, ...lead.mergedLeadIds] } }).select('-body -replyTo -unsubscribeUrl -commandHash').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 20).limit(20).lean();
    return { items: items.map(m => m.contentExpiresAt && m.contentExpiresAt <= new Date() ? { ...m, subject: undefined, redactedAt: m.redactedAt ?? m.contentExpiresAt } : m), page, limit: 20 };
  }
  static async view(auth: AuthenticatedUser, id: string, messageId: string) {
    const lead = await SuccessRepository.load(auth, id, 'sales.leads.read'); assertSuccessPermission(auth, 'sales.outreach.read'); assertSuccessPermission(auth, 'sales.notes.read'); assertSuccessPermission(auth, 'sales.meetings.read');
    const message = await SalesMessage.findOne({ _id: messageId, leadId: { $in: [lead._id, ...lead.mergedLeadIds] } }).select('+recipient -commandHash').lean();
    if (!message) throw new AppError(404, 'OUTREACH_MESSAGE_NOT_FOUND', 'Message is unavailable for this customer');
    const campaign = await SalesCampaign.findById(message.campaignId).select('name status startsAt endsAt dailySendLimit perContactLimit budgetMicroUsd').lean();
    const expired = message.contentExpiresAt && message.contentExpiresAt <= new Date();
    return { message: expired ? { ...message, subject: undefined, recipient: undefined, body: 'Message content expired under retention.', redactedAt: message.redactedAt ?? message.contentExpiresAt } : message, campaign };
  }
  static async conversations(auth: AuthenticatedUser, id: string, raw: unknown) {
    const lead = await SuccessRepository.load(auth, id, 'sales.leads.read'); assertSuccessPermission(auth, 'sales.outreach.read'); assertSuccessPermission(auth, 'sales.notes.read'); const { page } = outreachPageSchema.parse(raw);
    const items = await SalesConversationEntry.find({ leadId: { $in: [lead._id, ...lead.mergedLeadIds] } }).sort({ occurredAt: -1, _id: -1 }).skip((page - 1) * 20).limit(20).lean();
    return { items: items.map(e => e.contentExpiresAt && e.contentExpiresAt <= new Date() ? { ...e, subject: undefined, text: 'Conversation content expired under retention.', redactedAt: e.redactedAt ?? e.contentExpiresAt } : e), page, limit: 20 };
  }
  static async prepare(auth: AuthenticatedUser, id: string, raw: unknown) {
    const lead = await SuccessRepository.load(auth, id, 'sales.outreach.prepare'); assertSuccessPermission(auth, 'sales.notes.read');
    const input = outreachDraftSchema.parse(raw), digest = payloadHash(input);
    await assertOutreachIndexes();
    const existing = await SalesMessage.findOne({ requestedBy: auth.userId, commandId: input.commandId });
    if (existing) {
      if (existing.commandHash !== digest || String(existing.leadId) !== id) throw new AppError(409, 'COMMAND_REUSED', 'Command belongs to another message');
      return { id: String(existing._id), status: existing.status };
    }
    const campaign = await campaignFor({ campaignId: new Types.ObjectId(input.campaignId) });
    if (!['EMAIL', 'SMS'].includes(campaign.channel)) throw new AppError(503, 'OUTREACH_CHANNEL_NOT_READY', 'This channel does not yet have an enabled sales delivery adapter');
    const provider = salesDeliveryProvider(campaign.channel);
    const sender = senderFor(campaign.channel);
    if (!provider || !sender) throw new AppError(503, 'OUTREACH_PROVIDER_NOT_CONFIGURED', 'Configure the approved dedicated business sender before preparing deliverable messages');
    const consent = await SalesConsentService.eligible(lead._id, campaign.channel);
    let subject = input.subject, body = input.body;
    if (input.originApprovalId) {
      assertSuccessPermission(auth, 'sales.agents.read'); assertSuccessPermission(auth, 'sales.meetings.read');
      const proposal = await SalesAgentApproval.findOne({ _id: input.originApprovalId, leadId: lead._id, tool: 'OUTREACH_DRAFT', status: { $in: ['APPROVED', 'COMPLETED'] }, decisionAt: { $gte: new Date(Date.now() - 7 * 86400000) } });
      if (!proposal || payloadHash(proposal.payload) !== proposal.payloadHash) throw new AppError(409, 'APPROVAL_CHANGED', 'Select a recently approved outreach proposal for this customer');
      const action = agentOutputSchema.shape.action.parse(proposal.payload); subject = action.subject ?? 'Dapinni product briefing'; body = action.text;
    }
    if (!body || body.length > 8000 || (campaign.channel === 'EMAIL' && (!subject || subject.length > 200 || /[\r\n]/.test(subject)))) throw new AppError(400, 'OUTREACH_CONTENT_INVALID', 'A reviewed message body and an email subject where applicable are required');
    const unsubscribe = randomBytes(32).toString('base64url'), reply = randomBytes(32).toString('base64url').toLowerCase();
    const unsubscribeUrl = env.WEB_ORIGIN.replace(/\/$/, '') + '/sales/unsubscribe/' + unsubscribe;
    const sms = campaign.channel === 'SMS' ? salesSmsBody(body) : undefined;
    const renderedBody = sms?.text ?? body + '\n\nDapinni Real Estate Solutions\nTo stop sales updates: ' + unsubscribeUrl;
    if (campaign.channel === 'SMS') subject = undefined;
    const contentFingerprint = payloadHash({ subject, body: sms?.text ?? body, channel: campaign.channel });
    const contentExpiresAt = new Date(Date.now() + env.SALES_OUTREACH_CONTENT_RETENTION_DAYS * 86400000);
    try {
      return await salesTransaction(async session => {
        const message = new SalesMessage({ leadId: lead._id, campaignId: campaign._id, campaignHash: campaign.approvedHash, requestedBy: auth.userId, originApprovalId: input.originApprovalId,
          channel: campaign.channel, provider: provider.key, recipient: consent.contact, recipientHash: consent.hash, consentEventId: consent.event._id, consentEpoch: consent.lead.consentRevision ?? 0,
          sender, senderConfigHash: salesSenderConfigHash(provider.key), subject, body: renderedBody,
          timezone: consent.event.timezone, recipientDailyLimit: env.SALES_RECIPIENT_DAILY_LIMIT, commandId: input.commandId, commandHash: digest, contentFingerprint,
          estimatedCostMicroUsd: sms ? sms.segments * env.SALES_SMS_COST_PER_SEGMENT_MICRO_USD : env.SALES_EMAIL_ESTIMATED_MICRO_USD, unsubscribeHash: opaqueHash(unsubscribe), unsubscribeUrl,
          ...(sms ? { smsSegments: sms.segments, smsEncoding: sms.encoding } : {}),
          ...(campaign.channel === 'EMAIL' && env.SALES_REPLY_DOMAIN ? { replyTo: 'sales-' + reply + '@' + env.SALES_REPLY_DOMAIN.toLowerCase(), replyHash: opaqueHash(reply) } : {}),
          contentExpiresAt,
        });
        message.payloadHash = payloadHash(outreachPayload(message)); await message.save({ session });
        await Job.create([{ type: 'sales.outreach.expire', payload: { messageId: String(message._id) }, availableAt: contentExpiresAt, dedupeKey: `sales-outreach-retention:${message._id}:original`, maxAttempts: 5 }], { session });
        await AuditService.record({ actorUserId: auth.userId, action: 'sales.outreach.draft.created', resourceType: 'SalesMessage', resourceId: message._id, metadata: { leadId: id, campaignId: input.campaignId, payloadHash: message.payloadHash, originApprovalId: input.originApprovalId } }, session);
        return { id: String(message._id), status: message.status };
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
        const duplicate = await SalesMessage.findOne({ requestedBy: auth.userId, commandId: input.commandId });
        if (duplicate && duplicate.commandHash === digest && String(duplicate.leadId) === id) return { id: String(duplicate._id), status: duplicate.status };
        throw new AppError(409, 'OUTREACH_DUPLICATE', 'An existing message already uses this command or active recipient/content combination');
      }
      throw error;
    }
  }
  static async decide(auth: AuthenticatedUser, id: string, messageId: string, raw: unknown) {
    const input = outreachDecisionSchema.parse(raw);
    const lead = await SuccessRepository.load(auth, id, 'sales.outreach.prepare');
    if (['APPROVE', 'RESUME', 'REJECT'].includes(input.action)) assertFreshAdmin(auth);
    if (['APPROVE', 'RESUME'].includes(input.action)) await assertOutreachIndexes();
    return salesTransaction(async session => {
      const message = await SalesMessage.findOne({ _id: messageId, leadId: { $in: [lead._id, ...lead.mergedLeadIds] }, revision: input.revision, payloadHash: input.payloadHash }).select('+recipient').session(session);
      if (!message || message.redactedAt || message.payloadHash !== payloadHash(outreachPayload(message))) throw new AppError(409, 'OUTREACH_MESSAGE_CHANGED', 'Reload the exact message before reviewing it');
      const valid = input.action === 'SUBMIT' ? ['DRAFT'] : input.action === 'APPROVE' ? ['PENDING_APPROVAL'] : input.action === 'RESUME' ? ['PAUSED'] : input.action === 'REJECT' ? ['PENDING_APPROVAL'] : ['DRAFT', 'PENDING_APPROVAL', 'QUEUED', 'PAUSED'];
      if (!valid.includes(message.status)) throw new AppError(409, 'OUTREACH_STATE_CHANGED', 'This message cannot make that transition');
      if (['SUBMIT', 'APPROVE', 'RESUME'].includes(input.action) && String(message.leadId) !== String(lead._id)) throw new AppError(409, 'CUSTOMER_MERGED', 'Prepare new outreach from the current canonical customer profile');
      if (input.action === 'SUBMIT') message.status = 'PENDING_APPROVAL';
      else if (['APPROVE', 'RESUME'].includes(input.action)) {
        await enabled(message.channel); await assertSwitchEnabled(transportSwitch(message.channel));
        await responsible(message); const campaign = await campaignFor(message, session, true); await consentMatches(message, session);
        const provider = salesDeliveryProvider(message.channel);
        if (!provider || provider.key !== message.provider || message.senderConfigHash !== salesSenderConfigHash(provider.key) || !transportReady(message.channel)) throw new AppError(503, 'OUTREACH_PROVIDER_NOT_CONFIGURED', 'Sender, reply route, webhook verification or reviewed transport configuration is unavailable');
        if (env.NODE_ENV !== 'test' && !message.estimatedCostMicroUsd) throw new AppError(409, 'OUTREACH_COST_POLICY_REQUIRED', 'Configure a reviewed per-message cost ceiling before delivery');
        const at = nextOutreachWindow(new Date(Math.max(Date.now(), campaign.startsAt.getTime())), message.timezone);
        const expires = new Date(Math.min(Date.now() + 7 * 86400000, campaign.endsAt.getTime(), message.contentExpiresAt?.getTime() ?? Infinity));
        if (at >= expires) throw new AppError(409, 'OUTREACH_WINDOW_UNAVAILABLE', 'No approved sending window remains; prepare or review the campaign schedule again');
        message.reviewedBy = auth.userId; message.reviewedAt = new Date(); message.approvalExpiresAt = expires; message.status = 'QUEUED'; await this.enqueue(message, at, session);
      } else { message.status = message.firstAttemptAt ? 'UNCERTAIN' : input.action === 'REJECT' ? 'REJECTED' : 'CANCELLED'; if (!message.firstAttemptAt) message.dedupeActive = false; }
      message.revision += 1; await message.save({ session });
      await AuditService.record({ actorUserId: auth.userId, action: 'sales.outreach.reviewed', resourceType: 'SalesMessage', resourceId: message._id, metadata: { action: input.action, payloadHash: input.payloadHash, reason: input.reason, status: message.status } }, session);
      return { status: message.status, nextAttemptAt: message.nextAttemptAt, approvalExpiresAt: message.approvalExpiresAt };
    });
  }
  private static async enqueue(message: Message, at: Date, session: ClientSession) {
    const first = !message.notificationId;
    if (first) {
      const [notice] = await Notification.create([{ type: 'SALES_OUTREACH', salesMessageId: message._id, channel: message.channel, title: message.subject ?? 'Dapinni sales update', body: message.body, status: 'QUEUED', priority: 'NORMAL', scheduledFor: at, dedupeKey: `sales-outreach:${message._id}`, createdBy: message.requestedBy }], { session });
      if (!notice) throw new AppError(500, 'OUTREACH_QUEUE_FAILED', 'Could not create the governed notification'); message.notificationId = notice._id;
    } else await Notification.updateOne({ _id: message.notificationId, salesMessageId: message._id }, { $set: { status: 'QUEUED', scheduledFor: at } }, { session });
    message.generation += 1; message.nextAttemptAt = at;
    await Job.updateOne({ dedupeKey: first ? `notification:${message.notificationId}` : `sales-outreach:${message._id}:${message.generation}` }, { $setOnInsert: { type: 'notification.send', payload: { notificationId: String(message.notificationId) }, availableAt: at, maxAttempts: 5, createdBy: message.requestedBy } }, { session, upsert: true });
  }
  static async unsubscribe(raw: unknown) {
    // A denial-only preference must remain available if unrelated dispatch prerequisites fail.
    const input = unsubscribeSchema.parse(raw);
    return salesTransaction(async session => {
      const message = await SalesMessage.findOne({ unsubscribeHash: opaqueHash(input.token) }).session(session);
      if (message) await SalesConsentService.suppress(message.leadId, { channel: message.channel, recipientHash: message.recipientHash }, 'PUBLIC_UNSUBSCRIBE', 'Recipient confirmed an opt-out using a received sales message.', session);
      // Unknown and known tokens deliberately have the same public response.
      return { suppressed: true, message: 'Sales updates have been stopped where this request matched an invitation.' };
    });
  }
  static async expireContent(messageId: string) {
    return salesTransaction(async session => {
      const message = await SalesMessage.findOne({ _id: messageId, contentExpiresAt: { $lte: new Date() }, redactedAt: { $exists: false } }).session(session);
      if (message) {
        await SalesMessage.updateOne({ _id: message._id }, { $set: { body: 'Message content expired under retention.', redactedAt: new Date(), ...(['DRAFT', 'PENDING_APPROVAL', 'QUEUED', 'PAUSED'].includes(message.status) ? { status: message.firstAttemptAt ? 'UNCERTAIN' : 'EXPIRED', ...(!message.firstAttemptAt ? { dedupeActive: false } : {}) } : {}) }, $unset: { recipient: 1, subject: 1 } }, { session });
        await Notification.updateOne({ _id: message.notificationId, type: 'SALES_OUTREACH' }, { $set: { body: 'Message content expired under retention.', title: 'Dapinni sales message', ...(['DRAFT', 'PENDING_APPROVAL', 'QUEUED', 'PAUSED'].includes(message.status) ? { status: 'CANCELLED' } : {}) } }, { session });
      }
      const entries = await SalesConversationEntry.updateMany({ messageId: new Types.ObjectId(messageId), contentExpiresAt: { $lte: new Date() }, redactedAt: { $exists: false } }, { $set: { text: 'Conversation content expired under retention.', redactedAt: new Date() }, $unset: { subject: 1 } }, { session });
      if (message || entries.modifiedCount) await AuditService.record({ action: 'sales.outreach.content.redacted', resourceType: 'SalesMessage', resourceId: new Types.ObjectId(messageId), metadata: { conversationEntries: entries.modifiedCount, decisionHashesRetained: true } }, session);
      return { redacted: !!message, entries: entries.modifiedCount };
    });
  }

  static async deliverNotification(notificationId: Types.ObjectId) {
    await assertOutreachIndexes();
    const notice = await Notification.findById(notificationId);
    if (!notice || notice.type !== 'SALES_OUTREACH' || !notice.salesMessageId) throw new AppError(409, 'OUTREACH_NOTIFICATION_INVALID', 'Only a governed sales message can use this delivery path');
    const initial = await SalesMessage.findOne({ _id: notice.salesMessageId, notificationId }).select('+recipient');
    if (!initial) throw new AppError(409, 'OUTREACH_NOTIFICATION_INVALID', 'Notification does not match its approved sales message');
    if (terminal.includes(initial.status) || initial.status === 'PAUSED') {
      if (initial.status !== 'SENT') await Notification.updateOne({ _id: notificationId }, { $set: { status: 'CANCELLED', failureReason: initial.errorCode ?? initial.status } });
      return { skipped: true };
    }
    if (initial.status === 'DISPATCHING' && initial.leaseUntil && initial.leaseUntil > new Date()) return { skipped: true };
    const provider = salesDeliveryProvider(initial.channel);
    const owner = randomUUID();
    let claimed: Message | null = null;
    try {
      await enabled(initial.channel); await assertSwitchEnabled(transportSwitch(initial.channel));
      if (!provider || provider.key !== initial.provider || !transportReady(initial.channel) || initial.senderConfigHash !== salesSenderConfigHash(provider.key)) throw new AppError(409, 'OUTREACH_CONFIG_CHANGED', 'Reviewed delivery configuration changed');
      await responsible(initial);
      if (!initial.reviewedBy) throw new AppError(409, 'OUTREACH_APPROVAL_REQUIRED', 'Human review is required');
      AuthorizationService.assertPlatformAdmin(await SalesAgentRepository.principal(initial.reviewedBy));
      claimed = await salesTransaction(async session => {
        const message = await SalesMessage.findOne({ _id: initial._id, status: { $in: ['QUEUED', 'DISPATCHING'] } }).select('+recipient').session(session);
        if (!message || (message.leaseUntil && message.leaseUntil > new Date())) return null;
        if (message.payloadHash !== payloadHash(outreachPayload(message)) || message.redactedAt) throw new AppError(409, 'OUTREACH_MESSAGE_CHANGED', 'Message no longer matches its human approval');
        if (!message.approvalExpiresAt || message.approvalExpiresAt <= new Date()) throw new AppError(409, 'OUTREACH_APPROVAL_EXPIRED', 'Human approval expired');
        const campaign = await campaignFor(message, session, true), consent = await consentMatches(message, session), now = new Date();
        const at = nextOutreachWindow(new Date(Math.max(now.getTime(), campaign.startsAt.getTime(), message.nextAttemptAt?.getTime() ?? 0)), message.timezone);
        if (message.firstAttemptAt && (!provider.idempotencyHours || now.getTime() - message.firstAttemptAt.getTime() >= provider.idempotencyHours * 3600000 || message.attempt >= 3)) throw new AppError(409, 'OUTREACH_OUTCOME_UNKNOWN', 'Automatic resend stopped at the provider idempotency boundary');
        if (at > now) {
          if (at >= message.approvalExpiresAt || (message.firstAttemptAt && at.getTime() >= message.firstAttemptAt.getTime() + provider.idempotencyHours * 3600000)) throw new AppError(409, 'OUTREACH_OUTCOME_UNKNOWN', 'No safe approved retry window remains');
          message.status = 'QUEUED'; message.leaseOwner = undefined; message.leaseUntil = undefined; await this.enqueue(message, at, session); await message.save({ session }); return null;
        }
        await SalesProviderControl.updateOne({ key: provider.key }, { $setOnInsert: { key: provider.key } }, { session, upsert: true });
        const paced = await SalesProviderControl.findOneAndUpdate({ key: provider.key, $or: [{ nextRequestAt: { $exists: false } }, { nextRequestAt: { $lte: now } }] }, { $set: { nextRequestAt: new Date(now.getTime() + provider.minimumIntervalMs) } }, { session });
        if (!paced) throw new AppError(429, 'OUTREACH_PROVIDER_RATE_LIMITED', 'Application provider pace reached');
        const day = now.toISOString().slice(0, 10);
        if (consent.control.day !== day) await SalesRecipientControl.updateOne({ _id: consent.control._id, day: { $ne: day } }, { $set: { day, dailyAttempts: 0, dayMessages: [] } }, { session });
        const control = await SalesRecipientControl.findById(consent.control._id).session(session);
        if (!control || control.suppressedAt || control.epoch !== consent.event.recipientEpoch) throw new AppError(409, 'CONTACT_SUPPRESSED', 'Recipient consent changed');
        const counted = control.dayMessages.some(value => String(value) === String(message._id));
        if (!counted && control.dailyAttempts >= Math.min(message.recipientDailyLimit, env.SALES_RECIPIENT_DAILY_LIMIT)) throw new AppError(429, 'OUTREACH_RECIPIENT_DAY_LIMIT', 'Recipient daily message ceiling reached');
        if (control.leaseUntil && control.leaseUntil > now && control.leaseOwner !== String(message._id)) throw new AppError(429, 'OUTREACH_RECIPIENT_BUSY', 'Another delivery owns the recipient lease');
        control.leaseOwner = String(message._id); control.leaseUntil = new Date(now.getTime() + 120000); control.lastAttemptAt = now;
        if (!counted) { control.dayMessages.push(message._id); control.dailyAttempts += 1; } await control.save({ session });
        if (!message.reservationHeld) {
          await this.reserve(campaign._id, 'TOTAL', undefined, campaign.budgetMicroUsd, message.estimatedCostMicroUsd, session);
          await this.reserve(campaign._id, 'CONTACT:' + message.recipientHash, campaign.perContactLimit, undefined, message.estimatedCostMicroUsd, session);
          message.reservationHeld = true;
        }
        if (message.reservationDay !== day) { await this.reserve(campaign._id, 'DAY:' + day, campaign.dailySendLimit, undefined, message.estimatedCostMicroUsd, session); message.reservationDay = day; }
        message.status = 'DISPATCHING'; message.leaseOwner = owner; message.leaseUntil = new Date(now.getTime() + 120000); message.firstAttemptAt ??= now; message.lastAttemptAt = now; message.attempt += 1;
        await message.save({ session });
        await Job.updateOne({ dedupeKey: `sales-outreach-recovery:${message._id}:${message.attempt}` }, { $setOnInsert: { type: 'notification.send', payload: { notificationId: String(notificationId) }, availableAt: message.leaseUntil, maxAttempts: 5 } }, { session, upsert: true });
        return message;
      });
      if (!claimed) return { deferred: true };
      // Final policy checks occur immediately before transport; in-flight provider requests cannot be recalled.
      await enabled(claimed.channel); await consentMatches(claimed);
      const result = await provider.send({ to: claimed.recipient, from: claimed.sender, subject: claimed.subject ?? 'Dapinni sales update', body: claimed.body, idempotencyKey: 'sales-message/' + claimed._id, salesMessageId: String(claimed._id), ...(claimed.replyTo ? { replyTo: claimed.replyTo } : {}), listUnsubscribeUrl: claimed.unsubscribeUrl });
      if (!result.providerMessageId) throw new AppError(503, 'OUTREACH_PROVIDER_EVIDENCE_MISSING', 'Provider acceptance identifier is missing');
      await salesTransaction(async session => {
        const message = await SalesMessage.findOne({ _id: claimed?._id, leaseOwner: owner }).session(session);
        if (!message) return;
        if (message.providerMessageId && message.providerMessageId !== result.providerMessageId) throw new AppError(409, 'OUTREACH_PROVIDER_CONFLICT', 'Provider evidence conflicts with the recorded message');
        message.status = 'SENT'; message.providerMessageId = result.providerMessageId; message.providerAcceptedAt ??= new Date();
        if (message.deliveryStatus === 'UNKNOWN') message.deliveryStatus = result.status === 'DELIVERED' ? 'DELIVERED' : 'ACCEPTED';
        message.leaseOwner = undefined; message.leaseUntil = undefined;
        if (!['FAILED', 'BOUNCED'].includes(message.deliveryStatus)) message.errorCode = undefined;
        await message.save({ session });
        await Notification.updateOne({ _id: notificationId }, { $set: { status: message.deliveryStatus === 'DELIVERED' ? 'DELIVERED' : ['FAILED', 'BOUNCED'].includes(message.deliveryStatus) ? 'FAILED' : 'SENT', sentAt: message.providerAcceptedAt }, ...(!['FAILED', 'BOUNCED'].includes(message.deliveryStatus) ? { $unset: { failureReason: 1 } } : {}) }, { session });
        await SalesRecipientControl.updateOne({ channel: message.channel, recipientHash: message.recipientHash, leaseOwner: String(message._id) }, { $unset: { leaseOwner: 1, leaseUntil: 1 } }, { session });
        await SalesConversationEntry.updateOne({ sourceKey: `outbound:${message._id}` }, { $setOnInsert: { leadId: message.leadId, messageId: message._id, direction: 'OUTBOUND', provider: message.provider, subject: message.subject, text: message.body, occurredAt: message.providerAcceptedAt, contentExpiresAt: message.contentExpiresAt } }, { session, upsert: true });
        await SalesActivity.updateOne({ leadId: message.leadId, sourceKey: `outreach-accepted:${message._id}` }, { $setOnInsert: { actorKind: 'SYSTEM', kind: 'sales.outreach.accepted', text: 'Approved sales outreach accepted by the provider; delivery and reading are not confirmed.', resourceId: message._id, sourceOccurredAt: message.providerAcceptedAt } }, { session, upsert: true });
        await AuditService.record({ action: 'sales.outreach.provider.accepted', resourceType: 'SalesMessage', resourceId: message._id, metadata: { provider: message.provider, providerMessageId: result.providerMessageId, payloadHash: message.payloadHash } }, session);
      });
      return { accepted: true };
    } catch (error) {
      const code = error instanceof AppError ? error.code : error instanceof Error && /^(RESEND|SENDGRID|TWILIO)_\d{3}$/.test(error.message) ? error.message : 'OUTREACH_PROVIDER_UNCONFIRMED';
      let confirmedElsewhere = false;
      await salesTransaction(async session => {
        const message = await SalesMessage.findOne({ _id: initial._id, ...(claimed ? { leaseOwner: owner } : { status: { $in: ['QUEUED', 'DISPATCHING'] } }) }).session(session);
        if (!message || (message.status === 'DISPATCHING' && !claimed && message.leaseUntil && message.leaseUntil > new Date())) return;
        if (message.providerAcceptedAt || message.deliveryStatus === 'DELIVERED' || message.deliveryStatus === 'BOUNCED') {
          confirmedElsewhere = true;
          await SalesMessage.updateOne({ _id: message._id }, { $set: { status: 'SENT' }, $unset: { leaseOwner: 1, leaseUntil: 1 } }, { session });
          await Notification.updateOne({ _id: notificationId }, { $set: { status: message.deliveryStatus === 'DELIVERED' ? 'DELIVERED' : ['FAILED', 'BOUNCED'].includes(message.deliveryStatus) ? 'FAILED' : 'SENT', sentAt: message.providerAcceptedAt ?? new Date() } }, { session });
          await SalesRecipientControl.updateOne({ channel: message.channel, recipientHash: message.recipientHash, leaseOwner: String(message._id) }, { $unset: { leaseOwner: 1, leaseUntil: 1 } }, { session });
          return;
        }
        const limited = ['OUTREACH_PROVIDER_RATE_LIMITED', 'OUTREACH_RECIPIENT_BUSY', 'OUTREACH_RECIPIENT_DAY_LIMIT', 'OUTREACH_DAY_LIMIT'].includes(code);
        const definitive = !!claimed && claimed.attempt === 1 && /^(RESEND|TWILIO)_4\d\d$/.test(code) && !/_(408|409|429)$/.test(code);
        const providerFailure = claimed && !definitive && !['SERVICE_DISABLED', 'CONTACT_SUPPRESSED', 'OUTREACH_CONSENT_CHANGED', 'OUTREACH_REPLY_RECEIVED', 'OUTREACH_PROVIDER_CONFLICT'].includes(code);
        let retryAt: Date | undefined;
        if (limited) retryAt = ['OUTREACH_RECIPIENT_DAY_LIMIT', 'OUTREACH_DAY_LIMIT'].includes(code) ? new Date((Math.floor(Date.now() / 86400000) + 1) * 86400000) : new Date(Date.now() + 5000);
        else if (providerFailure && provider?.idempotencyHours && message.attempt < 3 && message.firstAttemptAt && Date.now() - message.firstAttemptAt.getTime() < provider.idempotencyHours * 3600000) retryAt = new Date(Date.now() + 60000 * message.attempt);
        if (retryAt && message.approvalExpiresAt && retryAt < message.approvalExpiresAt) { message.status = 'QUEUED'; await this.enqueue(message, retryAt, session); }
        else if (['SERVICE_DISABLED', 'AGENT_PAUSED', 'CAMPAIGN_NOT_ACTIVE', 'OUTREACH_CONFIG_CHANGED', 'OUTREACH_CAMPAIGN_LIMIT', 'SALES_SMS_NOT_CONFIGURED', 'SALES_SMS_CALLBACK_NOT_CONFIGURED'].includes(code) || (!claimed && code === 'OUTREACH_PROVIDER_UNCONFIRMED')) message.status = message.firstAttemptAt ? 'UNCERTAIN' : 'PAUSED';
        else if (definitive) { message.status = 'FAILED'; message.dedupeActive = false; }
        else if (message.firstAttemptAt || claimed || code === 'OUTREACH_OUTCOME_UNKNOWN') message.status = 'UNCERTAIN';
        else message.status = code === 'OUTREACH_APPROVAL_EXPIRED' ? 'EXPIRED' : 'SUPPRESSED';
        if (!message.firstAttemptAt && ['FAILED', 'CANCELLED', 'REJECTED', 'SUPPRESSED', 'EXPIRED'].includes(message.status)) message.dedupeActive = false;
        message.errorCode = code; message.leaseOwner = undefined; message.leaseUntil = undefined; await message.save({ session });
        if (message.status !== 'QUEUED') await Notification.updateOne({ _id: notificationId }, { $set: { status: message.status === 'FAILED' || message.status === 'UNCERTAIN' ? 'FAILED' : 'CANCELLED', failureReason: code } }, { session });
        await SalesRecipientControl.updateOne({ channel: message.channel, recipientHash: message.recipientHash, leaseOwner: String(message._id) }, { $unset: { leaseOwner: 1, leaseUntil: 1 } }, { session });
        await AuditService.record({ action: 'sales.outreach.delivery.deferred_or_blocked', resourceType: 'SalesMessage', resourceId: message._id, metadata: { code, status: message.status, providerOutcomeConfirmed: false } }, session);
      });
      return { accepted: confirmedElsewhere, code };
    }
  }
  private static async reserve(campaignId: Types.ObjectId, bucket: string, limit: number | undefined, budget: number | undefined, cost: number, session: ClientSession) {
    await SalesCampaignUsage.updateOne({ campaignId, bucket }, { $setOnInsert: { campaignId, bucket } }, { upsert: true, session });
    const usage = await SalesCampaignUsage.findOneAndUpdate({ campaignId, bucket, ...(limit !== undefined ? { attempts: { $lt: limit } } : {}), ...(budget !== undefined ? { $expr: { $lte: [{ $add: ['$reservedMicroUsd', cost] }, budget] } } : {}) }, { $inc: { attempts: 1, reservedMicroUsd: cost } }, { session });
    if (!usage) throw new AppError(429, bucket.startsWith('DAY:') ? 'OUTREACH_DAY_LIMIT' : 'OUTREACH_CAMPAIGN_LIMIT', 'Campaign delivery ceiling reached');
  }
}
