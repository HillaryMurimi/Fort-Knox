import mongoose, { Types } from 'mongoose';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { AppError } from '../../core/errors/AppError.js';
import { Organization } from '../../database/models/Organization.js';
import { OrganizationMembership } from '../../database/models/OrganizationMembership.js';
import { OrganizationSubscription } from '../../database/models/OrganizationSubscription.js';
import { AdminSupportSession } from '../../database/models/AdminSupportSession.js';
import { Property } from '../../database/models/Property.js';
import { Unit } from '../../database/models/Unit.js';
import { Floor } from '../../database/models/Floor.js';
import { AuditLog } from '../../database/models/AuditLog.js';
import { User } from '../../database/models/User.js';
import { Invitation } from '../../database/models/Invitation.js';
import { Notification } from '../../database/models/Notification.js';
import { SubscriptionPlan } from '../../database/models/SubscriptionPlan.js';
import { AuditService } from '../audit/audit.service.js';
import { assertFreshAdmin } from '../auth/admin-security.js';
import { assertPublishedFortKnoxInheritance } from '../billing/plan-inheritance.js';
import { priceSnapshot } from '../onboarding/contract-snapshot.js';
import { UnitService } from '../units/unit.service.js';
import { PropertySetupService } from '../properties/property-setup.service.js';
import { directoryQuerySchema, supportRequestSchema, supportUnitSchema, supportPropertySetupSchema, pilotGrantSchema, pilotExtendSchema, conversionSchema, createAssistedOrganizationSchema } from './landlord-operations.schemas.js';

const requestLifetimeMs = 24 * 60 * 60 * 1000;
const sessionLifetimeMs = 60 * 60 * 1000;

function admin(auth: AuthenticatedUser) {
  AuthorizationService.assertPlatformAdmin(auth);
  if (!auth.sessionId) throw new AppError(401, 'ADMIN_SESSION_REQUIRED', 'A verified administrator session is required');
}

function owner(auth: AuthenticatedUser, organizationId: string) {
  if (auth.isPlatformAdmin) throw new AppError(403, 'LANDLORD_CONSENT_REQUIRED', 'Administrators cannot approve their own support access');
  const membership = AuthorizationService.getMembership(auth, organizationId);
  if (!membership.roles.includes('LANDLORD') || !membership.scope.allProperties) throw new AppError(403, 'LANDLORD_CONSENT_REQUIRED', 'Only an organization-wide landlord may approve support access');
}

export class LandlordOperationsService {
  static async overview(auth: AuthenticatedUser) {
    admin(auth);
    const now = new Date();
    const [totalLandlords, activePilots, payingOrganizations, incompleteOnboarding, activeSupportSessions] = await Promise.all([
      Organization.countDocuments({}),
      Organization.countDocuments({ 'guidedPilot.expiresAt': { $gt: now }, 'onboarding.state': { $ne: 'ACTIVE' } }),
      Organization.countDocuments({ 'onboarding.state': 'ACTIVE' }),
      Organization.countDocuments({ 'onboarding.state': { $ne: 'ACTIVE' } }),
      AdminSupportSession.countDocuments({ status: 'ACTIVE', expiresAt: { $gt: now } }),
    ]);
    return { totalLandlords, activePilots, payingOrganizations, incompleteOnboarding, activeSupportSessions };
  }

  static async createOrganization(auth: AuthenticatedUser, raw: unknown) {
    admin(auth); assertFreshAdmin(auth);
    const input = createAssistedOrganizationSchema.parse(raw);
    const email = input.ownerEmail.toLowerCase();
    if (await User.exists({ email })) throw new AppError(409, 'OWNER_ACCOUNT_EXISTS', 'This email already belongs to an account; use the existing organization support workflow');
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    return mongoose.connection.transaction(async session => {
      const [org] = await Organization.create([{ name: input.name, slug: `assisted-${randomUUID()}`, onboarding: { state: 'ACCOUNT_CREATED' } }], { session });
      const [invitation] = await Invitation.create([{ organizationId: org!._id, invitedByUserId: auth.userId, email, role: 'LANDLORD',
        propertyIds: [], buildingIds: [], unitIds: [], tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(now.getTime() + 7 * 86400000) }], { session });
      await AuditService.record({ organizationId: org!._id, actorUserId: auth.userId, actorRole: 'SUPER_ADMIN', action: 'landlord.assisted.organization.created', resourceType: 'Organization', resourceId: org!._id,
        after: { name: input.name, invitationId: String(invitation!._id) } }, session);
      return { organizationId: org!._id, invitationId: invitation!._id, invitationToken: token, expiresAt: invitation!.expiresAt, delivery: 'ADMIN_MUST_SEND_SECURELY' };
    });
  }

  static async directory(auth: AuthenticatedUser, raw: unknown) {
    admin(auth);
    const query = directoryQuerySchema.parse(raw);
    const filter: Record<string, unknown> = {};
    if (query.search) filter.name = { $regex: query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    if (query.status === 'PILOT') { filter['guidedPilot.expiresAt'] = { $gt: new Date() }; filter['onboarding.state'] = { $ne: 'ACTIVE' }; }
    if (query.status === 'PAID') filter['onboarding.state'] = 'ACTIVE';
    if (query.status === 'INCOMPLETE') filter['onboarding.state'] = { $ne: 'ACTIVE' };
    const [organizations, total] = await Promise.all([
      Organization.find(filter).select('name status onboarding guidedPilot updatedAt createdAt').sort({ updatedAt: -1, _id: -1 }).skip((query.page - 1) * query.pageSize).limit(query.pageSize).lean(),
      Organization.countDocuments(filter),
    ]);
    const ids = organizations.map(item => item._id);
    const [propertyCounts, unitCounts, subscriptions, lastAudits] = await Promise.all([
      Property.aggregate<{ _id: Types.ObjectId; count: number }>([{ $match: { organizationId: { $in: ids }, status: { $ne: 'ARCHIVED' } } }, { $group: { _id: '$organizationId', count: { $sum: 1 } } }]),
      Unit.aggregate<{ _id: Types.ObjectId; count: number }>([{ $match: { organizationId: { $in: ids }, status: { $ne: 'INACTIVE' } } }, { $group: { _id: '$organizationId', count: { $sum: 1 } } }]),
      OrganizationSubscription.find({ organizationId: { $in: ids } }).select('organizationId status provider planId').lean(),
      AuditLog.aggregate<{ _id: Types.ObjectId; lastActivityAt: Date }>([{ $match: { organizationId: { $in: ids } } }, { $group: { _id: '$organizationId', lastActivityAt: { $max: '$occurredAt' } } }]),
    ]);
    const counts = (rows: Array<{ _id: Types.ObjectId; count: number }>) => new Map(rows.map(row => [String(row._id), row.count]));
    const properties = counts(propertyCounts), units = counts(unitCounts);
    const activity = new Map(lastAudits.map(row => [String(row._id), row.lastActivityAt]));
    return { items: organizations.map(org => ({
      id: org._id, name: org.name, status: org.status, onboardingState: org.onboarding?.state ?? 'ACCOUNT_CREATED',
      declaredUnits: org.onboarding?.unitCount ?? null, configuredUnits: units.get(String(org._id)) ?? 0,
      properties: properties.get(String(org._id)) ?? 0, lastActivityAt: activity.get(String(org._id)) ?? org.updatedAt,
      pilot: org.guidedPilot ? { planKey: org.guidedPilot.planKey, expiresAt: org.guidedPilot.expiresAt, active: org.guidedPilot.expiresAt > new Date() && org.onboarding?.state !== 'ACTIVE' } : null,
      subscription: subscriptions.find(item => String(item.organizationId) === String(org._id))?.status ?? null,
    })), total, page: query.page, pageSize: query.pageSize };
  }

  static async detail(auth: AuthenticatedUser, organizationId: string) {
    admin(auth);
    const id = AuditService.assertObjectId(organizationId, 'organizationId');
    const org = await Organization.findById(id).select('name status onboarding guidedPilot portfolioOnboarding createdAt updatedAt').lean();
    if (!org) throw new AppError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found');
    const [properties, floors, unitCounts, subscription, lastAudit, sessions, ownerAccount] = await Promise.all([
      Property.find({ organizationId: id, status: { $ne: 'ARCHIVED' } }).select('name code status').sort({ name: 1 }).limit(100).lean(),
      Floor.find({ organizationId: id }).select('name code propertyId buildingId').limit(500).lean(),
      Unit.aggregate<{ _id: Types.ObjectId; count: number }>([{ $match: { organizationId: id, status: { $ne: 'INACTIVE' } } }, { $group: { _id: '$floorId', count: { $sum: 1 } } }]),
      OrganizationSubscription.findOne({ organizationId: id }).select('status provider planId currentPeriodEnd').lean(),
      AuditLog.findOne({ organizationId: id }).sort({ occurredAt: -1 }).select('occurredAt action actorUserId').lean(),
      AdminSupportSession.find({ organizationId: id }).sort({ requestedAt: -1 }).limit(20).select('-adminSessionId -__v').lean(),
      org.onboarding?.ownerUserId ? User.findById(org.onboarding.ownerUserId).select('firstName lastName email phone emailVerifiedAt phoneVerifiedAt status').lean() : Promise.resolve(null),
    ]);
    const perFloor = new Map(unitCounts.map(row => [String(row._id), row.count]));
    const configuredUnits = unitCounts.reduce((sum, row) => sum + row.count, 0);
    return { organization: org, onboardingState: org.onboarding?.state ?? 'ACCOUNT_CREATED',
      outstandingUnits: Math.max(0, (org.onboarding?.unitCount ?? 0) - configuredUnits), configuredUnits,
      properties, floors: floors.map(floor => ({ ...floor, configuredUnits: perFloor.get(String(floor._id)) ?? 0 })),
      subscription, ownerAccount: ownerAccount ? { id: ownerAccount._id, name: `${ownerAccount.firstName} ${ownerAccount.lastName}`, email: ownerAccount.email, verified: !!(ownerAccount.emailVerifiedAt || ownerAccount.phoneVerifiedAt), status: ownerAccount.status } : null,
      lastActivity: lastAudit, supportSessions: sessions };
  }

  static async requestSupport(auth: AuthenticatedUser, raw: unknown) {
    admin(auth);
    assertFreshAdmin(auth);
    const input = supportRequestSchema.parse(raw);
    const organizationId = new Types.ObjectId(input.organizationId), ownerUserId = new Types.ObjectId(input.ownerUserId);
    const [org, member, user] = await Promise.all([
      Organization.findById(organizationId).select('name status').lean(),
      OrganizationMembership.findOne({ organizationId, userId: ownerUserId, status: 'ACTIVE' }).populate('roleIds').lean(),
      User.findOne({ _id: ownerUserId, status: 'ACTIVE', isPlatformAdmin: false }).select('emailVerifiedAt phoneVerifiedAt').lean(),
    ]);
    if (!org || org.status !== 'ACTIVE') throw new AppError(404, 'ORGANIZATION_NOT_FOUND', 'Active organization not found');
    if (!user || (!user.emailVerifiedAt && !user.phoneVerifiedAt) || !member?.scope?.allProperties || !member.roleIds.some(role => typeof role === 'object' && 'key' in role && role.key === 'LANDLORD'))
      throw new AppError(403, 'VERIFIED_LANDLORD_REQUIRED', 'Select a verified organization-wide landlord');
    const now = new Date();
    return mongoose.connection.transaction(async session => {
      const [support] = await AdminSupportSession.create([{ organizationId, adminUserId: auth.userId, adminSessionId: auth.sessionId!, ownerUserId,
        purpose: input.purpose, permission: input.permission, status: 'REQUESTED', requestedAt: now, requestExpiresAt: new Date(now.getTime() + requestLifetimeMs) }], { session });
      await AuditService.record({ organizationId, actorUserId: auth.userId, actorRole: 'SUPER_ADMIN', action: 'support.requested', resourceType: 'AdminSupportSession', resourceId: support!._id, metadata: { permission: input.permission, ownerUserId: String(ownerUserId), purpose: input.purpose } }, session);
      await Notification.create([{ organizationId, recipientUserId: ownerUserId, channel: 'IN_APP', type: 'SUPPORT_ACCESS_REQUEST',
        title: 'Support access requested', body: 'A platform administrator requested temporary property-setup access. Review the purpose and approve or reject it in Support access.',
        data: { supportSessionId: String(support!._id), href: '/support-access' }, status: 'SENT', priority: 'HIGH', createdBy: auth.userId }], { session });
      return support;
    });
  }

  static async listSupport(auth: AuthenticatedUser, organizationId: string) {
    const id = AuditService.assertObjectId(organizationId, 'organizationId');
    if (auth.isPlatformAdmin) admin(auth); else owner(auth, organizationId);
    const sessions = await AdminSupportSession.find({ organizationId: id, ...(auth.isPlatformAdmin ? {} : { ownerUserId: auth.userId }) })
      .sort({ requestedAt: -1 }).limit(50).select('-adminSessionId -__v').lean();
    const admins = await User.find({ _id: { $in: sessions.map(item => item.adminUserId) } }).select('firstName lastName').lean();
    const names = new Map(admins.map(user => [String(user._id), `${user.firstName} ${user.lastName}`.trim()]));
    return sessions.map(item => ({ ...item, adminName: names.get(String(item.adminUserId)) ?? 'Platform administrator' }));
  }

  static async decideSupport(auth: AuthenticatedUser, supportId: string, approve: boolean) {
    const id = AuditService.assertObjectId(supportId, 'supportSessionId');
    const support = await AdminSupportSession.findById(id).lean();
    if (!support) throw new AppError(404, 'SUPPORT_SESSION_NOT_FOUND', 'Support request not found');
    owner(auth, String(support.organizationId));
    if (String(auth.userId) !== String(support.ownerUserId)) throw new AppError(403, 'LANDLORD_CONSENT_REQUIRED', 'Only the requested landlord may decide');
    const now = new Date();
    return mongoose.connection.transaction(async session => {
      const changed = await AdminSupportSession.findOneAndUpdate({ _id: id, status: 'REQUESTED', requestExpiresAt: { $gt: now } },
        { $set: { status: approve ? 'ACTIVE' : 'REJECTED', ...(approve ? { approvedAt: now, expiresAt: new Date(now.getTime() + sessionLifetimeMs) } : { endedAt: now }) } }, { new: true, session });
      if (!changed) throw new AppError(409, 'SUPPORT_REQUEST_CLOSED', 'Support request expired or was already decided');
      await AuditService.record({ organizationId: changed.organizationId, actorUserId: auth.userId, actorRole: 'LANDLORD', action: approve ? 'support.approved' : 'support.rejected', resourceType: 'AdminSupportSession', resourceId: id, metadata: { adminUserId: String(changed.adminUserId), permission: changed.permission } }, session);
      return changed;
    });
  }

  static async endSupport(auth: AuthenticatedUser, supportId: string) {
    const id = AuditService.assertObjectId(supportId, 'supportSessionId');
    const support = await AdminSupportSession.findById(id).lean();
    if (!support) throw new AppError(404, 'SUPPORT_SESSION_NOT_FOUND', 'Support session not found');
    if (auth.isPlatformAdmin) { admin(auth); if (String(auth.userId) !== String(support.adminUserId) || String(auth.sessionId) !== String(support.adminSessionId)) throw new AppError(403, 'SUPPORT_SESSION_SCOPE', 'This support session belongs to another administrator session'); }
    else { owner(auth, String(support.organizationId)); if (String(auth.userId) !== String(support.ownerUserId)) throw new AppError(403, 'LANDLORD_CONSENT_REQUIRED', 'Only the approving landlord may end this session'); }
    return mongoose.connection.transaction(async session => {
      const changed = await AdminSupportSession.findOneAndUpdate({ _id: id, status: { $in: ['REQUESTED', 'ACTIVE'] } }, { $set: { status: 'ENDED', endedAt: new Date() } }, { new: true, session });
      if (!changed) throw new AppError(409, 'SUPPORT_SESSION_CLOSED', 'Support session already closed');
      await AuditService.record({ organizationId: changed.organizationId, actorUserId: auth.userId, actorRole: auth.isPlatformAdmin ? 'SUPER_ADMIN' : 'LANDLORD', action: 'support.ended', resourceType: 'AdminSupportSession', resourceId: id }, session);
      return changed;
    });
  }

  static async addUnit(auth: AuthenticatedUser, supportId: string, raw: unknown) {
    admin(auth);
    const support = await AdminSupportSession.findOne({ _id: AuditService.assertObjectId(supportId, 'supportSessionId'), adminUserId: auth.userId, adminSessionId: auth.sessionId, status: 'ACTIVE', expiresAt: { $gt: new Date() }, permission: 'PROPERTY_SETUP' }).lean();
    if (!support) throw new AppError(403, 'SUPPORT_SESSION_INACTIVE', 'An approved, active support session is required');
    const input = supportUnitSchema.parse(raw);
    return UnitService.create(auth, String(support.organizationId), input, support._id);
  }

  static async createPropertySetup(auth: AuthenticatedUser, supportId: string, raw: unknown) {
    admin(auth);
    const support = await AdminSupportSession.findOne({ _id: AuditService.assertObjectId(supportId, 'supportSessionId'), adminUserId: auth.userId, adminSessionId: auth.sessionId, status: 'ACTIVE', expiresAt: { $gt: new Date() }, permission: 'PROPERTY_SETUP' }).lean();
    if (!support) throw new AppError(403, 'SUPPORT_SESSION_INACTIVE', 'An approved, active support session is required');
    return PropertySetupService.create(auth, String(support.organizationId), supportPropertySetupSchema.parse(raw), support._id);
  }

  static async grantPilot(auth: AuthenticatedUser, organizationId: string, raw: unknown) {
    admin(auth); assertFreshAdmin(auth);
    const id = AuditService.assertObjectId(organizationId, 'organizationId');
    const input = pilotGrantSchema.parse(raw);
    const ownerId = new Types.ObjectId(input.ownerUserId);
    const [member, user, plan] = await Promise.all([
      OrganizationMembership.findOne({ organizationId: id, userId: ownerId, status: 'ACTIVE' }).populate('roleIds').lean(),
      User.findOne({ _id: ownerId, status: 'ACTIVE', isPlatformAdmin: false }).select('emailVerifiedAt phoneVerifiedAt').lean(),
      SubscriptionPlan.findOne({ key: input.planKey, active: true }).lean(),
    ]);
    if (!user || (!user.emailVerifiedAt && !user.phoneVerifiedAt) || !member?.scope?.allProperties || !member.roleIds.some(role => typeof role === 'object' && 'key' in role && role.key === 'LANDLORD'))
      throw new AppError(403, 'VERIFIED_LANDLORD_REQUIRED', 'Pilot access requires a verified organization-wide landlord');
    if (!plan) throw new AppError(409, 'PLAN_NOT_AVAILABLE', 'The selected plan is not published');
    await assertPublishedFortKnoxInheritance(plan);
    const now = new Date();
    return mongoose.connection.transaction(async session => {
      const org = await Organization.findOne({ _id: id, status: 'ACTIVE' }).session(session);
      if (!org) throw new AppError(404, 'ORGANIZATION_NOT_FOUND', 'Active organization not found');
      if (org.guidedPilot) throw new AppError(409, 'PILOT_ALREADY_EXISTS', 'Use the extension or termination action for an existing pilot');
      if (org.onboarding?.state === 'ACTIVE' || await OrganizationSubscription.exists({ organizationId: id, status: { $in: ['ACTIVE', 'TRIALING'] } }).session(session))
        throw new AppError(409, 'PAID_ORGANIZATION', 'Paid organizations cannot receive an unpaid pilot grant');
      const expiresAt = new Date(now.getTime() + input.durationDays * 86400000);
      org.guidedPilot = { ownerUserId: ownerId, planKey: input.planKey, startedAt: now, expiresAt, durationDays: input.durationDays };
      await org.save({ session });
      await AuditService.record({ organizationId: id, actorUserId: auth.userId, actorRole: 'SUPER_ADMIN', action: 'pilot.admin.granted', resourceType: 'Organization', resourceId: id, after: { planKey: input.planKey, expiresAt, ownerUserId: input.ownerUserId } }, session);
      return { organizationId: id, planKey: input.planKey, expiresAt, billingStatus: 'TEMPORARILY_WAIVED' };
    });
  }

  static async extendPilot(auth: AuthenticatedUser, organizationId: string, raw: unknown) {
    admin(auth); assertFreshAdmin(auth);
    const id = AuditService.assertObjectId(organizationId, 'organizationId');
    const input = pilotExtendSchema.parse(raw);
    return mongoose.connection.transaction(async session => {
      const org = await Organization.findById(id).session(session);
      if (!org?.guidedPilot || org.guidedPilot.expiresAt <= new Date() || org.onboarding?.state === 'ACTIVE') throw new AppError(409, 'PILOT_NOT_ACTIVE', 'Active unpaid pilot not found');
      const now = new Date();
      const base = org.guidedPilot.expiresAt > now ? org.guidedPilot.expiresAt : now;
      const expiresAt = new Date(base.getTime() + input.additionalDays * 86400000);
      const totalDays = Math.ceil((expiresAt.getTime() - org.guidedPilot.startedAt.getTime()) / 86400000);
      if (totalDays > 60) throw new AppError(409, 'PILOT_DURATION_LIMIT', 'The total pilot period cannot exceed 60 days');
      const before = org.guidedPilot.expiresAt;
      org.guidedPilot.expiresAt = expiresAt;
      org.guidedPilot.durationDays = totalDays;
      await org.save({ session });
      await AuditService.record({ organizationId: id, actorUserId: auth.userId, actorRole: 'SUPER_ADMIN', action: 'pilot.admin.extended', resourceType: 'Organization', resourceId: id, before: { expiresAt: before }, after: { expiresAt } }, session);
      return { organizationId: id, expiresAt };
    });
  }

  static async terminatePilot(auth: AuthenticatedUser, organizationId: string) {
    admin(auth); assertFreshAdmin(auth);
    const id = AuditService.assertObjectId(organizationId, 'organizationId');
    return mongoose.connection.transaction(async session => {
      const org = await Organization.findById(id).session(session);
      if (!org?.guidedPilot || org.onboarding?.state === 'ACTIVE') throw new AppError(409, 'PILOT_NOT_ACTIVE', 'Unpaid pilot not found');
      const before = org.guidedPilot.expiresAt;
      org.guidedPilot.expiresAt = new Date();
      await org.save({ session });
      await AuditService.record({ organizationId: id, actorUserId: auth.userId, actorRole: 'SUPER_ADMIN', action: 'pilot.admin.terminated', resourceType: 'Organization', resourceId: id, before: { expiresAt: before }, after: { expiresAt: org.guidedPilot.expiresAt } }, session);
      return { organizationId: id, expiresAt: org.guidedPilot.expiresAt, active: false };
    });
  }

  static async prepareConversion(auth: AuthenticatedUser, organizationId: string, raw: unknown) {
    admin(auth); assertFreshAdmin(auth);
    const id = AuditService.assertObjectId(organizationId, 'organizationId');
    const input = conversionSchema.parse(raw);
    const plan = await SubscriptionPlan.findOne({ key: input.planKey, active: true }).lean();
    if (!plan) throw new AppError(409, 'PLAN_NOT_AVAILABLE', 'The selected plan is not published');
    await assertPublishedFortKnoxInheritance(plan);
    return mongoose.connection.transaction(async session => {
      const org = await Organization.findById(id).session(session);
      if (!org?.guidedPilot || org.onboarding?.state === 'ACTIVE') throw new AppError(409, 'PILOT_CONVERSION_NOT_AVAILABLE', 'An unpaid pilot is required');
      if (org.onboarding?.contractId || org.onboarding?.invoiceId || await OrganizationSubscription.exists({ organizationId: id, status: { $in: ['ACTIVE', 'TRIALING', 'PENDING'] } }).session(session))
        throw new AppError(409, 'COMMERCIAL_WORKFLOW_IN_PROGRESS', 'Review the existing contract or subscription instead of replacing it');
      const count = await Unit.countDocuments({ organizationId: id, status: { $ne: 'INACTIVE' } }).session(session);
      const quote = priceSnapshot(plan, count, 3);
      org.onboarding = { ...org.onboarding, state: 'PLAN_SELECTED', ownerUserId: org.guidedPilot.ownerUserId, unitCount: count,
        selectedPlanKey: input.planKey, selectedPrepaidMonths: 3, revision: (org.onboarding?.revision ?? 0) + 1 };
      await org.save({ session });
      await AuditService.record({ organizationId: id, actorUserId: auth.userId, actorRole: 'SUPER_ADMIN', action: 'pilot.conversion.prepared', resourceType: 'Organization', resourceId: id, after: { planKey: input.planKey, unitCount: count, quotedTotalMinor: quote.totalMinor, prepaidMonths: 3 } }, session);
      return { organizationId: id, quote, ownerNextStep: '/onboarding', requiresLandlordSignature: true, requiresVerifiedPayment: true };
    });
  }
}
