import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { User } from '../../src/database/models/User.js';
import { Organization } from '../../src/database/models/Organization.js';
import { SalesLead } from '../../src/database/models/SalesLead.js';
import { SalesAgent, SalesAgentApproval, SalesAgentRun } from '../../src/database/models/SalesAgent.js';
import { PlatformSwitch } from '../../src/database/models/PlatformSwitch.js';
import { PropertyOnboardingRequest } from '../../src/database/models/PropertyOnboardingRequest.js';
import { SalesActivity } from '../../src/database/models/SalesActivity.js';
import { AuditLog } from '../../src/database/models/AuditLog.js';
import { Job } from '../../src/database/models/Job.js';
import { SalesAgentService } from '../../src/modules/sales/sales-agent.service.js';
import { SalesAssistanceService } from '../../src/modules/sales/sales-assistance.service.js';
import { setSalesModelTestProvider } from '../../src/integrations/ai/sales-model.provider.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';
import { completedAdminFixture } from '../helpers/admin-assurance.js';

describe.skipIf(!process.env.RUN_E2E)('Reviewed onboarding assistance execution', () => {
  let mongo: MongoMemoryReplSet, admin: AuthenticatedUser, leadId: string, token: string;
  const app = createApp();
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : {} });
    await mongoose.connect(mongo.getUri());
    for (const model of [User, Organization, SalesLead, SalesAgent, SalesAgentRun, SalesAgentApproval, PlatformSwitch, PropertyOnboardingRequest, SalesActivity, AuditLog, Job]) await model.init();
  }, 180000);
  afterAll(async () => { setSalesModelTestProvider(); await mongoose.disconnect(); await mongo?.stop(); });
  beforeEach(async () => {
    for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
    const user = await User.create({ phone: '+254700009101', email: 'assistance-admin@example.test', firstName: 'Support', lastName: 'Admin', isPlatformAdmin: true });
    token = await completedAdminFixture(user._id);
    admin = { userId: user._id, isPlatformAdmin: true, sessionId: new Types.ObjectId(), adminDualChannel: true, mfaVerifiedAt: new Date(), memberships: [] };
    const org = await Organization.create({ name: 'Assistance organization', slug: 'assistance-organization' });
    const lead = await SalesLead.create({ reference: 'ASSIST-1', name: 'Migration Owner', email: 'owner@example.test', properties: 2, units: '40', challenge: 'Needs migration help', source: 'Manual', organizationId: org._id }); leadId = String(lead._id);
    for (const key of ['SALES_AI_RUNTIME', 'SALES_AGENT_ONBOARDING_SUCCESS', 'SALES_APPROVALS', 'SALES_ASSISTANCE']) await PlatformSwitch.create({ key, kind: 'FEATURE', name: key, description: 'Controlled assistance test', enabled: true, mode: 'ON' });
    await SalesAgentService.configure(admin, 'ONBOARDING_SUCCESS', { revision: 0, enabled: true, paused: false, maxDailyRuns: 20, maxOutputTokens: 1500, maxDailyTokens: 1000000, dailyBudgetMicroUsd: 0 });
    setSalesModelTestProvider({ configured: () => true, generate: async () => ({ output: { summary: 'Inventory needs setup', evidence: ['No properties in current organization'], confidence: 'HIGH', limitation: 'Customer availability unconfirmed', action: { tool: 'ASSISTANCE_PROPOSAL', reason: 'Offer guided setup', text: 'Review the existing inventory and guide the owner through property setup.', subject: null, sourceUrls: [] } }, requestId: randomUUID(), model: 'fixture', inputTokens: 100, outputTokens: 80 }) });
  });
  async function proposal() {
    const run = await SalesAgentService.create(admin, { agent: 'ONBOARDING_SUCCESS', leadId, objective: 'Review current onboarding gaps', commandId: randomUUID() });
    await SalesAgentService.execute(run.id);
    const approval = await SalesAgentApproval.findOne({ runId: run.id });
    if (!approval) throw new Error('Expected actual model proposal');
    return approval;
  }
  async function open() {
    const approval = await proposal();
    await SalesAgentService.decide(admin, String(approval._id), { decision: 'APPROVE', payloadHash: approval.payloadHash, reason: 'Reviewed actual onboarding evidence and guidance' });
    const item = await PropertyOnboardingRequest.findOne({ approvalId: approval._id });
    if (!item) throw new Error('Expected internal assistance request');
    return { item, approval };
  }
  const reason = 'Reviewed current customer assistance progress';
  it('executes a reviewed proposal once and records internal assistance without financial changes', async () => {
    const before = await Organization.findOne().lean();
    const { item, approval } = await open();
    expect(item).toMatchObject({ source: 'INTERNAL_ASSISTANCE', status: 'REQUESTED', assignedTo: admin.userId, properties: [] });
    expect(item.guidance).toContain('guide the owner');
    expect((await SalesAgentApproval.findById(approval._id))?.result).toMatchObject({ internalAssistanceOpened: true, customerContacted: false });
    await expect(SalesAgentService.decide(admin, String(approval._id), { decision: 'APPROVE', payloadHash: approval.payloadHash, reason })).rejects.toMatchObject({ code: 'APPROVAL_CHANGED' });
    expect(await PropertyOnboardingRequest.countDocuments()).toBe(1);
    expect(await Organization.findOne().lean()).toEqual(before);
    expect(await AuditLog.countDocuments({ action: 'sales.assistance.opened' })).toBe(1);
  });
  it('schedules, starts and completes with optimistic revision and outcome evidence', async () => {
    const { item } = await open(), id = String(item._id);
    await SalesAssistanceService.control(admin, leadId, id, { action: 'SCHEDULE', preferredDate: new Date(Date.now() + 86400000).toISOString(), revision: 0, reason });
    await expect(SalesAssistanceService.control(admin, leadId, id, { action: 'START', revision: 0, reason })).rejects.toMatchObject({ code: 'ASSISTANCE_CHANGED' });
    await SalesAssistanceService.control(admin, leadId, id, { action: 'START', revision: 1, reason });
    await SalesAssistanceService.control(admin, leadId, id, { action: 'COMPLETE', revision: 2, reason: 'Guided the owner through the documented inventory setup steps.' });
    expect(await PropertyOnboardingRequest.findById(id)).toMatchObject({ status: 'COMPLETED', revision: 3 });
    await expect(SalesAssistanceService.control(admin, leadId, id, { action: 'START', revision: 3, reason })).rejects.toMatchObject({ code: 'ASSISTANCE_TERMINAL' });
  });
  it('rejects altered approval, stale assurance, disabled assistance and changed organization', async () => {
    const approval = await proposal(), input = { decision: 'APPROVE', payloadHash: approval.payloadHash, reason };
    await expect(SalesAgentService.decide(admin, String(approval._id), { ...input, payloadHash: '0'.repeat(64) })).rejects.toMatchObject({ code: 'APPROVAL_CHANGED' });
    await expect(SalesAgentService.decide({ ...admin, mfaVerifiedAt: new Date(0) }, String(approval._id), input)).rejects.toMatchObject({ statusCode: 403 });
    await PlatformSwitch.updateOne({ key: 'SALES_ASSISTANCE' }, { $set: { mode: 'OFF', enabled: false } });
    await expect(SalesAgentService.decide(admin, String(approval._id), input)).rejects.toMatchObject({ code: 'SERVICE_DISABLED' });
    await PlatformSwitch.updateOne({ key: 'SALES_ASSISTANCE' }, { $set: { mode: 'ON', enabled: true } });
    await SalesLead.updateOne({ _id: leadId }, { $set: { organizationId: new Types.ObjectId() } });
    await expect(SalesAgentService.decide(admin, String(approval._id), input)).rejects.toMatchObject({ code: 'ASSISTANCE_ORGANIZATION_CHANGED' });
    expect(await PropertyOnboardingRequest.countDocuments()).toBe(0);
  });
  it('enforces current assigned-customer scope and case ownership for delegated staff', async () => {
    const { item } = await open();
    const member = { organizationId: new Types.ObjectId(), role: 'PROPERTY_MANAGER', permissions: ['sales.onboarding.read', 'sales.notes.read', 'sales.assistance.manage'], scope: { allProperties: true, propertyIds: [], buildingIds: [] } };
    const staff = { ...admin, userId: new Types.ObjectId(), isPlatformAdmin: false, memberships: [member] } as AuthenticatedUser;
    await expect(SalesAssistanceService.list(staff, leadId, {})).rejects.toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
    await SalesLead.updateOne({ _id: leadId }, { $set: { assignedTo: staff.userId } });
    expect((await SalesAssistanceService.list(staff, leadId, {})).total).toBe(1);
    await expect(SalesAssistanceService.control(staff, leadId, String(item._id), { action: 'START', revision: 0, reason })).rejects.toMatchObject({ code: 'ASSISTANCE_NOT_ASSIGNED' });
    await PropertyOnboardingRequest.updateOne({ _id: item._id }, { $set: { assignedTo: staff.userId } });
    await SalesAssistanceService.control(staff, leadId, String(item._id), { action: 'START', revision: 0, reason });
    await expect(SalesAssistanceService.control(staff, leadId, String(item._id), { action: 'ASSIGN', assignedTo: String(admin.userId), revision: 1, reason })).rejects.toMatchObject({ code: 'PLATFORM_ADMIN_REQUIRED' });
  });
  it('rejects cross-organization requests, invalid transitions and invalid scheduling', async () => {
    const { item } = await open();
    const other = await PropertyOnboardingRequest.create({ organizationId: new Types.ObjectId(), requestedBy: admin.userId });
    await expect(SalesAssistanceService.control(admin, leadId, String(other._id), { action: 'START', revision: 0, reason })).rejects.toMatchObject({ code: 'ASSISTANCE_CHANGED' });
    await expect(SalesAssistanceService.control(admin, leadId, String(item._id), { action: 'COMPLETE', revision: 0, reason })).rejects.toMatchObject({ code: 'ASSISTANCE_TRANSITION_INVALID' });
    await expect(SalesAssistanceService.control(admin, leadId, String(item._id), { action: 'SCHEDULE', preferredDate: new Date(0).toISOString(), revision: 0, reason })).rejects.toMatchObject({ code: 'ASSISTANCE_DATE_INVALID' });
    await SalesAssistanceService.control(admin, leadId, String(item._id), { action: 'CANCEL', revision: 0, reason });
    expect((await SalesAssistanceService.list(admin, leadId, {})).total).toBe(1);
  });
  it('protects HTTP routes and returns scoped records to an authenticated administrator', async () => {
    await open();
    await request(app).get('/api/v1/sales/success/customers/' + leadId + '/assistance').expect(401);
    await request(app).get('/api/v1/sales/success/customers/' + leadId + '/assistance').set('Authorization', 'Bearer ' + token).expect(200);
    await request(app).get('/api/v1/sales/success/customers/' + leadId + '/assistance?page=0').set('Authorization', 'Bearer ' + token).expect(400);
  });
});
