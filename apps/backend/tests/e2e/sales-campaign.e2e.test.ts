import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { SalesCampaignService as service, campaignPayload, trackingDigest } from '../../src/modules/sales/sales-campaign.service.js';
import { SalesAttributionService } from '../../src/modules/sales/sales-attribution.service.js';
import { AcquisitionService } from '../../src/modules/sales/acquisition.service.js';
import { payloadHash } from '../../src/modules/sales/sales-agent.service.js';
import { salesTransaction } from '../../src/modules/sales/sales-agent.repository.js';
import { User } from '../../src/database/models/User.js';
import { Role } from '../../src/database/models/Role.js';
import { Organization } from '../../src/database/models/Organization.js';
import { OrganizationMembership } from '../../src/database/models/OrganizationMembership.js';
import { SalesLead } from '../../src/database/models/SalesLead.js';
import { SalesCampaign, SalesTrackingLink, SalesAttribution } from '../../src/database/models/SalesCampaign.js';
import { AcquisitionJourney } from '../../src/database/models/AcquisitionJourney.js';
import { PlatformSwitch } from '../../src/database/models/PlatformSwitch.js';
import { SubscriptionPlan } from '../../src/database/models/SubscriptionPlan.js';
import { OrganizationSubscription } from '../../src/database/models/OrganizationSubscription.js';
import { OrganizationContract } from '../../src/database/models/OrganizationContract.js';
import { SubscriptionInvoice } from '../../src/database/models/SubscriptionInvoice.js';
import { completedAdminFixture } from '../helpers/admin-assurance.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

describe.skipIf(!process.env.RUN_E2E)('Governed sales campaigns and consented referral attribution', () => {
  let mongo: MongoMemoryReplSet, admin: AuthenticatedUser, token: string, leadId: Types.ObjectId;
  const app = createApp();
  const input = () => ({ name: 'Owner migration campaign', description: 'Reviewed small owner migration campaign', audience: 'Owners with existing rental inventory', market: 'Kenya', channel: 'EMAIL', startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString(), messaging: 'Explore published Dapinni plans and arrange a demonstration.', selectionCriteria: 'Manually reviewed owners who requested information', dailySendLimit: 10, perContactLimit: 2, followUpDays: [3, 7], budgetMicroUsd: 100000, attributionDays: 30 });
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : {} });
    await mongoose.connect(mongo.getUri());
    for (const model of [User, Role, Organization, OrganizationMembership, SalesLead, SalesCampaign, SalesTrackingLink, SalesAttribution, AcquisitionJourney, PlatformSwitch]) await model.init();
  }, 180000);
  afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
  beforeEach(async () => {
    for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({});
    const user = await User.create({ phone: '+254700006001', email: 'campaign-admin@example.test', firstName: 'Campaign', lastName: 'Admin', isPlatformAdmin: true });
    token = await completedAdminFixture(user._id);
    admin = { userId: user._id, isPlatformAdmin: true, sessionId: new Types.ObjectId(), mfaVerifiedAt: new Date(), adminDualChannel: true, memberships: [] };
    leadId = (await SalesLead.create({ reference: 'CAMPAIGN-LEAD', name: 'Intended Owner', email: 'owner@example.test', properties: 2, units: '40', challenge: 'Needs migration assistance', source: 'Manual', consent: 'UNKNOWN' }))._id;
    for (const key of ['SALES_CAMPAIGNS', 'SALES_TRACKING', 'SALES_ATTRIBUTION']) await PlatformSwitch.create({ key, kind: 'FEATURE', name: key, description: 'Isolated test policy', enabled: true, mode: 'ON' });
  });
  async function active() {
    let c = await service.create(admin, input());
    c = await service.command(admin, String(c._id), { revision: c.revision, action: 'SUBMIT', reason: 'Review complete campaign limits' });
    c = await service.command(admin, String(c._id), { revision: c.revision, action: 'APPROVE', payloadHash: c.payloadHash, reason: 'Approve the exact reviewed campaign' });
    return service.command(admin, String(c._id), { revision: c.revision, action: 'ACTIVATE', reason: 'Begin approved campaign schedule' });
  }
  async function link(campaignId: Types.ObjectId) { return service.createLink(admin, String(campaignId), { leadId: String(leadId), destination: 'PLANS', expiresAt: new Date(Date.now() + 3600000).toISOString() }); }
  async function register(journeyToken: string, email = 'owner@example.test', linked = true) {
    const owner = await User.create({ phone: '+254700006002', email, firstName: 'Actual', lastName: 'Registrant', emailVerifiedAt: new Date() });
    const org = await Organization.create({ name: 'Registered Portfolio', slug: 'campaign-portfolio', onboarding: { ownerUserId: owner._id, unitCount: 40 } });
    const role = await Role.create({ key: 'LANDLORD', name: 'Landlord', system: true, organizationId: null, permissions: [] });
    await OrganizationMembership.create({ organizationId: org._id, userId: owner._id, roleIds: [role._id], scope: { allProperties: true }, status: 'ACTIVE' });
    if (linked) await SalesLead.updateOne({ _id: leadId }, { $set: { organizationId: org._id, identityState: 'LINKED' } });
    await salesTransaction(session => AcquisitionService.bindSignup({ journeyToken, source: 'OUTREACH', recoveryEmailOptIn: false }, org._id, session));
    return { org, owner };
  }
  it('requires exact approval, recent proof, legal transitions and optimistic revisions', async () => {
    const c = await service.create(admin, input());
    await expect(service.command(admin, String(c._id), { action: 'ACTIVATE', revision: 0, reason: 'Attempt approval bypass directly' })).rejects.toMatchObject({ code: 'INVALID_CAMPAIGN_TRANSITION' });
    const pending = await service.command(admin, String(c._id), { action: 'SUBMIT', revision: 0, reason: 'Submit for bounded campaign review' });
    await expect(service.command({ ...admin, adminDualChannel: false }, String(c._id), { action: 'APPROVE', revision: 1, payloadHash: pending.payloadHash, reason: 'Stale proof must fail approval' })).rejects.toMatchObject({ code: 'FRESH_AUTH_REQUIRED' });
    await expect(service.command(admin, String(c._id), { action: 'APPROVE', revision: 1, payloadHash: 'a'.repeat(64), reason: 'Wrong payload must fail review' })).rejects.toMatchObject({ code: 'CAMPAIGN_CHANGED' });
    await SalesCampaign.updateOne({ _id: c._id }, { $set: { dailySendLimit: 999 } });
    await expect(service.command(admin, String(c._id), { action: 'APPROVE', revision: 1, payloadHash: pending.payloadHash, reason: 'Tampered payload cannot be approved' })).rejects.toMatchObject({ code: 'CAMPAIGN_CHANGED' });
    await expect(service.command(admin, String(c._id), { action: 'CANCEL', revision: 0, reason: 'Stale revision cannot overwrite review' })).rejects.toMatchObject({ code: 'CAMPAIGN_CHANGED' });
  });
  it('resolves without tracking, requires explicit consent, hashes secrets and bounds repeated touches', async () => {
    const c = await active(), l = await link(c._id), opaque = l.href.split('/').at(-1)!;
    expect(opaque).toMatch(/^[\w-]{43}$/); expect(l.href).not.toContain('owner');
    expect(await service.resolve({ token: opaque })).toMatchObject({ destination: '/plans?source=OUTREACH' });
    expect(await AcquisitionJourney.countDocuments()).toBe(0);
    await expect(service.visit({ token: opaque, consent: false })).rejects.toThrow();
    const visit = await service.visit({ token: opaque, consent: true });
    await service.visit({ token: opaque, consent: true, journeyToken: visit.journeyToken });
    const journey = await AcquisitionJourney.findOne().lean();
    expect(journey?.salesTouches).toHaveLength(1); expect(journey?.salesTrackingConsentAt).toBeInstanceOf(Date);
    expect(await SalesTrackingLink.findById(l.id).lean()).not.toHaveProperty('tokenHash');
    expect((await SalesTrackingLink.findById(l.id).select('+tokenHash'))?.tokenHash).toBe(trackingDigest(opaque));
    const listed = await service.links(admin, String(c._id), {}); expect(listed.items[0]).not.toHaveProperty('tokenHash');
  });
  it('edits only the current draft and clears stale review evidence', async () => {
    const c = await service.create(admin, input());
    const edited = await service.update(admin, String(c._id), { revision: 0, campaign: { ...input(), name: 'Revised owner campaign' } });
    expect(edited).toMatchObject({ revision: 1, name: 'Revised owner campaign' });
    await expect(service.update(admin, String(c._id), { revision: 0, campaign: input() })).rejects.toMatchObject({ code: 'CAMPAIGN_CHANGED' });
    await service.command(admin, String(c._id), { action: 'SUBMIT', revision: 1, reason: 'Submit edited bounded campaign' });
    await expect(service.update(admin, String(c._id), { revision: 2, campaign: input() })).rejects.toMatchObject({ code: 'CAMPAIGN_CHANGED' });
  });
  it('suppresses opted-out customers, paused campaigns and revoked or expired links', async () => {
    const c = await active(), l = await link(c._id), opaque = l.href.split('/').at(-1)!;
    await SalesLead.updateOne({ _id: leadId }, { $set: { optedOutAt: new Date(), consent: 'UNKNOWN' } });
    await expect(link(c._id)).rejects.toMatchObject({ code: 'CONTACT_SUPPRESSED' });
    await expect(service.resolve({ token: opaque })).rejects.toMatchObject({ code: 'SALES_LINK_UNAVAILABLE' });
    await SalesLead.updateOne({ _id: leadId }, { $unset: { optedOutAt: 1 } });
    await service.command(admin, String(c._id), { revision: c.revision, action: 'PAUSE', reason: 'Emergency pause campaign invitations' });
    await expect(service.visit({ token: opaque, consent: true })).rejects.toMatchObject({ code: 'SALES_LINK_UNAVAILABLE' });
    await SalesCampaign.updateOne({ _id: c._id }, { $set: { status: 'ACTIVE' } });
    await service.revokeLink(admin, l.id);
    await expect(service.resolve({ token: opaque })).rejects.toMatchObject({ code: 'SALES_LINK_UNAVAILABLE' });
    const expired = await link(c._id); await SalesTrackingLink.updateOne({ _id: expired.id }, { $set: { expiresAt: new Date(0) } });
    await expect(service.resolve({ token: expired.href.split('/').at(-1) })).rejects.toMatchObject({ code: 'SALES_LINK_UNAVAILABLE' });
  });
  it('attributes first and last campaign touches only to verified linked registration and deduplicates replay', async () => {
    const first = await active(), l1 = await link(first._id), v1 = await service.visit({ token: l1.href.split('/').at(-1), consent: true });
    const last = await active(), l2 = await link(last._id);
    const v2 = await service.visit({ token: l2.href.split('/').at(-1), consent: true, journeyToken: v1.journeyToken });
    const sameMillisecond = new Date();
    await AcquisitionJourney.updateOne({}, { $set: { 'salesTouches.0.at': sameMillisecond, 'salesTouches.0.lastAt': sameMillisecond, 'salesTouches.1.at': sameMillisecond, 'salesTouches.1.lastAt': sameMillisecond } });
    const { org, owner } = await register(v2.journeyToken!, 'owner@example.test', false);
    await SalesAttributionService.project(org._id); expect(await SalesAttribution.countDocuments()).toBe(0);
    await SalesLead.updateOne({ _id: leadId }, { $set: { organizationId: org._id, identityState: 'LINKED' } });
    await User.updateOne({ _id: owner._id }, { $unset: { emailVerifiedAt: 1 } });
    await SalesAttributionService.project(org._id); expect(await SalesAttribution.countDocuments()).toBe(0);
    await User.updateOne({ _id: owner._id }, { $set: { emailVerifiedAt: new Date() } });
    await SalesAttributionService.project(org._id); await SalesAttributionService.project(org._id);
    expect(await SalesAttribution.findOne({ organizationId: org._id }).lean()).toMatchObject({ milestone: 'REGISTERED', status: 'ATTRIBUTED', firstCampaignId: first._id, lastCampaignId: last._id, referralCampaignId: last._id });
    expect(await SalesAttribution.countDocuments()).toBe(1);
    expect(await SalesAttribution.countDocuments({ milestone: 'PAYMENT_VERIFIED' })).toBe(0);
  });
  it('never treats forwarded links or checkout initialization as verified paid conversion', async () => {
    const c = await active(), l = await link(c._id), v = await service.visit({ token: l.href.split('/').at(-1), consent: true });
    const { org } = await register(v.journeyToken!, 'someone-else@example.test');
    // Explicit link cannot override a verified owner/contact mismatch, even after manual organization assignment.
    expect(await SalesAttributionService.project(org._id)).toMatchObject({ status: 'UNATTRIBUTED' });
    expect((await SalesAttribution.findOne())?.reason).toBe('REFERRAL_CONTACT_MISMATCH');
    await SalesLead.updateOne({ _id: leadId }, { $set: { email: 'someone-else@example.test' } });
    const plan = await SubscriptionPlan.create({ key: 'CONTROL', name: 'Control', currency: 'KES', amount: 10000, billingInterval: 'MONTH', active: true });
    await OrganizationSubscription.create({ organizationId: org._id, planId: plan._id, currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 86400000), providerCheckoutReference: 'not-payment-proof', createdBy: admin.userId, updatedBy: admin.userId });
    await SalesAttributionService.project(org._id);
    expect(await SalesAttribution.countDocuments({ milestone: 'CHECKOUT_STARTED' })).toBe(1);
    expect(await SalesAttribution.countDocuments({ milestone: 'PAYMENT_VERIFIED' })).toBe(0);
  });
  it('expires attribution windows, preserves unattributed cohorts and ignores disabled collection', async () => {
    const c = await active(), l = await link(c._id), v = await service.visit({ token: l.href.split('/').at(-1), consent: true });
    await AcquisitionJourney.updateOne({}, { $set: { 'salesTouches.0.at': new Date(Date.now() - 31 * 86400000), 'salesTouches.0.lastAt': new Date(Date.now() - 31 * 86400000) } });
    const { org } = await register(v.journeyToken!);
    await SalesAttributionService.project(org._id);
    expect(await SalesAttribution.findOne({ organizationId: org._id }).lean()).toMatchObject({ status: 'UNATTRIBUTED', reason: 'NO_ELIGIBLE_TOUCH' });
    await AcquisitionJourney.updateOne({}, { $set: { 'salesTouches.0.at': new Date() } });
    await SalesAttributionService.project(org._id);
    expect((await SalesAttribution.findOne({ organizationId: org._id }))?.status).toBe('UNATTRIBUTED');
    await PlatformSwitch.updateOne({ key: 'SALES_TRACKING' }, { $set: { mode: 'OFF', enabled: false } });
    await expect(service.visit({ token: l.href.split('/').at(-1), consent: true })).rejects.toMatchObject({ code: 'SERVICE_DISABLED' });
  });
  it('counts an actual verified subscription once while leaving financial records untouched', async () => {
    const c = await active(), l = await link(c._id), v = await service.visit({ token: l.href.split('/').at(-1), consent: true });
    const { org } = await register(v.journeyToken!);
    const plan = await SubscriptionPlan.create({ key: 'CONTROL', name: 'Control', currency: 'KES', amount: 10000, billingInterval: 'MONTH', active: true });
    const sub = await OrganizationSubscription.create({ organizationId: org._id, planId: plan._id, status: 'ACTIVE', currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 86400000), createdBy: admin.userId, updatedBy: admin.userId });
    const contract = await OrganizationContract.create({ organizationId: org._id, generation: 1, templateVersionId: new Types.ObjectId(), templateId: 'controlled-test', templateVersion: 1, templateHash: 'h', templateName: 'Test agreement', body: 'Controlled signed agreement evidence', sha256: 'h', snapshot: {}, status: 'SIGNED', documentId: new Types.ObjectId(), createdBy: admin.userId });
    const invoice = await SubscriptionInvoice.create({ organizationId: org._id, subscriptionId: sub._id, contractId: contract._id, invoiceNumber: 'CONTROLLED-1', periodStart: new Date(), periodEnd: new Date(Date.now() + 86400000), subtotal: 10000, total: 10000, amountPaid: 10000, currency: 'KES', dueDate: new Date(), paidAt: new Date(), status: 'PAID', provider: 'PAYSTACK', providerInvoiceId: 'isolated-verified-provider-record', createdBy: admin.userId, updatedBy: admin.userId });
    await Organization.updateOne({ _id: org._id }, { $set: { 'onboarding.invoiceId': invoice._id, 'onboarding.contractId': contract._id, 'onboarding.paymentVerifiedAt': new Date() } });
    const before = await SubscriptionInvoice.findById(invoice._id).lean();
    await SalesAttributionService.project(org._id); await SalesAttributionService.project(org._id);
    expect(await SalesAttribution.countDocuments({ organizationId: org._id, milestone: 'PAYMENT_VERIFIED' })).toBe(1);
    expect(await SalesAttribution.findOne({ organizationId: org._id, milestone: 'PAYMENT_VERIFIED' }).lean()).toMatchObject({ invoiceId: invoice._id, contractId: contract._id, subscriptionId: sub._id });
    expect(await SalesAttribution.countDocuments({ organizationId: org._id, milestone: 'SUBSCRIPTION_ACTIVATED' })).toBe(1);
    expect(await SubscriptionInvoice.findById(invoice._id).lean()).toEqual(before);
  });
  it('rejects unauthenticated and non-admin HTTP access, arbitrary redirects and malformed policies', async () => {
    expect((await request(app).get('/api/v1/sales/success/campaigns')).status).toBe(401);
    expect((await request(app).post('/api/v1/sales/success/campaigns').auth(token, { type: 'bearer' }).send({ ...input(), followUpDays: [7, 3] })).status).toBe(400);
    await expect(service.list({ ...admin, isPlatformAdmin: false }, {})).rejects.toMatchObject({ code: 'PLATFORM_ADMIN_REQUIRED' });
    await expect(service.createLink(admin, String(new Types.ObjectId()), { leadId: String(leadId), destination: 'https://evil.example', expiresAt: new Date().toISOString() })).rejects.toThrow();
    const record = await SalesCampaign.create({ ...input(), ownerId: admin.userId });
    expect(payloadHash(campaignPayload(record))).toHaveLength(64);
  });
});
