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
import { SalesWhatsAppWebhookService as webhooks } from '../../src/modules/sales/sales-whatsapp-webhook.service.js';
import { supportedSalesTemplate, setSalesWhatsAppTestProvider } from '../../src/integrations/notifications/sales-whatsapp.provider.js';
import { campaignPayload } from '../../src/modules/sales/sales-campaign.service.js';
import { payloadHash } from '../../src/modules/sales/sales-agent.service.js';
import { setSalesDeliveryTestProvider } from '../../src/integrations/notifications/sales-delivery.provider.js';
import { recipientHash } from '../../src/modules/sales/sales-outreach.policy.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';
import type { MessageInput } from '../../src/core/integrations/provider.types.js';


const template = supportedSalesTemplate({ id: '123456789', name: 'dapinni_intro', language: 'en_US', category: 'MARKETING', status: 'APPROVED', components: [{ type: 'BODY', text: 'Dapinni: Hello {{1}}. Reply STOP to unsubscribe.' }] })!;
const source = vi.fn(async () => template);
const metadata = { sender: async () => ({ businessAccountId: '987654321', phoneNumberId: '123456789', phone: '+254700002001', name: 'Dapinni', verified: true as const }), templates: async () => ({ items: [template], truncated: false }), template: source };
describe.skipIf(!process.env.RUN_E2E)('Governed approved-template WhatsApp', () => {
  let mongo: MongoMemoryReplSet, admin: AuthenticatedUser, leadId: Types.ObjectId, campaignId: Types.ObjectId, sid: string;
  const phone = '+254700002003';
  const previous = { WHATSAPP_PHONE_NUMBER_ID: env.WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN: env.WHATSAPP_ACCESS_TOKEN, SALES_WHATSAPP_BUSINESS_ACCOUNT_ID: env.SALES_WHATSAPP_BUSINESS_ACCOUNT_ID, SALES_WHATSAPP_APP_SECRET: env.SALES_WHATSAPP_APP_SECRET, SALES_WHATSAPP_VERIFY_TOKEN: env.SALES_WHATSAPP_VERIFY_TOKEN, SALES_WHATSAPP_ESTIMATED_MICRO_USD: env.SALES_WHATSAPP_ESTIMATED_MICRO_USD };
  const send = vi.fn(async (_input: MessageInput) => ({ provider: 'WHATSAPP_CLOUD', providerMessageId: sid, status: 'SENT' as const }));
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : {} });
    await mongoose.connect(mongo.getUri());
    for (const model of [User, SalesLead, SalesCampaign, SalesMessage, SalesConsentEvent, SalesRecipientControl, SalesCampaignUsage, SalesConversationEntry, SalesProviderControl, PlatformSwitch, Notification, Job, WebhookEvent]) await model.init();
  }, 180000);
  afterAll(async () => { vi.useRealTimers(); Object.assign(env, previous); setSalesDeliveryTestProvider(undefined, 'WHATSAPP'); setSalesWhatsAppTestProvider(); await mongoose.disconnect(); await mongo?.stop(); });
  beforeEach(async () => {
    Object.assign(env, { WHATSAPP_PHONE_NUMBER_ID: '123456789', SALES_WHATSAPP_BUSINESS_ACCOUNT_ID: '987654321', WHATSAPP_ACCESS_TOKEN: 'controlled-token', SALES_WHATSAPP_APP_SECRET: 'controlled-callback-secret', SALES_WHATSAPP_VERIFY_TOKEN: 'controlled-verification-token-long-enough' });
    setSalesWhatsAppTestProvider(metadata);
    source.mockReset(); source.mockResolvedValue(template);
    vi.useRealTimers(); vi.setSystemTime(new Date('2026-11-02T07:00:00Z'));
    for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
    env.SALES_WHATSAPP_ESTIMATED_MICRO_USD = 10;
    sid = 'SM' + randomBytes(16).toString('hex'); send.mockReset(); send.mockImplementation(async () => ({ provider: 'WHATSAPP_CLOUD', providerMessageId: sid, status: 'SENT' as const }));
    setSalesDeliveryTestProvider({ key: 'WHATSAPP_CLOUD', idempotencyHours: 0, minimumIntervalMs: 0, send }, 'WHATSAPP');
    const user = await User.create({ phone: '+254700002099', email: 'sms-admin@example.test', firstName: 'Sales', lastName: 'Admin', isPlatformAdmin: true });
    admin = { userId: user._id, isPlatformAdmin: true, sessionId: new Types.ObjectId(), mfaVerifiedAt: new Date(), adminDualChannel: true, memberships: [] };
    leadId = (await SalesLead.create({ reference: 'SMS-OWNER', name: 'SMS Owner', phone, email: 'sms-owner@example.test', properties: 1, units: '40', challenge: 'Requested a briefing', source: 'Manual', consent: 'OPTED_IN' }))._id;
    const campaign = await SalesCampaign.create({ name: 'Requested SMS briefing', description: 'Explicitly requested small campaign', audience: 'Owners', market: 'Kenya', channel: 'WHATSAPP', ownerId: user._id, startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 10 * 86400000), messaging: 'Requested product information', selectionCriteria: 'Recorded request', dailySendLimit: 10, perContactLimit: 2, budgetMicroUsd: 10000, attributionDays: 30, status: 'ACTIVE', createdBy: user._id });
    campaign.approvedHash = payloadHash(campaignPayload(campaign)); await campaign.save(); campaignId = campaign._id;
    for (const key of ['SALES_OUTBOUND', 'SALES_WHATSAPP', 'WHATSAPP_NOTIFICATIONS']) await PlatformSwitch.create({ key, kind: 'FEATURE', name: key, description: 'Controlled SMS test', enabled: true, mode: 'ON' });
  });
  async function optIn() { const lead = (await SalesLead.findById(leadId))!; await consent.record(admin, String(leadId), { channel: 'WHATSAPP', decision: 'OPT_IN', evidence: 'Owner explicitly requested a short product briefing by SMS.', revision: lead.revision }); }
  const draft = () => outreach.prepare(admin, String(leadId), { campaignId: String(campaignId), commandId: randomUUID(), whatsappTemplate: { id: template.id, name: template.name, language: template.language, bindings: ['CUSTOMER_NAME'] } });
  async function decide(id: string, action: string) { const m = (await SalesMessage.findById(id))!; return outreach.decide(admin, String(leadId), id, { action, revision: m.revision, payloadHash: m.payloadHash, reason: 'Review this exact requested SMS briefing.' }); }
  async function queue() { await optIn(); const m = await draft(); await decide(m.id, 'SUBMIT'); await decide(m.id, 'APPROVE'); return (await SalesMessage.findById(m.id))!; }

  async function callback(value: unknown) {
    const raw = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '987654321', changes: [{ field: 'messages', value: { metadata: { phone_number_id: '123456789' }, ...value as object } }] }] }));
    return webhooks.receive(raw, 'sha256=' + createHmac('sha256', env.SALES_WHATSAPP_APP_SECRET!).update(raw).digest('hex'));
  }
  it('requires explicit channel consent and controlled template content', async () => {
    await expect(draft()).rejects.toMatchObject({ code: 'OUTREACH_CONSENT_REQUIRED' }); await optIn();
    await expect(outreach.prepare(admin, String(leadId), { campaignId: String(campaignId), commandId: randomUUID(), body: 'Unreviewed freeform' })).rejects.toMatchObject({ code: 'WHATSAPP_TEMPLATE_REQUIRED' });
  });
  it('freezes approved source and sends only template parameters once', async () => {
    const m = await queue(); await outreach.deliverNotification(m.notificationId!);
    expect(send).toHaveBeenCalledTimes(1); expect(send.mock.calls[0]?.[0].whatsappTemplate).toEqual({ name: template.name, language: template.language, values: ['SMS Owner'] });
    expect((await SalesMessage.findById(m._id))?.status).toBe('SENT');
  });
  it('rejects template changes before approval without queueing', async () => {
    await optIn(); const m = await draft(); await decide(m.id, 'SUBMIT'); source.mockRejectedValueOnce(new Error('Source unavailable'));
    await expect(decide(m.id, 'APPROVE')).rejects.toThrow('Source unavailable'); expect(await Notification.countDocuments()).toBe(0);
  });
  it('pauses before dispatch when approved template changes', async () => {
    const m = await queue(); source.mockResolvedValueOnce({ ...template, hash: 'changed' });
    await outreach.deliverNotification(m.notificationId!); expect(send).not.toHaveBeenCalled(); expect((await SalesMessage.findById(m._id))?.status).toBe('PAUSED');
  });
  it('never retries an uncertain send and resolves from a later signed status', async () => {
    const m = await queue(); send.mockRejectedValueOnce(new Error('Lost response')); await outreach.deliverNotification(m.notificationId!);
    expect((await SalesMessage.findById(m._id))?.status).toBe('UNCERTAIN'); await outreach.deliverNotification(m.notificationId!); expect(send).toHaveBeenCalledTimes(1);
    await callback({ statuses: [{ id: sid, recipient_id: phone.slice(1), timestamp: String(Math.floor(Date.now()/1000)), status: 'delivered', biz_opaque_callback_data: String(m._id) }] });
    expect((await SalesMessage.findById(m._id))?.deliveryStatus).toBe('DELIVERED');
  });
  it('deduplicates signed replies and suppresses globally without storing callback body', async () => {
    const m = await queue(); await outreach.deliverNotification(m.notificationId!);
    const value = { messages: [{ id: 'incoming-one', from: phone.slice(1), timestamp: String(Math.floor(Date.now()/1000)), type: 'text', text: { body: 'STOP' } }] };
    await callback(value); await callback(value);
    expect((await SalesRecipientControl.findOne({ channel: 'WHATSAPP' }))?.suppressedAt).toBeTruthy();
    expect(await SalesConversationEntry.countDocuments({ direction: 'INBOUND' })).toBe(1);
    expect(JSON.stringify((await WebhookEvent.findOne())?.payload)).not.toContain('STOP');
  });
  it('does not mark an unattempted draft delivered from a signed internal reference', async () => {
    await optIn(); const m = await draft();
    await callback({ statuses: [{ id: sid, recipient_id: phone.slice(1), timestamp: String(Math.floor(Date.now()/1000)), status: 'delivered', biz_opaque_callback_data: m.id }] });
    expect((await SalesMessage.findById(m.id))?.status).toBe('DRAFT');
  });
  it('accepts verified delivery with outbound off and does not downgrade it', async () => {
    const m = await queue(); await outreach.deliverNotification(m.notificationId!); await PlatformSwitch.updateMany({}, { $set: { enabled: false, mode: 'OFF' } });
    for (const state of ['delivered', 'sent']) await callback({ statuses: [{ id: sid, recipient_id: phone.slice(1), timestamp: String(Math.floor(Date.now()/1000)), status: state, biz_opaque_callback_data: String(m._id) }] });
    expect((await SalesMessage.findById(m._id))?.deliveryStatus).toBe('DELIVERED');
  });
  it('rejects forged HTTP callbacks and exposes only the configured challenge', async () => {
    const app = createApp();
    await request(app).post('/api/v1/sales/outreach/webhooks/whatsapp').send({}).expect(401);
    const result = await request(app).get('/api/v1/sales/outreach/webhooks/whatsapp').query({ 'hub.mode': 'subscribe', 'hub.verify_token': env.SALES_WHATSAPP_VERIFY_TOKEN, 'hub.challenge': '12345' }).expect(200);
    expect(result.text).toBe('12345');
    await request(app).get('/api/v1/sales/success/outreach/whatsapp/templates').expect(401);
  });
  it('redacts rendered template values with expired message content', async () => {
    await optIn(); const m = await draft(); await SalesMessage.updateOne({ _id: m.id }, { $set: { contentExpiresAt: new Date(Date.now() - 1000) } });
    const preview = await outreach.view(admin, String(leadId), m.id); expect(preview.message.whatsappTemplate?.values).toBeUndefined();
    await outreach.expireContent(m.id); expect((await SalesMessage.findById(m.id))?.whatsappTemplate?.values).toBeUndefined();
  });
});
