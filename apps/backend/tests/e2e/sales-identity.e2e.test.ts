import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { User } from '../../src/database/models/User.js';
import { Role } from '../../src/database/models/Role.js';
import { OrganizationMembership } from '../../src/database/models/OrganizationMembership.js';
import { Organization } from '../../src/database/models/Organization.js';
import { SalesLead } from '../../src/database/models/SalesLead.js';
import { SalesActivity } from '../../src/database/models/SalesActivity.js';
import { SalesMeeting } from '../../src/database/models/SalesMeeting.js';
import { SalesIdentityMatch, SalesMergeRequest, SalesProjectionCheckpoint } from '../../src/database/models/SalesIdentity.js';
import { DomainEvent } from '../../src/database/models/DomainEvent.js';
import { AuditLog } from '../../src/database/models/AuditLog.js';
import { PlatformSwitch } from '../../src/database/models/PlatformSwitch.js';
import { Job } from '../../src/database/models/Job.js';
import { Property } from '../../src/database/models/Property.js';
import { Building } from '../../src/database/models/Building.js';
import { Floor } from '../../src/database/models/Floor.js';
import { Unit } from '../../src/database/models/Unit.js';
import { SalesSuccessService } from '../../src/modules/sales/sales-success.service.js';
import { SalesIdentityService as identity } from '../../src/modules/sales/sales-identity.service.js';
import { SalesLifecycleService as lifecycle } from '../../src/modules/sales/sales-lifecycle.service.js';
import { SalesHistoryService } from '../../src/modules/sales/sales-history.service.js';
import { salesTransaction } from '../../src/modules/sales/sales-agent.repository.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { completedAdminFixture } from '../helpers/admin-assurance.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';
describe.skipIf(!process.env.RUN_E2E)('Verified sales identity and lifecycle projection', () => {
  let mongo: MongoMemoryReplSet, admin: AuthenticatedUser, org: Types.ObjectId, owner: Types.ObjectId, leadId: string, token: string;
  const app = createApp();
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : {} });
    await mongoose.connect(mongo.getUri());
    for (const model of [User, Role, Organization, OrganizationMembership, SalesLead, SalesActivity, SalesMeeting, SalesIdentityMatch, SalesMergeRequest, SalesProjectionCheckpoint, DomainEvent, AuditLog, PlatformSwitch, Job]) await model.init();
  }, 180000);
  afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
  beforeEach(async () => {
    for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({});
    const adminUser = await User.create({ phone: '+254700004001', email: 'identity-admin@example.test', firstName: 'Identity', lastName: 'Admin', isPlatformAdmin: true });
    token = await completedAdminFixture(adminUser._id);
    admin = { userId: adminUser._id, isPlatformAdmin: true, sessionId: new Types.ObjectId(), mfaVerifiedAt: new Date(), adminDualChannel: true, memberships: [] };
    owner = (await User.create({ phone: '+254700004002', email: 'verified-owner@example.test', firstName: 'Actual', lastName: 'Owner', emailVerifiedAt: new Date() }))._id;
    org = (await Organization.create({ name: 'Registered Customer', slug: 'registered-customer', onboarding: { ownerUserId: owner, unitCount: 100 } }))._id;
    const role = await Role.create({ key: 'LANDLORD', name: 'Landlord', organizationId: null, system: true, permissions: [] });
    await OrganizationMembership.create({ organizationId: org, userId: owner, roleIds: [role._id], scope: { allProperties: true }, status: 'ACTIVE' });
    leadId = (await SalesSuccessService.create(admin, { name: 'Different Customer Name', email: 'verified-owner@example.test', properties: 1, units: '100', challenge: 'Needs assistance with migration', source: 'Referral' })).id;
    for (const key of ['SALES_LIFECYCLE', 'SALES_AUTOLINK']) await PlatformSwitch.create({ key, kind: 'FEATURE', name: key, description: 'Isolated test policy', enabled: key === 'SALES_LIFECYCLE', mode: key === 'SALES_LIFECYCLE' ? 'ON' : 'OFF' });
  });
  const resolve = () => salesTransaction(session => identity.resolve(org, session));
  async function enableAuto() { await PlatformSwitch.updateOne({ key: 'SALES_AUTOLINK' }, { $set: { enabled: true, mode: 'ON' } }); }
  async function link() { await SalesSuccessService.link(admin, leadId, { organizationId: String(org), revision: 0 }); }
  it('suggests verified identity but links only after explicit policy or review, never by name', async () => {
    expect(await resolve()).toMatchObject({ status: 'LINK_PENDING_REVIEW' });
    expect((await SalesLead.findById(leadId))?.organizationId).toBeUndefined();
    await enableAuto(); expect(await resolve()).toMatchObject({ status: 'LINKED' });
    expect(String((await SalesLead.findById(leadId))?.organizationId)).toBe(String(org));
    expect(await AuditLog.countDocuments({ action: 'sales.identity.automatically.linked' })).toBe(1);
    await resolve(); expect(await AuditLog.countDocuments({ action: 'sales.identity.automatically.linked' })).toBe(1);
  });
  it('does not link unverified contacts, ambiguous contacts, revoked owners or conflicting organizations', async () => {
    await enableAuto(); await User.updateOne({ _id: owner }, { $unset: { emailVerifiedAt: 1 } });
    expect(await resolve()).toMatchObject({ status: 'UNLINKED' });
    await User.updateOne({ _id: owner }, { $set: { emailVerifiedAt: new Date() } });
    await SalesLead.create({ reference: 'LEGACY-DUPLICATE', name: 'Legacy duplicate', email: 'verified-owner@example.test', properties: 1, units: '20', challenge: 'Existing legacy customer record' });
    expect(await resolve()).toMatchObject({ status: 'MATCH_SUGGESTED' });
    expect(await SalesLead.countDocuments({ organizationId: org })).toBe(0);
    await OrganizationMembership.updateOne({ userId: owner }, { $set: { status: 'REMOVED' } });
    expect(await resolve()).toMatchObject({ status: 'UNLINKED' });
  });
  it('keeps human rejections and blocks cross-organization identity reassignment', async () => {
    await resolve();
    await identity.review(admin, leadId, { organizationId: String(org), decision: 'REJECT', reason: 'Reviewed identity and rejected association', revision: 0 });
    await enableAuto(); await resolve();
    expect((await SalesIdentityMatch.findOne({ leadId, organizationId: org }))?.status).toBe('LINK_REJECTED');
    expect((await SalesLead.findById(leadId))?.organizationId).toBeUndefined();
    const lead = await SalesLead.findById(leadId);
    if (!lead) throw new Error('Missing customer');
    await SalesSuccessService.link(admin, leadId, { organizationId: String(org), revision: lead.revision });
    const other = await Organization.create({ name: 'Other identity', slug: 'other-identity', onboarding: { ownerUserId: owner } });
    const role = await Role.findOne({ key: 'LANDLORD' });
    await OrganizationMembership.create({ organizationId: other._id, userId: owner, roleIds: [role!._id], scope: { allProperties: true } });
    await salesTransaction(session => identity.resolve(other._id, session));
    expect(String((await SalesLead.findById(leadId))?.organizationId)).toBe(String(org));
    expect((await SalesIdentityMatch.findOne({ leadId, organizationId: other._id }))?.status).toBe('CONFLICT');
  });
  it('projects actual domain/audit evidence idempotently, handles late events and never manufactures payment proof', async () => {
    await link();
    const id = randomUUID();
    await salesTransaction(async session => {
      await AuditService.publish({ organizationId: org, name: 'landlord.signup.created', aggregateType: 'Organization', aggregateId: org, payload: {} }, session);
      await AuditService.record({ organizationId: org, action: 'landlord.payment.pending', resourceType: 'Organization', resourceId: org, metadata: { state: 'PAYMENT_PENDING' } }, session);
    });
    expect(await Job.countDocuments({ type: 'domain-event.sales-lifecycle' })).toBe(1);
    expect(await Job.countDocuments({ type: 'domain-event.sales-audit' })).toBe(1);
    await lifecycle.batch(org);
    const initial = await SalesActivity.countDocuments({ leadId, sourceKey: { $exists: true } });
    await lifecycle.batch(org);
    expect(await SalesActivity.countDocuments({ leadId, sourceKey: { $exists: true } })).toBe(initial);
    expect((await SalesLead.findById(leadId))?.stage).toBe('REGISTERED');
    const old = new Date(Date.now() - 14 * 86400000);
    await DomainEvent.create({ organizationId: org, eventId: id, name: 'organization.activated', aggregateType: 'Organization', aggregateId: org, version: 2, payload: {}, occurredAt: old });
    await lifecycle.batch(org);
    expect(await SalesActivity.countDocuments({ leadId, sourceKey: 'domain:' + id })).toBe(1);
    // A named event alone is not authoritative verification; live billing evidence remains required.
    expect((await SalesLead.findById(leadId))?.stage).toBe('REGISTERED');
    expect(await SalesProjectionCheckpoint.findOne({ organizationId: org }).lean()).toMatchObject({ processedCount: initial + 1 });
    await expect(lifecycle.consume(id, new Types.ObjectId())).rejects.toMatchObject({ code: 'SOURCE_EVENT_NOT_FOUND' });
  });
  it('backfills every inventory page from real records and accounts for building/floor-only progress', async () => {
    await link();
    const old = new Date(Date.now() - 80 * 3600000);
    await Organization.collection.updateOne({ _id: org }, { $set: { createdAt: old, 'onboarding.stateChangedAt': old } });
    const propertyId = new Types.ObjectId(), buildingId = new Types.ObjectId(), floorId = new Types.ObjectId();
    await Property.create({ _id: propertyId, organizationId: org, name: 'Old property', code: 'P', propertyType: 'APARTMENT', address: { addressLine1: '1 Main', city: 'Nairobi', country: 'Kenya' }, createdBy: admin.userId, updatedBy: admin.userId, createdAt: old });
    await Building.create({ _id: buildingId, organizationId: org, propertyId, name: 'Real building', code: 'B', createdBy: admin.userId, updatedBy: admin.userId });
    await Floor.create({ _id: floorId, organizationId: org, propertyId, buildingId, name: 'Real floor', code: 'G', level: 0, createdBy: admin.userId, updatedBy: admin.userId });
    expect(await SalesSuccessService.monitor(admin, leadId)).toMatchObject({ stalled: false, buildings: 1, floors: 1 });
    await Unit.insertMany(Array.from({ length: 125 }, (_, i) => ({ organizationId: org, propertyId, buildingId, floorId, name: 'Unit ' + i, code: 'U' + i, unitType: 'STUDIO', monthlyRent: 10000, createdBy: admin.userId, updatedBy: admin.userId })));
    await lifecycle.batch(org); await lifecycle.batch(org); await lifecycle.batch(org);
    expect(await SalesActivity.countDocuments({ leadId, kind: 'unit.created.record' })).toBe(125);
    expect(await SalesActivity.countDocuments({ leadId, kind: 'building.created.record' })).toBe(1);
    expect(await DomainEvent.countDocuments({ name: 'unit.created' })).toBe(0);
  }, 30000);
  it('merges only proven contacts after exact-payload review, preserving history, opt-out and billing identity', async () => {
    await link(); await SalesSuccessService.note(admin, leadId, { text: 'Canonical original note' });
    const source = await SalesLead.create({ reference: 'LEGACY-SOURCE', name: 'Legacy customer', email: 'verified-owner@example.test', properties: 1, units: '100', challenge: 'Legacy captured customer needs', consent: 'OPTED_OUT', optedOutAt: new Date(), assignedTo: admin.userId });
    await SalesSuccessService.note(admin, String(source._id), { text: 'Preserved legacy note' });
    const target = await SalesLead.findById(leadId);
    const proposal = await identity.proposeMerge(admin, { sourceId: String(source._id), targetId: leadId, sourceRevision: 0, targetRevision: target!.revision, reason: 'Verified duplicate contact with existing customer' });
    await expect(identity.mergeDecision(admin, proposal.id, { decision: 'APPROVE', payloadHash: 'a'.repeat(64) })).rejects.toMatchObject({ code: 'MERGE_CHANGED' });
    await identity.mergeDecision(admin, proposal.id, { decision: 'APPROVE', payloadHash: proposal.payloadHash });
    const view = await SalesSuccessService.view(admin, leadId);
    expect(view.customer.consent).toBe('OPTED_OUT'); expect(String(view.customer.organizationId)).toBe(String(org));
    expect(view.timeline.some(n => n.text === 'Preserved legacy note')).toBe(true);
    expect(await SalesLead.countDocuments({})).toBe(2);
    await expect(SalesSuccessService.view(admin, String(source._id))).rejects.toMatchObject({ code: 'CUSTOMER_MERGED' });
    expect((await SalesSuccessService.list(admin, {})).total).toBe(1);
    const unrelated = await SalesLead.create({ reference: 'UNRELATED', name: view.customer.name, email: 'different@example.test', properties: 1, units: '10', challenge: 'Unrelated entity' });
    const current = await SalesLead.findById(leadId);
    await expect(identity.proposeMerge(admin, { sourceId: String(unrelated._id), targetId: leadId, sourceRevision: 0, targetRevision: current!.revision, reason: 'Same name is insufficient identity evidence' })).rejects.toMatchObject({ code: 'MERGE_IDENTITY_UNPROVEN' });
  });
  it('paginates historical notes without gaps and rejects malformed cursors and unauthorized HTTP', async () => {
    await SalesActivity.insertMany(Array.from({ length: 62 }, (_, i) => ({ leadId, actorUserId: admin.userId, kind: 'sales.note.created', text: 'History ' + i })));
    const seen = new Set<string>(); let cursor: string | null = null;
    do {
      const page = await SalesHistoryService.page(admin, leadId, { kind: 'ACTIVITIES', limit: 25, ...(cursor ? { cursor } : {}) });
      for (const item of page.items) { expect(seen.has(String(item._id))).toBe(false); seen.add(String(item._id)); }
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen.size).toBe(63);
    const malformed = await request(app).get(`/api/v1/sales/success/customers/${leadId}/history?kind=ACTIVITIES&cursor=bad`).auth(token, { type: 'bearer' });
    expect(malformed.status).toBe(400);
    expect((await request(app).get(`/api/v1/sales/success/customers/${leadId}/identity`)).status).toBe(401);
    await expect(identity.proposeMerge({ ...admin, adminDualChannel: false }, {})).rejects.toMatchObject({ code: 'FRESH_AUTH_REQUIRED' });
  });
  it('does not expose commercial projection evidence through delegated notes-only access', async () => {
    await SalesLead.updateOne({ _id: leadId }, { $set: { assignedTo: owner } });
    await SalesActivity.create({ leadId, actorKind: 'SYSTEM', kind: 'landlord.payment.pending', sourceKey: 'sensitive-financial-evidence', sourceType: 'AUDIT_EVENT', text: 'Commercial source detail' });
    await SalesActivity.create({ leadId, actorUserId: admin.userId, kind: 'sales.note.created', text: 'Permitted customer note' });
    const delegate: AuthenticatedUser = { userId: owner, isPlatformAdmin: false, memberships: [{ organizationId: org, roleIds: [], roles: ['CUSTOM_SALES'], permissions: ['sales.leads.read', 'sales.notes.read', 'sales.meetings.read'], scope: { allProperties: true, propertyIds: [], buildingIds: [], unitIds: [] } }] };
    const view = await SalesSuccessService.view(delegate, leadId);
    expect(JSON.stringify(view)).not.toContain('Commercial source detail');
    expect(JSON.stringify(view)).toContain('Permitted customer note');
    expect((await identity.matches(delegate, leadId)).items).toEqual([]);
    const history = await SalesHistoryService.page(delegate, leadId, { kind: 'ACTIVITIES' });
    expect(JSON.stringify(history)).not.toContain('Commercial source detail');
    await SalesLead.updateOne({ _id: leadId }, { $set: { assignedTo: admin.userId } });
    await expect(SalesHistoryService.page(delegate, leadId, { kind: 'ACTIVITIES' })).rejects.toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
  });
});
