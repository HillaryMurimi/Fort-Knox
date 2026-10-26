import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { completedAdminFixture } from '../helpers/admin-assurance.js';
import { LandlordOperationsService } from '../../src/modules/landlord-operations/landlord-operations.service.js';
import { InvitationService } from '../../src/modules/invitations/invitation.service.js';
import { EntitlementService } from '../../src/core/billing/entitlement.service.js';
import { Organization } from '../../src/database/models/Organization.js';
import { User } from '../../src/database/models/User.js';
import { Role } from '../../src/database/models/Role.js';
import { OrganizationMembership } from '../../src/database/models/OrganizationMembership.js';
import { SubscriptionPlan } from '../../src/database/models/SubscriptionPlan.js';
import { AdminSupportSession } from '../../src/database/models/AdminSupportSession.js';
import { Property } from '../../src/database/models/Property.js';
import { Unit } from '../../src/database/models/Unit.js';
import { AuditLog } from '../../src/database/models/AuditLog.js';
import { Notification } from '../../src/database/models/Notification.js';
import { SubscriptionInvoice } from '../../src/database/models/SubscriptionInvoice.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

describe.skipIf(!process.env.RUN_E2E)('landlord operations consent and pilot workflows', () => {
  let mongo: MongoMemoryReplSet;
  let admin: AuthenticatedUser, owner: AuthenticatedUser, orgId: string, adminToken: string;
  const app = createApp();
  const setupInput = { property: { name: 'Acacia Court', code: 'ACACIA', propertyType: 'APARTMENT', address: { addressLine1: '1 Main Road', city: 'Nairobi', country: 'Kenya' } },
    structureMode: 'BUILDINGS', buildings: [{ name: 'Block A', code: 'A', floors: [{ name: 'Ground', code: 'G', level: 0,
      units: [{ name: 'A01', code: 'A01', unitType: 'STUDIO', monthlyRent: 18000 }] }] }] };

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : {} });
    await mongoose.connect(mongo.getUri());
    await Promise.all([Organization, User, Role, OrganizationMembership, SubscriptionPlan, AdminSupportSession, Property, Unit, AuditLog, Notification, SubscriptionInvoice].map(model => model.init()));
  }, 180000);
  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
  beforeEach(async () => {
    for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
    const role = await Role.create({ key: 'LANDLORD', name: 'Landlord', system: true, organizationId: null, permissions: ['property.create', 'unit.create', 'billing.subscription.view'] });
    const verifiedAt = new Date();
    const ownerUser = await User.create({ phone: '+254700008101', email: 'operations-owner@example.test', firstName: 'Jane', lastName: 'Owner', emailVerifiedAt: verifiedAt });
    const org = await Organization.create({ name: 'Acacia', slug: 'acacia-operations', onboarding: { state: 'ACCOUNT_CREATED', ownerUserId: ownerUser._id, unitCount: 2 } });
    orgId = String(org._id);
    await OrganizationMembership.create({ organizationId: org._id, userId: ownerUser._id, roleIds: [role._id], status: 'ACTIVE', scope: { allProperties: true, propertyIds: [], buildingIds: [], unitIds: [] }, joinedAt: verifiedAt });
    owner = { userId: ownerUser._id, isPlatformAdmin: false, memberships: [{ organizationId: org._id, roleIds: [role._id], roles: ['LANDLORD'], permissions: ['property.create', 'unit.create', 'billing.subscription.view'], scope: { allProperties: true, propertyIds: [], buildingIds: [], unitIds: [] } }] };
    const adminUser = await User.create({ phone: '+254700008102', email: 'operations-admin@example.test', firstName: 'Platform', lastName: 'Admin', isPlatformAdmin: true });
    adminToken = await completedAdminFixture(adminUser._id);
    const payload = jwt.decode(adminToken) as { sid: string };
    admin = { userId: adminUser._id, isPlatformAdmin: true, sessionId: new Types.ObjectId(payload.sid), mfaVerifiedAt: new Date(), adminDualChannel: true, memberships: [] };
    for (const [key, amount] of [['CONTROL', 10000], ['FORT_KNOX', 30000]] as const) await SubscriptionPlan.create({ key, name: key, currency: 'KES', amount, billingInterval: 'MONTH', trialDays: 0,
      metadata: { pricingModel: 'BASE_PLUS_ACTIVE_UNITS', includedUnits: 50, additionalUnitAmount: key === 'CONTROL' ? 200 : 300 },
      entitlements: { maxProperties: -1, maxUnits: -1, maxUsers: -1, maxTenants: -1, features: key === 'CONTROL' ? ['command-center'] : ['command-center', 'security'] }, active: true });
  });

  it('requires a real admin and landlord consent, then scopes and audits property configuration', async () => {
    expect((await request(app).get('/api/v1/landlord-operations/overview')).status).toBe(401);
    const ownerToken = jwt.sign({ sub: String(owner.userId), type: 'access' }, env.JWT_ACCESS_SECRET);
    expect((await request(app).get('/api/v1/landlord-operations/overview').auth(ownerToken, { type: 'bearer' })).status).toBe(403);
    await expect(LandlordOperationsService.requestSupport(owner, { organizationId: orgId, ownerUserId: String(owner.userId), purpose: 'Finish the missing units', permission: 'PROPERTY_SETUP' })).rejects.toMatchObject({ statusCode: 403 });
    await LandlordOperationsService.grantPilot(admin, orgId, { ownerUserId: String(owner.userId), planKey: 'CONTROL', durationDays: 14 });
    const support = await LandlordOperationsService.requestSupport(admin, { organizationId: orgId, ownerUserId: String(owner.userId), purpose: 'Finish the remaining configured units', permission: 'PROPERTY_SETUP' });
    expect((await LandlordOperationsService.listSupport(owner, orgId))[0]?.adminName).toBe('Platform Admin');
    expect(await Notification.countDocuments({ recipientUserId: owner.userId, type: 'SUPPORT_ACCESS_REQUEST' })).toBe(1);
    await expect(LandlordOperationsService.createPropertySetup(admin, String(support._id), setupInput)).rejects.toMatchObject({ statusCode: 403 });
    const other = await Organization.create({ name: 'Other', slug: 'other-operations' });
    await expect(LandlordOperationsService.decideSupport({ ...owner, memberships: [{ ...owner.memberships[0]!, organizationId: other._id }] }, String(support._id), true)).rejects.toMatchObject({ statusCode: 403 });
    const approval = await request(app).post(`/api/v1/landlord-operations/support-sessions/${String(support._id)}/approve`).auth(ownerToken, { type: 'bearer' });
    expect(approval.status).toBe(200);
    expect(approval.body.data.adminSessionId).toBeUndefined();
    const created = await LandlordOperationsService.createPropertySetup(admin, String(support._id), setupInput);
    expect(created.unitCount).toBe(1);
    const floorId = (await Unit.findOne({ organizationId: orgId }).lean())!.floorId;
    const unitInput = { floorId: String(floorId), name: 'A02', code: 'A02', unitType: 'STUDIO', monthlyRent: 19000 };
    await LandlordOperationsService.addUnit(admin, String(support._id), unitInput);
    await expect(LandlordOperationsService.addUnit(admin, String(support._id), unitInput)).rejects.toBeTruthy();
    expect(await Unit.countDocuments({ organizationId: orgId })).toBe(2);
    expect(await AuditLog.countDocuments({ organizationId: orgId, 'metadata.supportSessionId': String(support._id) })).toBeGreaterThan(0);
    await LandlordOperationsService.endSupport(owner, String(support._id));
    await expect(LandlordOperationsService.addUnit(admin, String(support._id), { ...unitInput, code: 'A03' })).rejects.toMatchObject({ statusCode: 403 });
    expect(await Unit.countDocuments({ organizationId: orgId })).toBe(2);
  }, 30000);

  it('expires support access and converts an actual pilot without inventing payment', async () => {
    await LandlordOperationsService.grantPilot(admin, orgId, { ownerUserId: String(owner.userId), planKey: 'FORT_KNOX', durationDays: 7 });
    const support = await LandlordOperationsService.requestSupport(admin, { organizationId: orgId, ownerUserId: String(owner.userId), purpose: 'Configure pilot property', permission: 'PROPERTY_SETUP' });
    await LandlordOperationsService.decideSupport(owner, String(support._id), true);
    await LandlordOperationsService.createPropertySetup(admin, String(support._id), setupInput);
    await AdminSupportSession.updateOne({ _id: support._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(LandlordOperationsService.addUnit(admin, String(support._id), { floorId: String((await Unit.findOne({ organizationId: orgId }))!.floorId), name: 'A02', code: 'A02', unitType: 'STUDIO', monthlyRent: 18000 })).rejects.toMatchObject({ statusCode: 403 });
    await LandlordOperationsService.extendPilot(admin, orgId, { additionalDays: 2 });
    const conversion = await LandlordOperationsService.prepareConversion(admin, orgId, { planKey: 'FORT_KNOX' });
    expect(conversion.quote.unitCount).toBe(1);
    expect(conversion.quote.totalMinor).toBe(9000000);
    expect(conversion.requiresLandlordSignature).toBe(true);
    expect(await Unit.countDocuments({ organizationId: orgId })).toBe(1);
    expect(await SubscriptionInvoice.countDocuments({ organizationId: orgId })).toBe(0);
    expect((await EntitlementService.getPlan(orgId)).key).toBe('FORT_KNOX');
    await LandlordOperationsService.terminatePilot(admin, orgId);
    await expect(LandlordOperationsService.extendPilot(admin, orgId, { additionalDays: 1 })).rejects.toMatchObject({ statusCode: 409 });
    await expect(EntitlementService.getPlan(orgId)).rejects.toMatchObject({ statusCode: 402 });
    expect(await Unit.countDocuments({ organizationId: orgId })).toBe(1);
  }, 30000);

  it('creates a one-use owner invitation without sharing credentials', async () => {
    const invited = await LandlordOperationsService.createOrganization(admin, { name: 'New Portfolio', ownerEmail: 'new-owner@example.test' });
    const accepted = await InvitationService.accept({ token: invited.invitationToken, firstName: 'New', lastName: 'Owner', phone: '+254700008103', email: 'new-owner@example.test' });
    expect(accepted.role).toBe('LANDLORD');
    expect(await OrganizationMembership.countDocuments({ organizationId: invited.organizationId, userId: accepted.userId })).toBe(1);
    expect((await Organization.findById(invited.organizationId))!.onboarding?.ownerUserId?.toString()).toBe(String(accepted.userId));
    await expect(InvitationService.accept({ token: invited.invitationToken, firstName: 'Another', lastName: 'Owner', phone: '+254700008104', email: 'new-owner@example.test' })).rejects.toBeTruthy();
  }, 30000);
});
