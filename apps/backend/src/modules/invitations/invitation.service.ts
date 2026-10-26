import { createHash, randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { availableChannels } from '../auth/otp-policy.js';
import { Types } from 'mongoose';
import { Invitation } from '../../database/models/Invitation.js';
import { OrganizationMembership } from '../../database/models/OrganizationMembership.js';
import { Role } from '../../database/models/Role.js';
import { User } from '../../database/models/User.js';
import { Tenant } from '../../database/models/Tenant.js';
import { Tenancy } from '../../database/models/Tenancy.js';
import { Organization } from '../../database/models/Organization.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { ResourceScopeService } from '../../core/authorization/resource-scope.service.js';
import { AppError } from '../../core/errors/AppError.js';
import { normalizePhone } from '../auth/auth.service.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import type { CreateInvitationInput } from './invitation.schemas.js';
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const allowed: Record<string, string[]> = { SUPER_ADMIN: ['PROPERTY_MANAGER', 'CARETAKER', 'CONTRACTOR', 'TENANT'], LANDLORD: ['PROPERTY_MANAGER', 'CARETAKER', 'CONTRACTOR', 'TENANT'], PROPERTY_MANAGER: ['CARETAKER', 'CONTRACTOR', 'TENANT'] };
export class InvitationService {
  static async create(auth: AuthenticatedUser, organizationId: string, data: CreateInvitationInput) {
    const orgId = new Types.ObjectId(organizationId); AuthorizationService.assertPermission(auth, 'organization.members.manage', orgId);
    const membership = auth.isPlatformAdmin ? undefined : AuthorizationService.getMembership(auth, orgId);
    if (!auth.isPlatformAdmin && !membership?.roles.some((role) => allowed[role]?.includes(data.role))) throw new AppError(403, 'INVITATION_ROLE_FORBIDDEN', 'You are not authorized to invite this role');
    if (data.role === 'TENANT' && !data.phone) throw new AppError(400, 'TENANT_PHONE_REQUIRED', 'Tenant invitations require a pre-registered phone number');
    if (data.role === 'TENANT' && data.unitIds.length !== 1) throw new AppError(400, 'TENANT_UNIT_REQUIRED', 'Tenant invitations must bind exactly one unit');
    for (const id of data.propertyIds) await ResourceScopeService.assertPropertyExistsInOrganization(id, orgId);
    for (const id of data.buildingIds) await ResourceScopeService.assertBuildingExistsInOrganization(id, orgId);
    for (const id of data.unitIds) await ResourceScopeService.assertUnitExistsInOrganization(id, orgId);
    if (data.tenancyId) {
      const tenancy = await Tenancy.findOne({ _id: data.tenancyId, organizationId: orgId });
      if (!tenancy) throw new AppError(404, 'TENANCY_NOT_FOUND', 'Tenancy not found in this organization');
      if (data.role === 'TENANT' && data.unitIds[0] && String(tenancy.unitId) !== data.unitIds[0]) throw new AppError(400, 'TENANCY_UNIT_MISMATCH', 'Tenancy does not belong to the invited unit');
    }
    if (!(await availableChannels()).includes('SMS') && !data.email) throw new AppError(400, 'EMAIL_REQUIRED', 'Invitations require email while SMS authentication is unavailable.');
    const rawToken = randomBytes(32).toString('base64url');
    const invitation = await Invitation.create({ organizationId: orgId, invitedByUserId: auth.userId, ...(data.email ? { email: data.email.toLowerCase() } : {}), ...(data.phone ? { phone: normalizePhone(data.phone) } : {}), role: data.role, propertyIds: data.propertyIds.map((id) => new Types.ObjectId(id)), buildingIds: data.buildingIds.map((id) => new Types.ObjectId(id)), unitIds: data.unitIds.map((id) => new Types.ObjectId(id)), ...(data.tenancyId ? { tenancyId: new Types.ObjectId(data.tenancyId) } : {}), ...(data.contractorId ? { contractorId: new Types.ObjectId(data.contractorId) } : {}), tokenHash: hash(rawToken), expiresAt: new Date(Date.now() + data.expiresInDays * 86_400_000) });
    return { invitationId: invitation._id, role: invitation.role, expiresAt: invitation.expiresAt, token: rawToken };
  }
  static async list(auth: AuthenticatedUser, organizationId: string) { AuthorizationService.assertPermission(auth, 'organization.members.manage', organizationId); return Invitation.find({ organizationId }).sort({ createdAt: -1 }); }
  static async revoke(auth: AuthenticatedUser, organizationId: string, invitationId: string) { AuthorizationService.assertPermission(auth, 'organization.members.manage', organizationId); const invitation = await Invitation.findOneAndUpdate({ _id: invitationId, organizationId, status: 'PENDING' }, { status: 'REVOKED', revokedAt: new Date() }, { new: true }); if (!invitation) throw new AppError(404, 'INVITATION_NOT_FOUND', 'Invitation not found or already closed'); return invitation; }
  static async accept(data: { token: string; firstName: string; lastName: string; phone: string; email?: string }) {
    const invitation = await Invitation.findOne({ tokenHash: hash(data.token), status: 'PENDING', expiresAt: { $gt: new Date() } });
    if (!invitation) throw new AppError(404, 'INVITATION_INVALID', 'Invitation is invalid, expired, or already used');
    if (invitation.role === 'LANDLORD') {
      if (!invitation.email || data.email?.toLowerCase() !== invitation.email) throw new AppError(403, 'INVITATION_IDENTITY_MISMATCH', 'The invited landlord email must match');
      const phone = normalizePhone(data.phone);
      return mongoose.connection.transaction(async session => {
        const current = await Invitation.findOne({ _id: invitation._id, status: 'PENDING', expiresAt: { $gt: new Date() } }).session(session);
        if (!current) throw new AppError(409, 'INVITATION_CLOSED', 'Invitation has already been used');
        if (await User.exists({ $or: [{ phone }, { email: invitation.email }] }).session(session)) throw new AppError(409, 'USER_EXISTS', 'An account already exists for these contact details');
        const role = await Role.findOne({ key: 'LANDLORD', system: true, organizationId: null }).session(session);
        if (!role) throw new AppError(503, 'SYSTEM_ROLE_MISSING', 'Landlord role is not configured');
        const [user] = await User.create([{ phone, email: invitation.email, firstName: data.firstName, lastName: data.lastName }], { session });
        const org = await Organization.findOneAndUpdate({ _id: invitation.organizationId, 'onboarding.ownerUserId': { $exists: false } },
          { $set: { 'onboarding.ownerUserId': user!._id } }, { new: true, session });
        if (!org) throw new AppError(409, 'LANDLORD_ALREADY_ASSIGNED', 'This organization already has a landlord owner');
        await OrganizationMembership.create([{ userId: user!._id, organizationId: org._id, roleIds: [role._id], status: 'ACTIVE',
          scope: { allProperties: true, propertyIds: [], buildingIds: [], unitIds: [] }, invitedBy: invitation.invitedByUserId, joinedAt: new Date() }], { session });
        current.status = 'ACCEPTED'; current.acceptedAt = new Date(); await current.save({ session });
        await AuditService.record({ organizationId: org._id, actorUserId: user!._id, actorRole: 'LANDLORD', action: 'landlord.assisted.invitation.accepted', resourceType: 'Organization', resourceId: org._id }, session);
        return { userId: user!._id, organizationId: org._id, role: 'LANDLORD', message: 'Invitation accepted. Verify your own contact details and sign in through the normal authentication flow.' };
      });
    }
    const phone = normalizePhone(data.phone); const email = data.email?.toLowerCase();
    if (invitation.phone && invitation.phone !== phone) throw new AppError(403, 'INVITATION_IDENTITY_MISMATCH', 'Phone number does not match the invitation');
    if (invitation.email && email !== invitation.email) throw new AppError(403, 'INVITATION_IDENTITY_MISMATCH', 'Email does not match the invitation');
    if (await User.exists({ phone })) throw new AppError(409, 'USER_EXISTS', 'A user already exists for this phone number');
    if (email && await User.exists({ email })) throw new AppError(409, 'USER_EXISTS', 'A user already exists for this email address');
    if (invitation.role === 'TENANT' && invitation.unitIds.length !== 1) throw new AppError(400, 'TENANT_UNIT_REQUIRED', 'Tenant invitation is missing its assigned unit');
    const user = await User.create({ phone, ...(email ? { email } : {}), firstName: data.firstName, lastName: data.lastName });
    try {
      const role = await Role.findOne({ key: invitation.role, system: true, organizationId: null }); if (!role) throw new AppError(500, 'SYSTEM_ROLE_MISSING', 'Invited system role is not configured');
      await OrganizationMembership.create({ userId: user._id, organizationId: invitation.organizationId, roleIds: [role._id], scope: { allProperties: false, propertyIds: invitation.propertyIds, buildingIds: invitation.buildingIds, unitIds: invitation.unitIds }, invitedBy: invitation.invitedByUserId, joinedAt: new Date() });
      if (invitation.role === 'TENANT') await Tenant.create({ organizationId: invitation.organizationId, userId: user._id, status: 'PROSPECT', createdBy: invitation.invitedByUserId, updatedBy: invitation.invitedByUserId });
      invitation.status = 'ACCEPTED'; invitation.acceptedAt = new Date(); await invitation.save();
      return { userId: user._id, organizationId: invitation.organizationId, role: invitation.role, unitId: invitation.unitIds[0], message: 'Invitation accepted. The account can now authenticate using the role-specific login flow.' };
    } catch (error) { await User.deleteOne({ _id: user._id }); throw error; }
  }
}
