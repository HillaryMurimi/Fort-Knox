import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { env } from '../../src/config/env.js';
import { User } from '../../src/database/models/User.js';
import { SalesLead } from '../../src/database/models/SalesLead.js';
import { SalesCampaign } from '../../src/database/models/SalesCampaign.js';
import { SalesAgent, SalesAgentRun, SalesAgentApproval } from '../../src/database/models/SalesAgent.js';
import { SalesMessage, SalesRecipientControl, SalesConsentEvent, SalesCampaignUsage, SalesConversationEntry, SalesProviderControl } from '../../src/database/models/SalesCommunication.js';
import { PlatformSwitch } from '../../src/database/models/PlatformSwitch.js';
import { Notification } from '../../src/database/models/Notification.js';
import { Job } from '../../src/database/models/Job.js';
import { SalesConsentService } from '../../src/modules/sales/sales-consent.service.js';
import { SalesAgentService, payloadHash } from '../../src/modules/sales/sales-agent.service.js';
import { SalesAutonomousEmailService } from '../../src/modules/sales/sales-autonomous-email.service.js';
import { SalesOutreachService } from '../../src/modules/sales/sales-outreach.service.js';
import { campaignPayload } from '../../src/modules/sales/sales-campaign.service.js';
import { setSalesModelTestProvider } from '../../src/integrations/ai/sales-model.provider.js';
import { setSalesDeliveryTestProvider } from '../../src/integrations/notifications/sales-delivery.provider.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

describe.skipIf(!process.env.RUN_E2E)('Approved-template autonomous sales email', () => {
  let mongo: MongoMemoryReplSet, admin: AuthenticatedUser, leadId: string, campaignId: string;
  const send = vi.fn(async () => ({ provider: 'RESEND', providerMessageId: randomUUID(), status: 'SENT' as const }));
  const previous = { EMAIL_FROM: env.EMAIL_FROM, SALES_REPLY_DOMAIN: env.SALES_REPLY_DOMAIN, SALES_RESEND_WEBHOOK_SECRET: env.SALES_RESEND_WEBHOOK_SECRET, SALES_EMAIL_ESTIMATED_MICRO_USD: env.SALES_EMAIL_ESTIMATED_MICRO_USD };
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : {} });
    await mongoose.connect(mongo.getUri());
    for (const model of [User, SalesLead, SalesCampaign, SalesAgent, SalesAgentRun, SalesAgentApproval, SalesMessage, SalesRecipientControl, SalesConsentEvent, SalesCampaignUsage, SalesConversationEntry, SalesProviderControl, PlatformSwitch, Notification, Job]) await model.init();
  }, 180000);
  afterAll(async () => { Object.assign(env, previous); setSalesModelTestProvider(); setSalesDeliveryTestProvider(); await mongoose.disconnect(); await mongo.stop(); });
  beforeEach(async () => {
    for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
    Object.assign(env, { EMAIL_FROM: 'sales@example.test', SALES_REPLY_DOMAIN: 'replies.example.test', SALES_RESEND_WEBHOOK_SECRET: 'whsec_' + Buffer.alloc(32, 7).toString('base64'), SALES_EMAIL_ESTIMATED_MICRO_USD: 10 });
    send.mockClear(); setSalesDeliveryTestProvider({ key: 'RESEND', idempotencyHours: 23, minimumIntervalMs: 0, send });
    setSalesModelTestProvider({ configured: () => true, generate: async () => ({ output: { summary: 'Qualified owner requested a briefing', evidence: ['Current CRM qualification'], confidence: 'MEDIUM', limitation: 'Provider delivery is not yet confirmed', action: { tool: 'OUTREACH_DRAFT', reason: 'Approved briefing for a qualified owner', text: 'qualified_intro', subject: null, sourceUrls: [] } }, requestId: randomUUID(), model: 'fixture-model', inputTokens: 100, outputTokens: 50 }) });
    const user = await User.create({ phone: '+254700008001', email: 'auto-admin@example.test', firstName: 'Admin', lastName: 'Sales', isPlatformAdmin: true });
    admin = { userId: user._id, isPlatformAdmin: true, sessionId: new Types.ObjectId(), mfaVerifiedAt: new Date(), adminDualChannel: true, memberships: [] };
    const lead = await SalesLead.create({ reference: 'AUTO-OWNER', name: 'Maya Owner', email: 'maya@example.test', properties: 2, units: '45', challenge: 'Migration', source: 'Manual', leadStatus: 'Qualified', consent: 'UNKNOWN' }); leadId = String(lead._id);
    const campaign = await SalesCampaign.create({ name: 'Requested briefing', description: 'Admin reviewed requested briefing', audience: 'Qualified owners', market: 'Kenya', channel: 'EMAIL', ownerId: user._id, startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 7 * 86400000), messaging: 'Approved product introduction', selectionCriteria: 'Qualified owners with explicit email opt-in', dailySendLimit: 5, perContactLimit: 1, budgetMicroUsd: 1000, status: 'ACTIVE', autoEmailTemplates: [{ id: 'qualified_intro', segment: 'Qualified', subject: 'Your Dapinni briefing, {{customer_name}}', body: 'Hello {{customer_name}}, here is the property operations briefing you requested.' }] });
    campaign.approvedHash = payloadHash(campaignPayload(campaign)); await campaign.save(); campaignId = String(campaign._id);
    for (const key of ['SALES_AI_RUNTIME', 'SALES_AGENT_SALES_OUTREACH', 'SALES_CAMPAIGNS', 'SALES_OUTBOUND', 'SALES_EMAIL', 'EMAIL_NOTIFICATIONS', 'SALES_AUTONOMOUS_EMAIL']) await PlatformSwitch.create({ key, kind: 'FEATURE', name: key, description: 'Controlled autonomous email test', enabled: true, mode: 'ON' });
    await SalesAgentService.configure(admin, 'SALES_OUTREACH', { revision: 0, enabled: true, paused: false, maxDailyRuns: 20, maxOutputTokens: 1500, maxDailyTokens: 1000000, dailyBudgetMicroUsd: 0 });
    await SalesConsentService.record(admin, leadId, { channel: 'EMAIL', decision: 'OPT_IN', evidence: 'Owner explicitly requested this business briefing by email.', timezone: 'Africa/Nairobi', revision: lead.revision });
  });
  async function generated() {
    const queued = await SalesAgentService.create(admin, { agent: 'SALES_OUTREACH', leadId, objective: 'Select the approved requested briefing template', campaignId, commandId: randomUUID() });
    await SalesAgentService.execute(queued.id);
    return queued.id;
  }
  it('requires the independent autonomous switch before accepting a campaign task', async () => {
    await PlatformSwitch.updateOne({ key: 'SALES_AUTONOMOUS_EMAIL' }, { $set: { enabled: false, mode: 'OFF' } });
    await expect(SalesAgentService.create(admin, { agent: 'SALES_OUTREACH', leadId, objective: 'Select the approved briefing', campaignId, commandId: randomUUID() })).rejects.toMatchObject({ code: 'SERVICE_DISABLED' });
    expect(await SalesAgentRun.countDocuments()).toBe(0); expect(send).not.toHaveBeenCalled();
  });
  it('renders approved customer-specific content and dispatches only after worker review', async () => {
    const id = await generated();
    expect(await Job.countDocuments({ type: 'sales.autonomous.email' })).toBe(1);
    await SalesAutonomousEmailService.process(id);
    const message = await SalesMessage.findOne({ leadId }).select('+recipient');
    expect(message).toMatchObject({ status: 'QUEUED', autonomousTemplateId: 'qualified_intro', subject: 'Your Dapinni briefing, Maya Owner' });
    expect(message?.body).toContain('Hello Maya Owner, here is the property operations briefing you requested.');
    expect(message?.reviewedBy).toBeUndefined(); expect(send).not.toHaveBeenCalled();
    await SalesOutreachService.deliverNotification(message!.notificationId!);
    expect(send).toHaveBeenCalledTimes(1); expect((await SalesMessage.findById(message!._id))?.status).toBe('SENT');
    await SalesAutonomousEmailService.process(id); expect(send).toHaveBeenCalledTimes(1);
  });
  it('does not dispatch after a channel stop or customer opt-out', async () => {
    const id = await generated(); await SalesAutonomousEmailService.process(id);
    const message = await SalesMessage.findOne({ leadId });
    await PlatformSwitch.updateOne({ key: 'SALES_AUTONOMOUS_EMAIL' }, { $set: { enabled: false, mode: 'OFF' } });
    await SalesOutreachService.deliverNotification(message!.notificationId!);
    expect(send).not.toHaveBeenCalled(); expect((await SalesMessage.findById(message!._id))?.status).toBe('PAUSED');
  });
  it('blocks dispatch when the customer opts out after queueing', async () => {
    const id = await generated(); await SalesAutonomousEmailService.process(id);
    const message = await SalesMessage.findOne({ leadId });
    await SalesOutreachService.unsubscribe({ token: message!.unsubscribeUrl.split('/').at(-1)!, confirm: true });
    await SalesOutreachService.deliverNotification(message!.notificationId!);
    expect(send).not.toHaveBeenCalled(); expect((await SalesMessage.findById(message!._id))?.status).toBe('SUPPRESSED');
  });
  it('blocks dispatch when the approved campaign is changed after queueing', async () => {
    const id = await generated(); await SalesAutonomousEmailService.process(id);
    const message = await SalesMessage.findOne({ leadId });
    await SalesCampaign.updateOne({ _id: campaignId }, { $set: { 'autoEmailTemplates.0.subject': 'A changed subject for {{customer_name}}' } });
    await SalesOutreachService.deliverNotification(message!.notificationId!);
    expect(send).not.toHaveBeenCalled(); expect((await SalesMessage.findById(message!._id))?.status).toBe('PAUSED');
  });
  it('does not convert model free text or an incorrect segment into a provider call', async () => {
    const id = await generated();
    await SalesLead.updateOne({ _id: leadId }, { $set: { leadStatus: 'Nurture' } });
    await expect(SalesAutonomousEmailService.process(id)).rejects.toMatchObject({ code: 'AUTONOMOUS_SEGMENT_CHANGED' });
    expect(await SalesMessage.countDocuments()).toBe(0); expect(send).not.toHaveBeenCalled();
    expect((await SalesAgentApproval.findOne({ runId: id }))?.status).toBe('PENDING');
  });
  it('leaves unapproved model wording for review and never schedules it for transport', async () => {
    setSalesModelTestProvider({ configured: () => true, generate: async () => ({ output: { summary: 'Unreviewed prose', evidence: [], confidence: 'LOW', limitation: 'No approved template selected', action: { tool: 'OUTREACH_DRAFT', reason: 'Suggested text', text: 'Invented discount and unsupported product promise', subject: null, sourceUrls: [] } }, requestId: randomUUID(), model: 'fixture-model', inputTokens: 100, outputTokens: 50 }) });
    const id = await generated();
    expect(await Job.countDocuments({ type: 'sales.autonomous.email' })).toBe(0);
    expect(await SalesAutonomousEmailService.process(id)).toEqual({ skipped: true });
    expect(await SalesMessage.countDocuments()).toBe(0); expect(send).not.toHaveBeenCalled();
  });
});
