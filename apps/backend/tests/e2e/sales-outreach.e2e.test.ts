import { randomUUID, createHmac } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { User } from '../../src/database/models/User.js';
import { SalesLead } from '../../src/database/models/SalesLead.js';
import { SalesCampaign } from '../../src/database/models/SalesCampaign.js';
import { SalesMessage, SalesRecipientControl, SalesConsentEvent, SalesCampaignUsage, SalesConversationEntry, SalesProviderControl } from '../../src/database/models/SalesCommunication.js';
import { PlatformSwitch } from '../../src/database/models/PlatformSwitch.js';
import { Notification } from '../../src/database/models/Notification.js';
import { Job } from '../../src/database/models/Job.js';
import { WebhookEvent } from '../../src/database/models/WebhookEvent.js';
import { SalesConsentService as consent } from '../../src/modules/sales/sales-consent.service.js';
import { SalesOutreachService as service } from '../../src/modules/sales/sales-outreach.service.js';
import { SalesOutreachWebhookService as webhooks } from '../../src/modules/sales/sales-outreach-webhook.service.js';
import { campaignPayload } from '../../src/modules/sales/sales-campaign.service.js';
import { payloadHash } from '../../src/modules/sales/sales-agent.service.js';
import { setSalesDeliveryTestProvider } from '../../src/integrations/notifications/sales-delivery.provider.js';
import { setSalesInboundTestProvider } from '../../src/integrations/notifications/sales-inbound.provider.js';
import { SalesSuccessService } from '../../src/modules/sales/sales-success.service.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';
import type { MessageInput } from '../../src/core/integrations/provider.types.js';
import * as indexReadiness from '../../src/modules/sales/sales-success-indexes.js';

describe.skipIf(!process.env.RUN_E2E)('Approved consent-bound sales email delivery', () => {
  let mongo: MongoMemoryReplSet, admin: AuthenticatedUser, leadId: Types.ObjectId, campaignId: Types.ObjectId;
  const previous = { EMAIL_FROM: env.EMAIL_FROM, SALES_REPLY_DOMAIN: env.SALES_REPLY_DOMAIN, SALES_RESEND_WEBHOOK_SECRET: env.SALES_RESEND_WEBHOOK_SECRET, SALES_EMAIL_ESTIMATED_MICRO_USD: env.SALES_EMAIL_ESTIMATED_MICRO_USD };
  const send = vi.fn(async (_input: MessageInput) => ({ provider: 'RESEND', providerMessageId: randomUUID(), status: 'SENT' as const }));
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : {} });
    await mongoose.connect(mongo.getUri());
    for (const model of [User, SalesLead, SalesCampaign, SalesMessage, SalesRecipientControl, SalesConsentEvent, SalesCampaignUsage, SalesConversationEntry, SalesProviderControl, PlatformSwitch, Notification, Job, WebhookEvent]) await model.init();
  }, 180000);
  afterAll(async () => { vi.useRealTimers(); Object.assign(env, previous); setSalesDeliveryTestProvider(); setSalesInboundTestProvider(); await mongoose.disconnect(); await mongo?.stop(); });
  beforeEach(async () => {
    vi.useRealTimers(); vi.setSystemTime(new Date('2026-11-02T07:00:00Z'));
    for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
    Object.assign(env, { EMAIL_FROM: 'sales@example.test', SALES_REPLY_DOMAIN: 'replies.example.test', SALES_RESEND_WEBHOOK_SECRET: 'whsec_' + Buffer.alloc(32, 7).toString('base64'), SALES_EMAIL_ESTIMATED_MICRO_USD: 10 });
    send.mockReset(); send.mockImplementation(async () => ({ provider: 'RESEND', providerMessageId: randomUUID(), status: 'SENT' as const }));
    setSalesDeliveryTestProvider({ key: 'RESEND', idempotencyHours: 23, minimumIntervalMs: 0, send });
    const user = await User.create({ phone: '+254700007001', email: 'outreach-admin@example.test', firstName: 'Sales', lastName: 'Admin', isPlatformAdmin: true });
    admin = { userId: user._id, isPlatformAdmin: true, sessionId: new Types.ObjectId(), mfaVerifiedAt: new Date(), adminDualChannel: true, memberships: [] };
    leadId = (await SalesLead.create({ reference: 'OUTREACH-OWNER', name: 'Interested Owner', email: 'owner@example.test', properties: 2, units: '40', challenge: 'Migration', source: 'Manual', consent: 'OPTED_IN' }))._id;
    const campaign = await SalesCampaign.create({ name: 'Reviewed owner briefing', description: 'Requested product information', audience: 'Owners', market: 'Kenya', channel: 'EMAIL', ownerId: user._id, startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 10 * 86400000), messaging: 'Product briefing', selectionCriteria: 'Explicit requests only', dailySendLimit: 10, perContactLimit: 2, budgetMicroUsd: 10000, attributionDays: 30, status: 'ACTIVE', createdBy: user._id });
    campaign.approvedHash = payloadHash(campaignPayload(campaign)); await campaign.save(); campaignId = campaign._id;
    for (const key of ['SALES_OUTBOUND', 'SALES_EMAIL', 'EMAIL_NOTIFICATIONS']) await PlatformSwitch.create({ key, kind: 'FEATURE', name: key, description: 'Controlled delivery test', enabled: true, mode: 'ON' });
  });
  async function optIn() {
    const lead = await SalesLead.findById(leadId);
    return consent.record(admin, String(leadId), { channel: 'EMAIL', decision: 'OPT_IN', evidence: 'Owner explicitly requested a product briefing by email.', timezone: 'Africa/Nairobi', revision: lead!.revision });
  }
  async function draft(body = 'Here is the product briefing that you requested.') {
    return service.prepare(admin, String(leadId), { campaignId: String(campaignId), commandId: randomUUID(), subject: 'Your requested Dapinni briefing', body });
  }
  async function decide(id: string, action: string, actor = admin) {
    const message = await SalesMessage.findById(id);
    return service.decide(actor, String(leadId), id, { action, revision: message!.revision, payloadHash: message!.payloadHash, reason: 'Review the exact requested product briefing.' });
  }
  async function queued() { await optIn(); const m = await draft(); await decide(m.id, 'SUBMIT'); await decide(m.id, 'APPROVE'); return (await SalesMessage.findById(m.id))!; }
  async function callback(message: Awaited<ReturnType<typeof queued>>, type = 'email.delivered', eventId = randomUUID()) {
    const body = Buffer.from(JSON.stringify({ type, created_at: new Date().toISOString(), data: { email_id: message.providerMessageId, from: 'sales@example.test', to: ['owner@example.test'], tags: { sales_message_id: String(message._id) } } }));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = 'v1,' + createHmac('sha256', Buffer.alloc(32, 7)).update(eventId + '.' + timestamp + '.').update(body).digest('base64');
    return { body, headers: { id: eventId, timestamp, signature } };
  }
  it('rejects a legacy consent checkbox until channel-specific evidence exists', async () => {
    await expect(draft()).rejects.toMatchObject({ code: 'OUTREACH_CONSENT_REQUIRED' });
    await optIn(); expect((await draft()).status).toBe('DRAFT'); expect(send).not.toHaveBeenCalled();
  });
  it('requires exact content and fresh human approval before durable notification creation', async () => {
    await optIn(); const m = await draft();
    await expect(decide(m.id, 'APPROVE')).rejects.toMatchObject({ code: 'OUTREACH_STATE_CHANGED' });
    await decide(m.id, 'SUBMIT');
    await expect(decide(m.id, 'APPROVE', { ...admin, adminDualChannel: false })).rejects.toMatchObject({ code: 'FRESH_AUTH_REQUIRED' });
    await SalesMessage.updateOne({ _id: m.id }, { $set: { body: 'Changed after submission.' } });
    await expect(decide(m.id, 'APPROVE')).rejects.toMatchObject({ code: 'OUTREACH_MESSAGE_CHANGED' });
    expect(await Notification.countDocuments()).toBe(0); expect(send).not.toHaveBeenCalled();
  });
  it('sends once under competing workers and distinguishes acceptance from delivery', async () => {
    const m = await queued();
    await Promise.all([service.deliverNotification(m.notificationId!), service.deliverNotification(m.notificationId!)]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({ idempotencyKey: 'sales-message/' + m._id, to: 'owner@example.test' });
    const accepted = (await SalesMessage.findById(m._id))!;
    expect(accepted.status).toBe('SENT'); expect(accepted.deliveryStatus).toBe('ACCEPTED'); expect(accepted.deliveredAt).toBeUndefined();
    const signed = await callback(accepted); await webhooks.receive(signed.body, signed.headers); await webhooks.receive(signed.body, signed.headers);
    const event = (await WebhookEvent.findOne({ eventId: signed.headers.id }))!; await webhooks.consume(String(event._id)); await webhooks.consume(String(event._id));
    expect((await SalesMessage.findById(m._id))?.deliveryStatus).toBe('DELIVERED');
    expect(await SalesConversationEntry.countDocuments()).toBe(1); expect(await WebhookEvent.countDocuments()).toBe(1);
  });
  it('stops queued delivery after opt-out and keeps login notifications independent', async () => {
    const m = await queued(), token = m.unsubscribeUrl.split('/').at(-1)!;
    expect(await service.unsubscribe({ token, confirm: true })).toEqual(await service.unsubscribe({ token: 'a'.repeat(43), confirm: true }));
    await service.deliverNotification(m.notificationId!); expect(send).not.toHaveBeenCalled();
    expect((await SalesMessage.findById(m._id))?.status).toBe('SUPPRESSED');
    expect((await SalesLead.findById(leadId))?.consent).toBe('OPTED_OUT');
    expect(await Notification.countDocuments({ type: { $ne: 'SALES_OUTREACH' } })).toBe(0);
  });
  it('pauses safely when delivery switches or requester authority change', async () => {
    const m = await queued(); await PlatformSwitch.updateOne({ key: 'SALES_EMAIL' }, { $set: { enabled: false, mode: 'OFF' } });
    await service.deliverNotification(m.notificationId!); expect(send).not.toHaveBeenCalled(); expect((await SalesMessage.findById(m._id))?.status).toBe('PAUSED');
  });
  it('does not accept forged callbacks or confuse a delivery event with a read', async () => {
    const m = await queued(); await service.deliverNotification(m.notificationId!);
    const signed = await callback((await SalesMessage.findById(m._id))!);
    await expect(webhooks.receive(Buffer.from('{}'), signed.headers)).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' });
    expect(await WebhookEvent.countDocuments()).toBe(0);
  });
  it('redacts expired content while retaining suppression identifiers and review hashes', async () => {
    const m = await queued(); await SalesMessage.updateOne({ _id: m._id }, { $set: { contentExpiresAt: new Date(Date.now() - 1) } });
    await service.expireContent(String(m._id)); const redacted = (await SalesMessage.findById(m._id).select('+recipient +unsubscribeHash'))!;
    expect(redacted.status).toBe('EXPIRED'); expect(redacted.recipient).toBeUndefined(); expect(redacted.payloadHash).toBe(m.payloadHash); expect(redacted.unsubscribeHash).toBeTruthy();
    await service.deliverNotification(m.notificationId!); expect(send).not.toHaveBeenCalled();
  });
  it('rejects duplicate active content and reused commands with changed payloads', async () => {
    await optIn(); const commandId = randomUUID(), input = { campaignId: String(campaignId), commandId, subject: 'Requested briefing', body: 'The requested product briefing is ready.' };
    const first = await service.prepare(admin, String(leadId), input);
    expect(await service.prepare(admin, String(leadId), input)).toMatchObject({ id: first.id });
    await expect(service.prepare(admin, String(leadId), { ...input, body: 'A different product briefing.' })).rejects.toMatchObject({ code: 'COMMAND_REUSED' });
    await expect(service.prepare(admin, String(leadId), { ...input, commandId: randomUUID() })).rejects.toMatchObject({ code: 'OUTREACH_DUPLICATE' });
  });
  it('invalidates queued content when a fresh administrator corrects the primary email', async () => {
    const m = await queued(), lead = (await SalesLead.findById(leadId))!;
    await SalesSuccessService.update(admin, String(leadId), { revision: lead.revision, email: 'corrected@example.test', contactChangeReason: 'Owner confirmed a corrected primary email address.' });
    await service.deliverNotification(m.notificationId!); expect(send).not.toHaveBeenCalled();
    expect((await SalesLead.findById(leadId))?.consent).toBe('UNKNOWN');
    await expect(consent.eligible(leadId, 'EMAIL')).rejects.toMatchObject({ code: 'CONTACT_SUPPRESSED' });
  });
  it('enforces aggregate campaign cost ceilings without claiming an actual charge', async () => {
    const m = await queued(); await SalesCampaign.updateOne({ _id: campaignId }, { $set: { budgetMicroUsd: 1 } });
    const campaign = (await SalesCampaign.findById(campaignId))!; campaign.approvedHash = payloadHash(campaignPayload(campaign)); await campaign.save();
    // An updated budget invalidates the original message approval before the budget reservation path.
    await service.deliverNotification(m.notificationId!); expect(send).not.toHaveBeenCalled();
    expect((await SalesMessage.findById(m._id))?.status).toBe('PAUSED'); expect(await SalesCampaignUsage.countDocuments()).toBe(0);
  });
  it('holds a message outside recipient working hours', async () => {
    vi.setSystemTime(new Date('2026-11-02T03:00:00Z'));
    const campaign = (await SalesCampaign.findById(campaignId))!; campaign.startsAt = new Date('2026-11-02T02:00:00Z'); campaign.approvedHash = payloadHash(campaignPayload(campaign)); await campaign.save();
    const m = await queued();
    await service.deliverNotification(m.notificationId!); expect(send).not.toHaveBeenCalled();
    const held = (await SalesMessage.findById(m._id))!; expect(held.status).toBe('QUEUED'); expect(held.nextAttemptAt?.toISOString()).toBe('2026-11-02T05:00:00.000Z');
  });
  it('does not resend an ambiguous attempt beyond the provider idempotency window', async () => {
    const m = await queued(); send.mockRejectedValueOnce(new Error('Transport outcome unavailable'));
    await service.deliverNotification(m.notificationId!); expect(send).toHaveBeenCalledTimes(1);
    expect((await SalesMessage.findById(m._id))?.status).toBe('QUEUED');
    vi.setSystemTime(new Date('2026-11-03T07:00:00Z'));
    await service.deliverNotification(m.notificationId!); expect(send).toHaveBeenCalledTimes(1); expect((await SalesMessage.findById(m._id))?.status).toBe('UNCERTAIN');
  });
  it('consumes signed delivery evidence with outbound off and suppresses bounced email', async () => {
    const m = await queued(); await service.deliverNotification(m.notificationId!);
    await PlatformSwitch.updateMany({}, { $set: { enabled: false, mode: 'OFF' } });
    const signed = await callback((await SalesMessage.findById(m._id))!, 'email.bounced'); await webhooks.receive(signed.body, signed.headers);
    await webhooks.consume(String((await WebhookEvent.findOne())!._id));
    expect((await SalesRecipientControl.findOne({ channel: 'EMAIL' }))?.suppressionReason).toBe('BOUNCE');
    expect((await Notification.findById(m.notificationId))?.status).toBe('FAILED');
    expect((await SalesMessage.findById(m._id))?.errorCode).toBe('RESEND_BOUNCED');
    expect((await SalesLead.findById(leadId))?.consent).toBe('OPTED_IN');
    await expect(consent.eligible(leadId, 'EMAIL')).rejects.toMatchObject({ code: 'OUTREACH_CONSENT_REQUIRED' });
  });
  it('records a correlated inbound stop request without treating the address as account authentication', async () => {
    const m = await queued(); await service.deliverNotification(m.notificationId!);
    const emailId = randomUUID();
    setSalesInboundTestProvider({ retrieve: async () => ({ id: emailId, to: [m.replyTo!], from: 'owner@example.test', subject: 'Please stop', text: 'Unsubscribe', occurredAt: new Date(), domainAuthenticated: false, truncated: false }) });
    const signed = await callback({ ...m.toObject(), providerMessageId: emailId } as typeof m, 'email.received');
    const original = JSON.parse(signed.body.toString()) as { data: { to: string[] } }; original.data.to = [m.replyTo!];
    const body = Buffer.from(JSON.stringify(original)), signature = 'v1,' + createHmac('sha256', Buffer.alloc(32, 7)).update(signed.headers.id + '.' + signed.headers.timestamp + '.').update(body).digest('base64');
    await webhooks.receive(body, { ...signed.headers, signature });
    expect((await SalesRecipientControl.findOne())?.lastResponseAt).toBeInstanceOf(Date);
    await webhooks.consume(String((await WebhookEvent.findOne())!._id));
    expect((await SalesLead.findById(leadId))?.consent).toBe('OPTED_OUT');
    expect(await SalesConversationEntry.findOne({ direction: 'INBOUND' }).lean()).toMatchObject({ correlation: 'RECIPIENT_MATCHED', senderAuthentication: 'UNKNOWN', text: 'Unsubscribe' });
  });
  it('denies unassigned delegates and missing constituent permissions across customer history', async () => {
    await optIn(); const m = await draft(), userId = new Types.ObjectId();
    const delegate: AuthenticatedUser = { userId, isPlatformAdmin: false, memberships: [{ organizationId: new Types.ObjectId(), roleIds: [], roles: ['PROPERTY_MANAGER'], permissions: ['sales.leads.read', 'sales.notes.read', 'sales.outreach.read', 'sales.outreach.prepare', 'sales.meetings.read'], scope: { allProperties: true, propertyIds: [], buildingIds: [], unitIds: [] } }] };
    await expect(service.list(delegate, String(leadId), {})).rejects.toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
    await expect(service.view(delegate, String(leadId), m.id)).rejects.toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
    await SalesLead.updateOne({ _id: leadId }, { $set: { assignedTo: userId } });
    expect((await service.list(delegate, String(leadId), {})).items).toHaveLength(1);
    delegate.memberships[0]!.permissions = ['sales.leads.read', 'sales.outreach.read'];
    await expect(service.conversations(delegate, String(leadId), {})).rejects.toMatchObject({ code: 'SALES_PERMISSION_REQUIRED' });
    await expect(service.view(delegate, String(leadId), m.id)).rejects.toMatchObject({ code: 'SALES_PERMISSION_REQUIRED' });
  });
  it('requires explicit acknowledgement before reinstating a suppressed recipient', async () => {
    const m = await queued(); await service.unsubscribe({ token: m.unsubscribeUrl.split('/').at(-1), confirm: true });
    await expect(optIn()).rejects.toMatchObject({ code: 'PREVIOUS_SUPPRESSION_REVIEW_REQUIRED' });
    const lead = (await SalesLead.findById(leadId))!;
    await consent.record(admin, String(leadId), { channel: 'EMAIL', decision: 'OPT_IN', evidence: 'Owner explicitly requested renewed product emails after opting out.', revision: lead.revision, acknowledgePreviousSuppression: true });
    await expect(consent.eligible(leadId, 'EMAIL')).resolves.toHaveProperty('event');
    expect((await SalesMessage.findById(m._id))?.status).toBe('SUPPRESSED');
  });
  it('reserves no budget and never calls a provider when the approved ceiling is exhausted', async () => {
    const campaign = (await SalesCampaign.findById(campaignId))!; campaign.budgetMicroUsd = 1; campaign.approvedHash = payloadHash(campaignPayload(campaign)); await campaign.save();
    const m = await queued(); await service.deliverNotification(m.notificationId!);
    expect(send).not.toHaveBeenCalled(); expect(await SalesCampaignUsage.countDocuments()).toBe(0);
    expect(await SalesMessage.findById(m._id).lean()).toMatchObject({ status: 'PAUSED', errorCode: 'OUTREACH_CAMPAIGN_LIMIT', attempt: 0 });
  });
  it('applies a shared recipient daily ceiling even to different approved messages', async () => {
    const first = await queued(); await service.deliverNotification(first.notificationId!);
    const next = await draft('Additional requested details for a separate review.'); await decide(next.id, 'SUBMIT'); await decide(next.id, 'APPROVE');
    const second = (await SalesMessage.findById(next.id))!; await service.deliverNotification(second.notificationId!);
    expect(send).toHaveBeenCalledTimes(1); expect(await SalesMessage.findById(second._id).lean()).toMatchObject({ status: 'QUEUED', errorCode: 'OUTREACH_RECIPIENT_DAY_LIMIT', attempt: 0 });
  });
  it('keeps denial-only public opt-out available when unrelated dispatch index checks fail', async () => {
    const message = await queued(), prerequisite = vi.spyOn(indexReadiness, 'assertOutreachIndexes').mockRejectedValue(new Error('Dispatch indexes unavailable'));
    try {
      await service.unsubscribe({ token: message.unsubscribeUrl.split('/').at(-1), confirm: true });
      expect(prerequisite).not.toHaveBeenCalled();
      expect((await SalesLead.findById(leadId))?.consent).toBe('OPTED_OUT');
    } finally { prerequisite.mockRestore(); }
  });
  it('verifies raw HTTP callbacks even when a caller reuses an idempotency header', async () => {
    const m = await queued(); await service.deliverNotification(m.notificationId!);
    const signed = await callback((await SalesMessage.findById(m._id))!), app = createApp();
    const headers = { 'svix-id': signed.headers.id, 'svix-timestamp': signed.headers.timestamp, 'svix-signature': signed.headers.signature, 'Idempotency-Key': randomUUID() };
    const accepted = await request(app).post('/api/v1/sales/outreach/webhooks/resend').set(headers).set('Content-Type', 'application/json').send(signed.body.toString());
    expect(accepted.status).toBe(202);
    const forged = await request(app).post('/api/v1/sales/outreach/webhooks/resend').set(headers).set('Content-Type', 'application/json').send('{}');
    expect(forged.status).toBe(401); expect(forged.body.error.code).toBe('WEBHOOK_SIGNATURE_INVALID');
    expect(await WebhookEvent.countDocuments()).toBe(1);
    const unauthenticated = await request(app).get('/api/v1/sales/success/customers/' + leadId + '/messages'); expect(unauthenticated.status).toBe(401);
  });
});
