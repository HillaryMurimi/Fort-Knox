import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { User } from '../../src/database/models/User.js';
import { SalesLead } from '../../src/database/models/SalesLead.js';
import { SalesCampaign } from '../../src/database/models/SalesCampaign.js';
import { SalesMessage, SalesConsentEvent, SalesRecipientControl, SalesCampaignUsage, SalesConversationEntry, SalesProviderControl } from '../../src/database/models/SalesCommunication.js';
import { PlatformSwitch } from '../../src/database/models/PlatformSwitch.js';
import { Notification } from '../../src/database/models/Notification.js';
import { Job } from '../../src/database/models/Job.js';
import { WebhookEvent } from '../../src/database/models/WebhookEvent.js';
import { SalesOutreachService as outreach } from '../../src/modules/sales/sales-outreach.service.js';
import { SalesConsentService as consent } from '../../src/modules/sales/sales-consent.service.js';
import { SalesSmsWebhookService as webhooks } from '../../src/modules/sales/sales-sms-webhook.service.js';
import { campaignPayload } from '../../src/modules/sales/sales-campaign.service.js';
import { payloadHash } from '../../src/modules/sales/sales-agent.service.js';
import { setSalesDeliveryTestProvider } from '../../src/integrations/notifications/sales-delivery.provider.js';
import { setSalesSmsInboundTestProvider } from '../../src/integrations/notifications/sales-sms-inbound.provider.js';
import { salesTwilioCallbackUrl } from '../../src/integrations/notifications/sales-sms.policy.js';
import { recipientHash } from '../../src/modules/sales/sales-outreach.policy.js';
import { IntegrationDispatcher } from '../../src/core/integrations/dispatcher.js';
import { integrationConfig } from '../../src/core/integrations/config.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';
import type { MessageInput } from '../../src/core/integrations/provider.types.js';

describe.skipIf(!process.env.RUN_E2E)('Governed dedicated-sender sales SMS', () => {
  let mongo: MongoMemoryReplSet, admin: AuthenticatedUser, leadId: Types.ObjectId, campaignId: Types.ObjectId, sid: string;
  const phone = '+254700002003', salesNumber = '+254700002001', operationsNumber = '+254700002002';
  const previous = { PUBLIC_API_URL: env.PUBLIC_API_URL, SALES_SMS_FROM: env.SALES_SMS_FROM, SMS_FROM: env.SMS_FROM, TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN, SMS_ENABLED: env.SMS_ENABLED, SALES_SMS_COST_PER_SEGMENT_MICRO_USD: env.SALES_SMS_COST_PER_SEGMENT_MICRO_USD };
  const core = { ...integrationConfig.twilio, sender: integrationConfig.sms.from };
  const send = vi.fn(async (_input: MessageInput) => ({ provider: 'TWILIO', providerMessageId: sid, status: 'SENT' as const }));
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : {} });
    await mongoose.connect(mongo.getUri());
    for (const model of [User, SalesLead, SalesCampaign, SalesMessage, SalesConsentEvent, SalesRecipientControl, SalesCampaignUsage, SalesConversationEntry, SalesProviderControl, PlatformSwitch, Notification, Job, WebhookEvent]) await model.init();
  }, 180000);
  afterAll(async () => { vi.useRealTimers(); Object.assign(env, previous); setSalesDeliveryTestProvider(undefined, 'SMS'); setSalesSmsInboundTestProvider(); await mongoose.disconnect(); await mongo?.stop(); });
  afterEach(() => { vi.unstubAllGlobals(); integrationConfig.twilio.accountSid = core.accountSid; integrationConfig.twilio.authToken = core.authToken; integrationConfig.sms.from = core.sender; });
  beforeEach(async () => {
    vi.useRealTimers(); vi.setSystemTime(new Date('2026-11-02T07:00:00Z'));
    for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
    Object.assign(env, { PUBLIC_API_URL: 'https://api.example.test', SALES_SMS_FROM: salesNumber, SMS_FROM: operationsNumber, TWILIO_ACCOUNT_SID: 'AC' + 'a'.repeat(32), TWILIO_AUTH_TOKEN: 'controlled-sms-signature-token', SMS_ENABLED: true, SALES_SMS_COST_PER_SEGMENT_MICRO_USD: 10 });
    sid = 'SM' + randomBytes(16).toString('hex'); send.mockReset(); send.mockImplementation(async () => ({ provider: 'TWILIO', providerMessageId: sid, status: 'SENT' as const }));
    setSalesDeliveryTestProvider({ key: 'TWILIO', idempotencyHours: 0, minimumIntervalMs: 0, send }, 'SMS'); setSalesSmsInboundTestProvider();
    const user = await User.create({ phone: '+254700002099', email: 'sms-admin@example.test', firstName: 'Sales', lastName: 'Admin', isPlatformAdmin: true });
    admin = { userId: user._id, isPlatformAdmin: true, sessionId: new Types.ObjectId(), mfaVerifiedAt: new Date(), adminDualChannel: true, memberships: [] };
    leadId = (await SalesLead.create({ reference: 'SMS-OWNER', name: 'SMS Owner', phone, email: 'sms-owner@example.test', properties: 1, units: '40', challenge: 'Requested a briefing', source: 'Manual', consent: 'OPTED_IN' }))._id;
    const campaign = await SalesCampaign.create({ name: 'Requested SMS briefing', description: 'Explicitly requested small campaign', audience: 'Owners', market: 'Kenya', channel: 'SMS', ownerId: user._id, startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 10 * 86400000), messaging: 'Requested product information', selectionCriteria: 'Recorded request', dailySendLimit: 10, perContactLimit: 2, budgetMicroUsd: 10000, attributionDays: 30, status: 'ACTIVE', createdBy: user._id });
    campaign.approvedHash = payloadHash(campaignPayload(campaign)); await campaign.save(); campaignId = campaign._id;
    for (const key of ['SALES_OUTBOUND', 'SALES_SMS', 'SMS_NOTIFICATIONS']) await PlatformSwitch.create({ key, kind: 'FEATURE', name: key, description: 'Controlled SMS test', enabled: true, mode: 'ON' });
  });
  async function optIn() { const lead = (await SalesLead.findById(leadId))!; await consent.record(admin, String(leadId), { channel: 'SMS', decision: 'OPT_IN', evidence: 'Owner explicitly requested a short product briefing by SMS.', revision: lead.revision }); }
  const draft = (body = 'Your requested product briefing is ready.') => outreach.prepare(admin, String(leadId), { campaignId: String(campaignId), commandId: randomUUID(), body });
  async function decide(id: string, action: string) { const m = (await SalesMessage.findById(id))!; return outreach.decide(admin, String(leadId), id, { action, revision: m.revision, payloadHash: m.payloadHash, reason: 'Review this exact requested SMS briefing.' }); }
  async function queue() { await optIn(); const m = await draft(); await decide(m.id, 'SUBMIT'); await decide(m.id, 'APPROVE'); return (await SalesMessage.findById(m.id))!; }
  const sign = (params: Record<string, string>, messageId?: string) => createHmac('sha1', env.TWILIO_AUTH_TOKEN!).update(salesTwilioCallbackUrl(messageId) + Object.keys(params).sort().map(key => key + params[key]).join('')).digest('base64');
  async function status(id: string, state: string, errorCode?: string) {
    const params = { AccountSid: env.TWILIO_ACCOUNT_SID!, MessageSid: sid, MessageStatus: state, From: salesNumber, To: phone, ...(errorCode ? { ErrorCode: errorCode } : {}) };
    await webhooks.receive(params, sign(params, id), id); const event = (await WebhookEvent.findOne({ eventId: sid + ':' + state }))!; await webhooks.consume(String(event._id)); return event;
  }
  it('requires recorded SMS consent rather than a legacy checkbox and never truncates overlong drafts', async () => {
    await expect(draft()).rejects.toMatchObject({ code: 'OUTREACH_CONSENT_REQUIRED' }); await optIn();
    await expect(draft('x'.repeat(306))).rejects.toMatchObject({ code: 'SALES_SMS_TOO_LONG' }); expect(send).not.toHaveBeenCalled();
  });
  it('reserves integer cost for the complete multipart payload', async () => {
    await optIn(); const prepared = await draft('a'.repeat(150)), message = (await SalesMessage.findById(prepared.id))!;
    expect(message.smsSegments).toBe(2); expect(message.smsEncoding).toBe('GSM7'); expect(message.estimatedCostMicroUsd).toBe(20);
  });
  it('queues exact branded content and sends once without enabling the email channel', async () => {
    const m = await queue(); expect(m.channel).toBe('SMS'); expect(m.smsSegments).toBe(1); expect(m.estimatedCostMicroUsd).toBe(10);
    expect(m.body).toContain('Reply STOP to opt out.'); expect(m.subject).toBeUndefined();
    await Promise.all([outreach.deliverNotification(m.notificationId!), outreach.deliverNotification(m.notificationId!)]);
    expect(send).toHaveBeenCalledTimes(1); expect(send.mock.calls[0]?.[0]).toMatchObject({ from: salesNumber, to: phone, body: m.body });
    expect(await SalesMessage.findById(m._id).lean()).toMatchObject({ status: 'SENT', deliveryStatus: 'ACCEPTED' });
  });
  it('never automatically retries an ambiguous non-idempotent provider attempt', async () => {
    const m = await queue(); send.mockRejectedValueOnce(new Error('Unconfirmed network result'));
    await outreach.deliverNotification(m.notificationId!); expect((await SalesMessage.findById(m._id))?.status).toBe('UNCERTAIN');
    await expect(decide(String(m._id), 'RESUME')).rejects.toMatchObject({ code: 'OUTREACH_STATE_CHANGED' });
    vi.setSystemTime(new Date('2026-11-03T07:00:00Z')); await outreach.deliverNotification(m.notificationId!);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('resolves an uncertain result only from later signed provider evidence without another send', async () => {
    const m = await queue(); send.mockRejectedValueOnce(new Error('Lost provider response'));
    await outreach.deliverNotification(m.notificationId!); expect((await SalesMessage.findById(m._id))?.status).toBe('UNCERTAIN');
    await status(String(m._id), 'delivered');
    const resolved = (await SalesMessage.findById(m._id))!; expect(resolved.status).toBe('SENT'); expect(resolved.deliveryStatus).toBe('DELIVERED'); expect(resolved.errorCode).toBeUndefined();
    expect((await Notification.findById(m.notificationId))?.failureReason).toBeUndefined(); expect(send).toHaveBeenCalledTimes(1);
  });
  it('records signed delivery while outbound is off, deduplicates and keeps delivered facts against late sent callbacks', async () => {
    const m = await queue(); await outreach.deliverNotification(m.notificationId!); await PlatformSwitch.updateMany({}, { $set: { enabled: false, mode: 'OFF' } });
    await status(String(m._id), 'delivered'); await status(String(m._id), 'sent'); await status(String(m._id), 'delivered');
    expect((await SalesMessage.findById(m._id))?.deliveryStatus).toBe('DELIVERED'); expect(await WebhookEvent.countDocuments()).toBe(2); expect(await SalesConversationEntry.countDocuments()).toBe(1);
  });
  it('suppresses queued sales immediately on verified STOP and retains no raw inbound body in webhook storage', async () => {
    const m = await queue(); await outreach.deliverNotification(m.notificationId!);
    const next = await draft('Additional requested product details are ready.'); await decide(next.id, 'SUBMIT'); await decide(next.id, 'APPROVE');
    const inboundId = 'SM' + randomBytes(16).toString('hex'), params = { AccountSid: env.TWILIO_ACCOUNT_SID!, MessageSid: inboundId, SmsStatus: 'received', From: phone, To: salesNumber, Body: 'STOP', OptOutType: 'STOP' };
    await webhooks.receive(params, sign(params));
    expect((await SalesLead.findById(leadId))?.consent).toBe('OPTED_OUT'); expect((await SalesMessage.findById(next.id))?.status).toBe('SUPPRESSED');
    const event = (await WebhookEvent.findOne({ eventId: inboundId + ':received' }))!; expect(JSON.stringify(event.payload)).not.toContain('"Body"'); expect(JSON.stringify(event.payload)).not.toContain('"text"');
    await expect(webhooks.consume(String(event._id))).rejects.toMatchObject({ code: 'SALES_SMS_INBOUND_NOT_CONFIGURED' });
    setSalesSmsInboundTestProvider({ retrieve: async () => ({ id: inboundId, from: phone, to: salesNumber, text: 'STOP', occurredAt: new Date(), truncated: false }) });
    await webhooks.consume(String(event._id)); expect(await SalesConversationEntry.findOne({ direction: 'INBOUND' }).lean()).toMatchObject({ text: 'STOP', correlation: 'RECIPIENT_MATCHED', senderAuthentication: 'UNKNOWN' });
    const queued = (await SalesMessage.findById(next.id))!; await outreach.deliverNotification(queued.notificationId!); expect(send).toHaveBeenCalledTimes(1); expect(await Job.countDocuments({ type: 'sales.agent.execute' })).toBe(0);
  });
  it('stores only a denial hash for an unknown sender and ignores replies to the operations sender', async () => {
    const unknown = '+254700002050', params = { AccountSid: env.TWILIO_ACCOUNT_SID!, MessageSid: sid, SmsStatus: 'received', From: unknown, To: salesNumber, Body: 'STOP' };
    await webhooks.receive(params, sign(params)); expect(await SalesRecipientControl.findOne({ recipientHash: recipientHash('SMS', unknown) }).lean()).toMatchObject({ suppressionReason: 'OPT_OUT' });
    expect(await SalesConversationEntry.countDocuments()).toBe(0); expect(await SalesLead.countDocuments()).toBe(1);
    const other = { ...params, MessageSid: 'SM' + randomBytes(16).toString('hex'), From: '+254700002051', To: operationsNumber };
    await webhooks.receive(other, sign(other)); expect(await SalesRecipientControl.countDocuments()).toBe(1);
  });
  it('stops an older queued draft when a signed response arrives before any outbound history exists', async () => {
    const m = await queue(), params = { AccountSid: env.TWILIO_ACCOUNT_SID!, MessageSid: sid, SmsStatus: 'received', From: phone, To: salesNumber, Body: 'Please call instead.' };
    await webhooks.receive(params, sign(params)); await outreach.deliverNotification(m.notificationId!);
    expect(send).not.toHaveBeenCalled(); expect(await SalesMessage.findById(m._id).lean()).toMatchObject({ status: 'SUPPRESSED', errorCode: 'OUTREACH_REPLY_RECEIVED' });
    expect((await SalesLead.findById(leadId))?.consent).toBe('OPTED_IN'); expect(await SalesConversationEntry.countDocuments()).toBe(0);
  });
  it('keeps callback failure evidence when it arrives before an ambiguous HTTP result', async () => {
    const m = await queue();
    send.mockImplementationOnce(async () => { await status(String(m._id), 'undelivered', '30005'); throw new Error('Lost send response'); });
    await outreach.deliverNotification(m.notificationId!);
    expect(await SalesMessage.findById(m._id).lean()).toMatchObject({ status: 'SENT', deliveryStatus: 'FAILED', errorCode: 'TWILIO_UNDELIVERED_30005' });
    expect((await Notification.findById(m.notificationId))?.status).toBe('FAILED'); expect((await SalesRecipientControl.findOne({ channel: 'SMS' }))?.suppressionReason).toBe('BOUNCE');
    await outreach.deliverNotification(m.notificationId!); expect(send).toHaveBeenCalledTimes(1);
  });
  it('blocks sending if the sales number becomes the operations number after review', async () => {
    const m = await queue(); env.SMS_FROM = salesNumber; await outreach.deliverNotification(m.notificationId!);
    expect(send).not.toHaveBeenCalled(); expect((await SalesMessage.findById(m._id))?.status).toBe('PAUSED');
  });
  it('validates form HTTP signatures against the published URL and refuses altered contacts or JSON bodies', async () => {
    const m = await queue(); await outreach.deliverNotification(m.notificationId!); const app = createApp();
    const params = { AccountSid: env.TWILIO_ACCOUNT_SID!, MessageSid: sid, MessageStatus: 'delivered', From: salesNumber, To: phone }, signature = sign(params, String(m._id)), path = '/api/v1/sales/outreach/webhooks/twilio?messageId=' + m._id;
    const accepted = await request(app).post(path).set('X-Twilio-Signature', signature).set('X-Forwarded-Host', 'untrusted.example.test').type('form').send(params); expect(accepted.status).toBe(200); expect(accepted.text).toContain('<Response/>');
    expect((await request(app).post(path).set('X-Twilio-Signature', signature).type('form').send({ ...params, To: '+254700002051' })).status).toBe(401);
    expect((await request(app).post(path).set('X-Twilio-Signature', signature).send(params)).status).toBe(415);
  });
  it('does not attribute a valid signed callback to an unattempted draft or a different recipient', async () => {
    await optIn(); const prepared = await draft('This controlled draft has not been dispatched.');
    const params = { AccountSid: env.TWILIO_ACCOUNT_SID!, MessageSid: sid, MessageStatus: 'delivered', From: salesNumber, To: phone };
    await webhooks.receive(params, sign(params, prepared.id), prepared.id);
    expect((await SalesMessage.findById(prepared.id))?.status).toBe('DRAFT'); expect((await WebhookEvent.findOne())?.status).toBe('IGNORED');
    sid = 'SM' + randomBytes(16).toString('hex'); const m = await queue(); await outreach.deliverNotification(m.notificationId!);
    const unrelated = { ...params, MessageSid: sid, To: '+254700002051' };
    await webhooks.receive(unrelated, sign(unrelated, String(m._id)), String(m._id));
    expect((await SalesMessage.findById(m._id))?.deliveryStatus).toBe('ACCEPTED'); expect(await WebhookEvent.countDocuments({ status: 'IGNORED' })).toBe(2);
  });
  it('preserves normal operational SMS after sales opt-out', async () => {
    const m = await queue(); await outreach.unsubscribe({ token: m.unsubscribeUrl.split('/').at(-1), confirm: true });
    const user = await User.create({ phone, firstName: 'Operational', lastName: 'Recipient' });
    const notice = await Notification.create({ recipientUserId: user._id, channel: 'SMS', type: 'SECURITY_SIGNIN', title: 'Security alert', body: 'Your account security notification.' });
    integrationConfig.twilio.accountSid = env.TWILIO_ACCOUNT_SID; integrationConfig.twilio.authToken = env.TWILIO_AUTH_TOKEN; integrationConfig.sms.from = operationsNumber;
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sid }))); vi.stubGlobal('fetch', fetch);
    await IntegrationDispatcher.sendNotification(notice); expect(notice.status).toBe('SENT');
    const body = fetch.mock.calls[0]?.[1]?.body as URLSearchParams; expect(body.get('From')).toBe(operationsNumber); expect(body.get('To')).toBe(phone);
    expect((await SalesLead.findById(leadId))?.consent).toBe('OPTED_OUT');
  });
});
