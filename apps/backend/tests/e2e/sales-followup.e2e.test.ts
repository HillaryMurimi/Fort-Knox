import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { User } from '../../src/database/models/User.js';
import { SalesLead } from '../../src/database/models/SalesLead.js';
import { SalesCampaign } from '../../src/database/models/SalesCampaign.js';
import { SalesMeeting } from '../../src/database/models/SalesMeeting.js';
import { SalesFollowUp, SalesFollowUpPolicy } from '../../src/database/models/SalesFollowUp.js';
import { SalesAgent, SalesAgentRun, SalesAgentApproval } from '../../src/database/models/SalesAgent.js';
import { SalesMessage, SalesConsentEvent, SalesRecipientControl, SalesCampaignUsage, SalesConversationEntry, SalesProviderControl } from '../../src/database/models/SalesCommunication.js';
import { PlatformSwitch } from '../../src/database/models/PlatformSwitch.js';
import { Notification } from '../../src/database/models/Notification.js';
import { Job } from '../../src/database/models/Job.js';
import { WebhookEvent } from '../../src/database/models/WebhookEvent.js';
import { SalesFollowUpService as followups } from '../../src/modules/sales/sales-followup.service.js';
import { SalesFollowUpPolicyService as policies } from '../../src/modules/sales/sales-followup-policy.service.js';
import { SalesOutreachService as outreach } from '../../src/modules/sales/sales-outreach.service.js';
import { SalesConsentService as consent } from '../../src/modules/sales/sales-consent.service.js';
import { SalesAgentService as agents, payloadHash } from '../../src/modules/sales/sales-agent.service.js';
import { campaignPayload } from '../../src/modules/sales/sales-campaign.service.js';
import { setSalesDeliveryTestProvider } from '../../src/integrations/notifications/sales-delivery.provider.js';
import { setSalesModelTestProvider } from '../../src/integrations/ai/sales-model.provider.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

import { followUpEvidence } from '../../src/modules/sales/sales-followup-evidence.repository.js';
import { Organization } from '../../src/database/models/Organization.js';
import { OrganizationSubscription } from '../../src/database/models/OrganizationSubscription.js';
import { AcquisitionJourney } from '../../src/database/models/AcquisitionJourney.js';
import { PropertyOnboardingRequest } from '../../src/database/models/PropertyOnboardingRequest.js';
import { Property } from '../../src/database/models/Property.js';
import { hashPayload } from '../../src/core/integrations/webhook.security.js';

import { OrganizationContract } from '../../src/database/models/OrganizationContract.js';
import { SubscriptionInvoice } from '../../src/database/models/SubscriptionInvoice.js';
import { IntegrationService } from '../../src/modules/integrations/integration.service.js';
import { integrationConfig } from '../../src/core/integrations/config.js';

import { SalesSuccessService } from '../../src/modules/sales/sales-success.service.js';
import { SalesHistoryService } from '../../src/modules/sales/sales-history.service.js';

describe.skipIf(!process.env.RUN_E2E)('Durable governed follow-up sequences', () => {
  let mongo: MongoMemoryReplSet, admin: AuthenticatedUser, leadId: string, campaignId: string;
  const previous = { PUBLIC_API_URL: env.PUBLIC_API_URL, SALES_SMS_FROM: env.SALES_SMS_FROM, SMS_FROM: env.SMS_FROM, TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN, SMS_ENABLED: env.SMS_ENABLED, SALES_SMS_COST_PER_SEGMENT_MICRO_USD: env.SALES_SMS_COST_PER_SEGMENT_MICRO_USD };
  const send = vi.fn(async () => ({ provider: 'TWILIO', providerMessageId: 'SM'+randomBytes(16).toString('hex'), status: 'SENT' as const }));
  const fresh = () => { admin.mfaVerifiedAt = new Date(); return admin; };
  const advance = (hours: number) => vi.setSystemTime(new Date(Date.now()+hours*3600000));
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : {} }); await mongoose.connect(mongo.getUri());
    for (const model of [User, SalesLead, SalesCampaign, SalesMeeting, SalesFollowUp, SalesFollowUpPolicy, SalesAgent, SalesAgentRun, SalesAgentApproval, SalesMessage, SalesConsentEvent, SalesRecipientControl, SalesCampaignUsage, SalesConversationEntry, SalesProviderControl, PlatformSwitch, Notification, Job, WebhookEvent]) await model.init();
  }, 180000);
  afterAll(async () => { vi.useRealTimers(); Object.assign(env, previous); setSalesDeliveryTestProvider(undefined, 'SMS'); setSalesModelTestProvider(); await mongoose.disconnect(); await mongo?.stop(); });
  beforeEach(async () => {
    vi.useRealTimers(); vi.setSystemTime(new Date('2026-11-02T07:00:00Z'));
    for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
    Object.assign(env, { PUBLIC_API_URL: 'https://api.example.test', SALES_SMS_FROM: '+254700006001', SMS_FROM: '+254700006002', TWILIO_ACCOUNT_SID: 'AC'+'a'.repeat(32), TWILIO_AUTH_TOKEN: 'controlled-followup-signature-token', SMS_ENABLED: true, SALES_SMS_COST_PER_SEGMENT_MICRO_USD: 10 });
    send.mockClear(); setSalesDeliveryTestProvider({ key: 'TWILIO', idempotencyHours: 0, minimumIntervalMs: 0, send }, 'SMS'); setSalesModelTestProvider();
    const user = await User.create({ phone: '+254700006099', email: 'followup-admin@example.test', firstName: 'Followup', lastName: 'Admin', isPlatformAdmin: true });
    admin = { userId: user._id, isPlatformAdmin: true, sessionId: new Types.ObjectId(), mfaVerifiedAt: new Date(), adminDualChannel: true, memberships: [] };
    leadId = String((await SalesLead.create({ reference: 'FOLLOWUP-OWNER', name: 'Followup Owner', phone: '+254700006003', email: 'followup-owner@example.test', properties: 1, units: '40', challenge: 'Requested migration help', source: 'Manual', consent: 'UNKNOWN', leadStatus: 'Qualified', nextActionDate: new Date(Date.now()+3600000) }))._id);
    const campaign = await SalesCampaign.create({ name: 'Requested followup briefing', description: 'Explicit reviewed customer assistance', audience: 'Approved owners', market: 'Kenya', channel: 'SMS', ownerId: user._id, startsAt: new Date(Date.now()-60000), endsAt: new Date(Date.now()+30*86400000), messaging: 'Requested assistance only', selectionCriteria: 'Reviewed specific customers', dailySendLimit: 20, perContactLimit: 5, budgetMicroUsd: 10000, attributionDays: 30, status: 'ACTIVE', createdBy: user._id }); campaign.approvedHash = payloadHash(campaignPayload(campaign)); await campaign.save(); campaignId = String(campaign._id);
    for (const key of ['SALES_FOLLOWUPS', 'SALES_OUTBOUND', 'SALES_SMS', 'SMS_NOTIFICATIONS', 'SALES_AI_RUNTIME', 'SALES_AGENT_FOLLOW_UP', 'SALES_APPROVALS']) await PlatformSwitch.create({ key, kind: 'FEATURE', name: key, description: 'Controlled followup test', enabled: true, mode: 'ON' });
    const lead = (await SalesLead.findById(leadId))!; await consent.record(admin, leadId, { channel: 'SMS', decision: 'OPT_IN', evidence: 'Customer explicitly requested sales migration assistance by SMS.', revision: lead.revision });
  });
  async function policy(mode = 'HUMAN_TEMPLATE', overrides: Record<string, unknown> = {}) {
    const created = await policies.create(fresh(), { name: 'Reviewed requested followups', campaignId, trigger: 'CUSTOMER_REQUESTED', audienceLeadIds: [leadId], responsibleId: String(admin.userId), mode, initialDelayMinutes: 60, repeatDelayMinutes: 1440, maximumAttempts: 2, expiresAfterDays: 7, ...(mode === 'HUMAN_TEMPLATE' ? { templates: [{ body: 'Your requested migration briefing is available.' }, { body: 'Would you like help preparing the property inventory?' }] } : {}), ...overrides });
    await policies.decide(fresh(), created.id, { revision: created.revision, payloadHash: created.payloadHash, action: 'ACTIVATE', reason: 'Reviewed exact cohort, distinct content, cadence and human approval requirement.' }); return created.id;
  }
  async function enroll(policyId?: string) { return followups.enroll(fresh(), leadId, { policyId: policyId ?? await policy(), commandId: randomUUID(), evidence: 'Customer requested this bounded followup after reviewing the migration discussion.' }); }
  async function wake(id: string) { advance(1); return followups.wake(id); }
  async function review(messageId: string, action: string) { const m = (await SalesMessage.findById(messageId))!; return outreach.decide(fresh(), leadId, messageId, { action, revision: m.revision, payloadHash: m.payloadHash, reason: 'Reviewed this exact governed followup and the current source context.' }); }
  async function sendReviewed(messageId: string) { const m = (await SalesMessage.findById(messageId))!; await review(messageId, 'SUBMIT'); await review(messageId, 'APPROVE'); await outreach.deliverNotification(m.notificationId ?? (await SalesMessage.findById(messageId))!.notificationId!); }
  async function control(id: string, action: string, extra: Record<string, unknown> = {}) { const p = (await SalesFollowUp.findById(id))!; return followups.control(fresh(), leadId, id, { revision: p.revision, action, context: 'Human reviewed the current sequence and recorded the requested intervention.', ...extra }); }
  it('prepares a bound draft at due time but never sends or queues delivery without review', async () => {
    const plan = await enroll(); await followups.wake(plan.id); expect(await SalesMessage.countDocuments()).toBe(0); await wake(plan.id);
    const message = (await SalesMessage.findOne())!; expect(String(message.followUpId)).toBe(plan.id); expect(message.status).toBe('DRAFT'); expect(await Notification.countDocuments()).toBe(0); expect(send).not.toHaveBeenCalled();
  });
  it('serializes concurrent wakes and prevents another active sequence or replayed source', async () => {
    const id = await policy(), plan = await enroll(id); advance(1); await Promise.all([followups.wake(plan.id), followups.wake(plan.id)]); expect(await SalesMessage.countDocuments()).toBe(1);
    await expect(enroll(id)).rejects.toMatchObject({ code: 'FOLLOWUP_ALREADY_RECORDED' }); await control(plan.id, 'CANCEL'); await expect(enroll(id)).rejects.toMatchObject({ code: 'FOLLOWUP_ALREADY_RECORDED' });
  });
  it('enforces cadence, distinct content and the maximum number of reviewed contacts', async () => {
    const plan = await enroll(); await wake(plan.id); let current = (await SalesFollowUp.findById(plan.id))!; const first = String(current.steps[0]!.messageId); await sendReviewed(first); await followups.wake(plan.id);
    await followups.wake(plan.id); expect(await SalesMessage.countDocuments()).toBe(1); advance(24); await followups.wake(plan.id); current = (await SalesFollowUp.findById(plan.id))!; const second = String(current.steps[1]!.messageId); expect(second).not.toBe(first); await sendReviewed(second); await followups.wake(plan.id);
    expect(send).toHaveBeenCalledTimes(2); expect((await SalesFollowUp.findById(plan.id))?.status).toBe('EXHAUSTED'); expect((await SalesMessage.findById(first))?.body).not.toBe((await SalesMessage.findById(second))?.body);
  });
  it('stops on a new response even when timestamps have not advanced', async () => {
    const plan = await enroll(); const at = new Date(); await SalesRecipientControl.updateOne({ channel: 'SMS' }, { $inc: { responseRevision: 1 }, $set: { lastResponseAt: at } });
    await wake(plan.id); expect((await SalesFollowUp.findById(plan.id))?.status).toBe('STOPPED'); expect(await SalesMessage.countDocuments()).toBe(0); expect(send).not.toHaveBeenCalled();
  });
  it('stops old pending drafts when a meeting is booked without relying on clock ordering', async () => {
    const plan = await enroll(); await wake(plan.id); await SalesMeeting.create({ leadId, representativeId: admin.userId, startsAt: new Date(Date.now()+86400000), endsAt: new Date(Date.now()+86400000+1800000), type: 'DEMO', createdBy: admin.userId }); await followups.wake(plan.id);
    expect((await SalesFollowUp.findById(plan.id))?.reasonCode).toContain('MEETING_BOOKED'); expect((await SalesMessage.findOne())?.status).toBe('CANCELLED'); expect(send).not.toHaveBeenCalled();
  });
  it('honors opt-out while manually paused and refuses to restart the old source', async () => {
    const plan = await enroll(); await wake(plan.id); await control(plan.id, 'PAUSE'); const lead = (await SalesLead.findById(leadId))!; await consent.record(fresh(), leadId, { channel: 'SMS', decision: 'OPT_OUT', revision: lead.revision, evidence: 'Customer explicitly requested no further sales or assistance contact.' }); await followups.wake(plan.id);
    expect((await SalesFollowUp.findById(plan.id))?.status).toBe('STOPPED'); await expect(control(plan.id, 'RESUME')).rejects.toMatchObject({ code: 'FOLLOWUP_SOURCE_CHANGED' }); expect(send).not.toHaveBeenCalled();
  });
  it('pauses and resumes without bypassing a fresh review of the paused message', async () => {
    const plan = await enroll(); await wake(plan.id); const message = (await SalesMessage.findOne())!; await control(plan.id, 'PAUSE'); expect((await SalesMessage.findById(message._id))?.status).toBe('PAUSED');
    await expect(review(String(message._id), 'RESUME')).rejects.toMatchObject({ code: 'FOLLOWUP_NOT_ACTIVE' }); await control(plan.id, 'RESUME'); advance(1/60); await review(String(message._id), 'RESUME'); await outreach.deliverNotification((await SalesMessage.findById(message._id))!.notificationId!); expect(send).toHaveBeenCalledTimes(1);
  });
  it('rescheduling an approved queued message prevents the old date from dispatching', async () => {
    const plan = await enroll(); await wake(plan.id); const message = (await SalesMessage.findOne())!; await review(String(message._id), 'SUBMIT'); await review(String(message._id), 'APPROVE'); await control(plan.id, 'RESCHEDULE', { nextContactAt: new Date(Date.now()+86400000).toISOString() });
    await outreach.deliverNotification((await SalesMessage.findById(message._id))!.notificationId!); expect(send).not.toHaveBeenCalled(); expect((await SalesMessage.findById(message._id))?.status).toBe('PAUSED');
    await review(String(message._id), 'RESUME'); await outreach.deliverNotification((await SalesMessage.findById(message._id))!.notificationId!); expect(send).not.toHaveBeenCalled(); advance(24); await outreach.deliverNotification((await SalesMessage.findById(message._id))!.notificationId!); expect(send).toHaveBeenCalledTimes(1);
  });
  it('does not let manual outreach detach an internally bound step', async () => {
    const plan = await enroll(); await wake(plan.id); const message = (await SalesMessage.findOne())!;
    await expect(outreach.prepare(admin, leadId, { campaignId, commandId: message.commandId, body: 'Try to detach the governed followup from its source.' })).rejects.toMatchObject({ code: 'COMMAND_REUSED' });
    expect(send).not.toHaveBeenCalled();
  });
  it('requires a fresh exact policy decision and rejects repeated templates', async () => {
    await expect(policies.create({ ...admin, adminDualChannel: false }, {})).rejects.toMatchObject({ statusCode: 403 });
    await expect(policy('HUMAN_TEMPLATE', { templates: [{ body: 'The exact same requested message.' }, { body: 'The exact same requested message.' }] })).rejects.toMatchObject({ code: 'FOLLOWUP_REPEATED_TEMPLATE' });
  });
  it('fences revoked responsible users before any contact', async () => {
    const plan = await enroll(); await wake(plan.id); const message = (await SalesMessage.findOne())!; await review(String(message._id), 'SUBMIT'); await review(String(message._id), 'APPROVE'); await User.updateOne({ _id: admin.userId }, { $set: { status: 'DEACTIVATED' } }); await outreach.deliverNotification((await SalesMessage.findById(message._id))!.notificationId!); expect(send).not.toHaveBeenCalled();
  });
  it('uses actual agent execution and separate proposal/message approvals for AI mode', async () => {
    await agents.configure(fresh(), 'FOLLOW_UP', { revision: 0, enabled: true, paused: false, maxDailyRuns: 20, maxOutputTokens: 1500, maxDailyTokens: 10000, dailyBudgetMicroUsd: 0 });
    setSalesModelTestProvider({ configured: () => true, generate: async () => ({ output: { summary: 'Relevant requested followup', evidence: ['Recorded customer request'], confidence: 'MEDIUM', limitation: 'No message has been sent.', action: { tool: 'OUTREACH_DRAFT', reason: 'The request remains unresolved', text: 'Would a guided migration briefing be useful?', subject: null, sourceUrls: [] } }, requestId: 'controlled-followup-model', model: 'controlled-test-model', inputTokens: 100, outputTokens: 100 }) });
    const plan = await enroll(await policy('AI_PROPOSAL')); await wake(plan.id); const run = (await SalesAgentRun.findOne())!; expect(String(run.followUpId)).toBe(plan.id); await agents.execute(String(run._id)); const approval = (await SalesAgentApproval.findOne())!;
    expect(await SalesMessage.countDocuments()).toBe(0); await agents.decide(fresh(), String(approval._id), { decision: 'APPROVE', payloadHash: approval.payloadHash, reason: 'Reviewed exact proposed followup against current source evidence.' }); await followups.wake(plan.id);
    const message = (await SalesMessage.findOne())!; expect(String(message.followUpId)).toBe(plan.id); expect(message.status).toBe('DRAFT'); expect(send).not.toHaveBeenCalled(); await sendReviewed(String(message._id)); expect(send).toHaveBeenCalledTimes(1);
  });
  it('keeps scan pages and automatic detection idempotent under the reviewed cohort', async () => {
    const id = await policy(); await followups.detect(id, leadId); await followups.detect(id, leadId); expect(await SalesFollowUp.countDocuments()).toBe(1);
    const cycleKey = String(Math.floor(Date.now()/900000)); await followups.scan({ cycleKey }); await followups.scan({ cycleKey }); expect(await Job.countDocuments({ type: 'sales.followup.detect' })).toBe(1); expect(send).not.toHaveBeenCalled();
  });
  it('requires authentication at policy, enrollment and control routes', async () => {
    const app = createApp(); await request(app).get('/api/v1/sales/success/followups/policies').expect(401); await request(app).post('/api/v1/sales/success/customers/'+leadId+'/followups').send({}).expect(401); await request(app).post('/api/v1/sales/success/customers/'+leadId+'/followups/'+new Types.ObjectId()+'/controls').send({}).expect(401);
  });
  it.each(['DEMO_BOOKED', 'DEMO_MISSED', 'DEMO_COMPLETED', 'MEETING_NOT_HELD'] as const)('uses actual meeting evidence for %s and rejects another customer', async trigger => {
    const status = trigger === 'DEMO_BOOKED' ? 'SCHEDULED' : trigger === 'DEMO_MISSED' ? 'NO_SHOW' : trigger === 'DEMO_COMPLETED' ? 'COMPLETED' : 'NOT_HELD';
    const meeting = await SalesMeeting.create({ leadId, representativeId: admin.userId, createdBy: admin.userId, type: 'DEMO', status, startsAt: new Date(Date.now()+86400000), endsAt: new Date(Date.now()+90000000) });
    expect((await followUpEvidence(leadId, trigger)).source).toMatchObject({ id: String(meeting._id), status, kind: 'CRM_MEETING_NOT_EXTERNAL_CONFIRMATION' });
    await SalesMeeting.updateOne({ _id: meeting._id }, { $set: { leadId: new Types.ObjectId() } });
    expect((await followUpEvidence(leadId, trigger)).source).toBeUndefined();
  });
  it('requires actual delivery and a current correlated reply, never mere sent text or expired content', async () => {
    const plan = await enroll(); await wake(plan.id); const message = (await SalesMessage.findOne())!;
    expect((await followUpEvidence(leadId, 'DELIVERED_NO_REPLY')).source).toBeUndefined();
    await SalesMessage.updateOne({ _id: message._id }, { $set: { deliveryStatus: 'DELIVERED', deliveredAt: new Date() } });
    expect((await followUpEvidence(leadId, 'DELIVERED_NO_REPLY')).source?.kind).toBe('VERIFIED_PROVIDER_DELIVERY_NOT_READING');
    await SalesConversationEntry.collection.insertOne({ leadId: new Types.ObjectId(leadId), direction: 'INBOUND', correlation: 'REVIEW_REQUIRED', occurredAt: new Date(), contentExpiresAt: new Date(Date.now()+86400000), sourceKey: 'reply-proof', text: 'Untrusted reply' });
    expect((await followUpEvidence(leadId, 'PROSPECT_REPLIED')).source).toBeUndefined();
    await SalesConversationEntry.updateOne({ sourceKey: 'reply-proof' }, { $set: { correlation: 'RECIPIENT_MATCHED' } });
    expect((await followUpEvidence(leadId, 'PROSPECT_REPLIED')).source?.kind).toBe('CORRELATED_PROVIDER_REPLY_NOT_ACCOUNT_AUTHENTICATION');
    advance(25); expect((await followUpEvidence(leadId, 'PROSPECT_REPLIED')).source).toBeUndefined();
  });
  it('does not treat anonymous signup activity as verified identity or collect it without consent', async () => {
    const journey = await AcquisitionJourney.create({ salesLeadId: leadId, signupStartedAt: new Date(), expiresAt: new Date(Date.now()+86400000) });
    expect((await followUpEvidence(leadId, 'REGISTRATION_INCOMPLETE')).source).toBeUndefined();
    journey.salesTrackingConsentAt = new Date(); await journey.save();
    expect((await followUpEvidence(leadId, 'REGISTRATION_INCOMPLETE')).source?.kind).toBe('ANONYMOUS_CONSENTED_INVITATION_ACTIVITY_NOT_IDENTITY');
    journey.organizationId = new Types.ObjectId(); await journey.save();
    expect((await followUpEvidence(leadId, 'REGISTRATION_INCOMPLETE')).source).toBeUndefined();
  });
  async function linked() {
    const org = await Organization.create({ name: 'Followup inventory owner', slug: 'followup-inventory-owner', onboarding: { ownerUserId: admin.userId, unitCount: 40 } });
    await SalesLead.updateOne({ _id: leadId }, { $set: { organizationId: org._id } }); return org;
  }
  it('requires the explicitly linked active owner for pending email verification', async () => {
    const org = await linked(); expect((await followUpEvidence(leadId, 'EMAIL_VERIFICATION_PENDING')).source).toBeDefined();
    await User.updateOne({ _id: admin.userId }, { $set: { emailVerifiedAt: new Date() } });
    expect((await followUpEvidence(leadId, 'EMAIL_VERIFICATION_PENDING')).source).toBeUndefined();
    await Organization.updateOne({ _id: org._id }, { $unset: { 'onboarding.ownerUserId': 1 } });
    expect((await followUpEvidence(leadId, 'EMAIL_VERIFICATION_PENDING')).source).toBeUndefined();
  });
  it('requires canonical subscription failure proof and never equates checkout, PAST_DUE or an ACTIVE label with verified payment', async () => {
    const org = await linked();
    const subscription = await OrganizationSubscription.create({ organizationId: org._id, planId: new Types.ObjectId(), status: 'PAST_DUE', currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now()+86400000), provider: 'PAYSTACK', createdBy: admin.userId, updatedBy: admin.userId, providerSubscriptionId: 'SUB_controlled-followup', providerCheckoutReference: 'controlled-checkout' });
    expect((await followUpEvidence(leadId, 'CHECKOUT_INCOMPLETE')).source?.kind).toBe('COMMERCIAL_CHECKOUT_RECORD_NOT_PAYMENT');
    expect((await followUpEvidence(leadId, 'PAYMENT_FAILED')).source).toBeUndefined();
    await WebhookEvent.create({ provider: 'PAYSTACK', eventId: 'controlled-failure', payloadHash: 'a'.repeat(64), status: 'PROCESSED', payload: { event: 'invoice.payment_failed', data: { salesSubscriptionHash: hashPayload(Buffer.from('SUB_another-customer')) } } });
    expect((await followUpEvidence(leadId, 'PAYMENT_FAILED')).source).toBeUndefined();
    await WebhookEvent.updateOne({ eventId: 'controlled-failure' }, { $set: { 'payload.data.salesSubscriptionHash': hashPayload(Buffer.from('SUB_controlled-followup')) } });
    expect((await followUpEvidence(leadId, 'PAYMENT_FAILED')).source?.kind).toBe('VERIFIED_COMMERCIAL_PROVIDER_FAILURE_EVENT_NOT_RENT');
    await OrganizationSubscription.updateOne({ _id: subscription._id }, { $set: { status: 'ACTIVE' } });
    await Organization.updateOne({ _id: org._id }, { $set: { 'onboarding.paymentVerifiedAt': new Date() } });
    expect((await followUpEvidence(leadId, 'SUBSCRIPTION_ACTIVATED')).source).toBeUndefined();
    expect((await followUpEvidence(leadId, 'PAYMENT_FAILED')).source).toBeUndefined();
  });
  it('uses actual inventory and assistance records, and detects progress without resetting the baseline', async () => {
    const org = await linked(); expect((await followUpEvidence(leadId, 'PROPERTY_ONBOARDING_NOT_STARTED')).source?.kind).toBe('ACTUAL_PROPERTY_INVENTORY');
    expect((await followUpEvidence(leadId, 'UNIT_ONBOARDING_STALLED')).source).toBeUndefined();
    advance(73); expect((await followUpEvidence(leadId, 'UNIT_ONBOARDING_STALLED')).source?.kind).toBe('ACTUAL_UNIT_INVENTORY_AND_72_HOUR_STALL');
    const assistance = await PropertyOnboardingRequest.create({ organizationId: org._id, requestedBy: admin.userId, properties: [], status: 'REQUESTED' });
    expect((await followUpEvidence(leadId, 'ASSISTANCE_UNRESOLVED')).source?.id).toBe(String(assistance._id));
    assistance.status = 'COMPLETED'; await assistance.save(); expect((await followUpEvidence(leadId, 'ASSISTANCE_UNRESOLVED')).source).toBeUndefined();
    const plan = await enroll(); await Property.collection.insertOne({ organizationId: org._id, name: 'Actual first property', status: 'ACTIVE', createdAt: new Date() });
    await followups.wake(plan.id); expect((await SalesFollowUp.findById(plan.id))?.reasonCode).toBe('FOLLOWUP_ONBOARDING_RESUMED'); expect(send).not.toHaveBeenCalled();
  });
  it('returns bounded policy options only for the current customer and blocks unassigned or missing permissions', async () => {
    await policy(); const options = await followups.options(admin, leadId, {}); expect(options.items).toHaveLength(1); expect(options.items[0]).not.toHaveProperty('templates');
    const delegate: AuthenticatedUser = { ...admin, isPlatformAdmin: false, memberships: [{ organizationId: new Types.ObjectId(), roleIds: [], roles: ['PROPERTY_MANAGER'], permissions: ['sales.leads.read', 'sales.followups.read', 'sales.followups.manage', 'sales.outreach.prepare'], scope: { allProperties: true, propertyIds: [], buildingIds: [], unitIds: [] } }] };
    await expect(followups.list(delegate, leadId, {})).rejects.toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
    await SalesLead.updateOne({ _id: leadId }, { $set: { assignedTo: admin.userId } }); expect((await followups.list(delegate, leadId, {})).items).toHaveLength(0);
    delegate.memberships[0]!.permissions = ['sales.leads.read']; await expect(followups.options(delegate, leadId, {})).rejects.toMatchObject({ code: 'SALES_PERMISSION_REQUIRED' });
    await expect(followups.list(delegate, leadId, {})).rejects.toMatchObject({ code: 'SALES_PERMISSION_REQUIRED' });
  });
  it('blocks actual dispatch after automation is disabled and preserves the single draft', async () => {
    const plan = await enroll(); await wake(plan.id); const message = (await SalesMessage.findOne())!;
    await review(String(message._id), 'SUBMIT'); await review(String(message._id), 'APPROVE');
    await PlatformSwitch.updateOne({ key: 'SALES_FOLLOWUPS' }, { $set: { enabled: false, mode: 'OFF' } });
    await outreach.deliverNotification((await SalesMessage.findById(message._id))!.notificationId!); await followups.wake(plan.id);
    expect(send).not.toHaveBeenCalled(); expect(await SalesMessage.countDocuments()).toBe(1); expect((await SalesFollowUp.findById(plan.id))?.status).toBe('PAUSED');
  });

  it('stops only after the complete canonical commercial payment proof exists', async () => {
    const org = await linked(), plan = await enroll();
    const subscription = await OrganizationSubscription.create({ organizationId: org._id, planId: new Types.ObjectId(), status: 'ACTIVE', currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now()+86400000), createdBy: admin.userId, updatedBy: admin.userId });
    const contract = await OrganizationContract.create({ organizationId: org._id, generation: 1, templateVersionId: new Types.ObjectId(), templateId: 'controlled', templateVersion: 1, templateHash: 'a'.repeat(64), templateName: 'Controlled fixture', body: 'Controlled signed commercial terms', sha256: 'a'.repeat(64), snapshot: { controlled: true }, status: 'SIGNED', documentId: new Types.ObjectId(), createdBy: admin.userId });
    const invoice = await SubscriptionInvoice.create({ organizationId: org._id, subscriptionId: subscription._id, contractId: contract._id, invoiceNumber: 'CONTROLLED-1', periodStart: new Date(), periodEnd: new Date(Date.now()+86400000), subtotal: 100, total: 100, currency: 'KES', dueDate: new Date(), status: 'PAID', provider: 'PAYSTACK', providerInvoiceId: 'controlled-provider-invoice', createdBy: admin.userId, updatedBy: admin.userId });
    await Organization.updateOne({ _id: org._id }, { $set: { 'onboarding.invoiceId': invoice._id, 'onboarding.contractId': contract._id } });
    expect((await followUpEvidence(leadId, 'SUBSCRIPTION_ACTIVATED')).source).toBeUndefined();
    await Organization.updateOne({ _id: org._id }, { $set: { 'onboarding.paymentVerifiedAt': new Date() } });
    expect((await followUpEvidence(leadId, 'SUBSCRIPTION_ACTIVATED')).source?.kind).toBe('VERIFIED_COMMERCIAL_PAYMENT_AND_ACTIVE_SUBSCRIPTION');
    await followups.wake(plan.id); expect((await SalesFollowUp.findById(plan.id))?.reasonCode).toBe('FOLLOWUP_PAYMENT_VERIFIED'); expect(send).not.toHaveBeenCalled();
  });
  it('retains only hashed subscription correlation after a verified failure webhook, rejecting unsigned injection', async () => {
    const previousKey = integrationConfig.paystack.secretKey; integrationConfig.paystack.secretKey = 'controlled-followup-webhook-signature';
    try {
      const raw = Buffer.from(JSON.stringify({ event: 'invoice.payment_failed', data: { id: 'controlled-event', subscription: { subscription_code: 'SUB_controlled-private-code' }, customer: { email: 'must-not-retain@example.test' } } }));
      await expect(IntegrationService.handleWebhook('PAYSTACK', raw, 'bad-signature')).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_SIGNATURE' }); expect(await WebhookEvent.countDocuments()).toBe(0);
      const signature = createHmac('sha512', integrationConfig.paystack.secretKey).update(raw).digest('hex');
      const event = await IntegrationService.handleWebhook('PAYSTACK', raw, signature);
      expect(event.status).toBe('PROCESSED'); expect(event.payload.data.salesSubscriptionHash).toBe(hashPayload(Buffer.from('SUB_controlled-private-code')));
      expect(JSON.stringify(event.payload)).not.toContain('SUB_controlled-private-code'); expect(JSON.stringify(event.payload)).not.toContain('must-not-retain');
      await IntegrationService.handleWebhook('PAYSTACK', raw, signature); expect(await WebhookEvent.countDocuments()).toBe(1);
    } finally { integrationConfig.paystack.secretKey = previousKey; }
  });

  it('uses qualified/uncontacted evidence until an actual contact attempt is recorded', async () => {
    expect((await followUpEvidence(leadId, 'QUALIFIED_NOT_CONTACTED')).source?.kind).toBe('CRM_CURRENT_STATE_NO_RECORDED_CONTACT');
    const plan = await enroll(); await wake(plan.id); const message = (await SalesMessage.findOne())!;
    expect((await followUpEvidence(leadId, 'QUALIFIED_NOT_CONTACTED')).source).toBeDefined();
    await sendReviewed(String(message._id)); expect((await followUpEvidence(leadId, 'QUALIFIED_NOT_CONTACTED')).source).toBeUndefined();
    await SalesLead.updateOne({ _id: leadId }, { $set: { leadStatus: 'Nurture' } }); await followups.wake(plan.id); expect((await SalesFollowUp.findById(plan.id))?.steps[0]?.status).toBe('ACCEPTED');
  });
  it('escalates an uncertain attempt without replaying its source through a new policy', async () => {
    const plan = await enroll(); await wake(plan.id); const message = (await SalesMessage.findOne())!;
    send.mockRejectedValueOnce(new Error('Controlled ambiguous transport timeout'));
    await sendReviewed(String(message._id)); expect((await SalesMessage.findById(message._id))?.status).toBe('UNCERTAIN');
    await followups.wake(plan.id); expect((await SalesFollowUp.findById(plan.id))?.reasonCode).toBe('MESSAGE_OUTCOME_UNCERTAIN_NO_RESEND');
    await expect(control(plan.id, 'RESUME')).rejects.toMatchObject({ code: 'FOLLOWUP_MANUAL_RESOLUTION_REQUIRED' });
    await followups.wake(plan.id); await expect(enroll(await policy())).rejects.toMatchObject({ code: 'FOLLOWUP_ALREADY_RECORDED' }); expect(send).toHaveBeenCalledTimes(1); expect(await SalesMessage.countDocuments()).toBe(1);
  });
  it('periodically reviews paused sequences, so silence cannot keep expired source histories active forever', async () => {
    const plan = await enroll(); await control(plan.id, 'PAUSE'); advance(24*8);
    const cycleKey = String(Math.floor(Date.now()/900000)); await followups.scan({ cycleKey, phase: 'PLANS' });
    expect(await Job.exists({ dedupeKey: 'sales-followup-wake:' + plan.id + ':scan:' + cycleKey })).toBeTruthy();
    await followups.wake(plan.id); expect((await SalesFollowUp.findById(plan.id))?.status).toBe('STOPPED'); expect(send).not.toHaveBeenCalled();
  });

  it('hides governed message, conversation and timeline evidence from otherwise authorized delegates without follow-up scope', async () => {
    const plan = await enroll(); await wake(plan.id); const message = (await SalesMessage.findOne())!; await sendReviewed(String(message._id));
    await SalesLead.updateOne({ _id: leadId }, { $set: { assignedTo: admin.userId } });
    const permissions = ['sales.leads.read', 'sales.notes.read', 'sales.meetings.read', 'sales.outreach.read'];
    const delegate: AuthenticatedUser = { ...admin, isPlatformAdmin: false, memberships: [{ organizationId: new Types.ObjectId(), roleIds: [], roles: ['PROPERTY_MANAGER'], permissions, scope: { allProperties: true, propertyIds: [], buildingIds: [], unitIds: [] } }] };
    expect((await outreach.list(delegate, leadId, {})).items).toHaveLength(0); expect((await outreach.conversations(delegate, leadId, {})).items).toHaveLength(0);
    await expect(outreach.view(delegate, leadId, String(message._id))).rejects.toMatchObject({ code: 'SALES_PERMISSION_REQUIRED' });
    expect((await SalesSuccessService.view(delegate, leadId)).timeline).toHaveLength(0); expect((await SalesHistoryService.page(delegate, leadId, { kind: 'ACTIVITIES' })).items).toHaveLength(0);
    permissions.push('sales.followups.read'); expect((await outreach.list(delegate, leadId, {})).items).toHaveLength(1); expect((await outreach.conversations(delegate, leadId, {})).items).toHaveLength(1);
    await linked(); expect((await outreach.list(delegate, leadId, {})).items).toHaveLength(0); await expect(followups.list(delegate, leadId, {})).rejects.toMatchObject({ code: 'SALES_PERMISSION_REQUIRED' });
  });

  it('does not allow a changed email subject to disguise repeated follow-up content', async () => {
    const campaign = (await SalesCampaign.findById(campaignId))!; campaign.channel = 'EMAIL'; campaign.approvedHash = payloadHash(campaignPayload(campaign)); await campaign.save();
    await expect(policy('HUMAN_TEMPLATE', { templates: [{ subject: 'First subject', body: 'The exact same requested message.' }, { subject: 'Changed subject', body: 'The exact same requested message.' }] })).rejects.toMatchObject({ code: 'FOLLOWUP_REPEATED_TEMPLATE' });
  });

  it('allows a canonical customer reviewer to cancel an old merged sequence without resuming its source', async () => {
    const plan = await enroll(); const current = await SalesLead.create({ reference: 'CURRENT-CANONICAL', name: 'Canonical Owner', phone: '+254700006004', email: 'canonical@example.test', properties: 1, units: '40', challenge: 'Merged owner record', source: 'Manual', mergedLeadIds: [leadId] });
    await SalesLead.updateOne({ _id: leadId }, { $set: { mergedInto: current._id } });
    expect((await followups.list(admin, String(current._id), {})).items).toHaveLength(1);
    const initial = (await SalesFollowUp.findById(plan.id))!;
    await followups.control(admin, String(current._id), plan.id, { revision: initial.revision, action: 'CANCEL', context: 'Review the canonical customer and cancel the obsolete merged sequence.' });
    expect((await SalesFollowUp.findById(plan.id))?.status).toBe('CANCELLED'); expect(send).not.toHaveBeenCalled();
  });

  it('can resume a manually escalated unattempted draft only through fresh message review', async () => {
    const plan = await enroll(); await wake(plan.id); const message = (await SalesMessage.findOne())!;
    await control(plan.id, 'ESCALATE'); expect((await SalesMessage.findById(message._id))?.status).toBe('PAUSED');
    await control(plan.id, 'RESUME'); advance(1/60); expect(send).not.toHaveBeenCalled(); await review(String(message._id), 'RESUME'); await outreach.deliverNotification((await SalesMessage.findById(message._id))!.notificationId!); expect(send).toHaveBeenCalledTimes(1);
  });

});
