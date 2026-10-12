import bcrypt from 'bcryptjs';
import { randomBytes, randomInt } from 'node:crypto';
import mongoose, { Types, type HydratedDocument } from 'mongoose';
import type { TenantOnboardingDocument } from '../../database/models/TenantOnboarding.js';
import { TenantOnboarding } from '../../database/models/TenantOnboarding.js';
import { Tenant } from '../../database/models/Tenant.js';
import { Tenancy } from '../../database/models/Tenancy.js';
import { User } from '../../database/models/User.js';
import { OrganizationMembership } from '../../database/models/OrganizationMembership.js';
import { Role } from '../../database/models/Role.js';
import { Unit } from '../../database/models/Unit.js';
import { ResourceScopeService } from '../../core/authorization/resource-scope.service.js';
import { AppError } from '../../core/errors/AppError.js';
import { AuditService } from '../audit/audit.service.js';
import { adminOtpDigest, authEvidence, hashCredential, maskEmail, maskPhone } from '../auth/admin-security.js';
import { normalizePhone } from '../auth/auth.service.js';
import { availableChannels, assertOtpAvailable } from '../auth/otp-policy.js';
import { deliverOtp, type OtpChannel } from '../auth/otp-delivery.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import type { StartOnboardingInput, VerifyOnboardingInput } from './onboarding.schemas.js';

const metadata = (row: { get: (key: string) => unknown }) => {
  const value = row.get('metadata');
  return value instanceof Map ? Object.fromEntries(value) as Record<string, unknown> : value as Record<string, unknown>;
};
export class OnboardingService {
  static async start(auth: AuthenticatedUser, organizationId: string, data: StartOnboardingInput) {
    const orgId = new Types.ObjectId(organizationId);
    const unit = await Unit.findOne({ _id: data.unitId, organizationId: orgId });
    if (!unit) throw new AppError(404, 'UNIT_NOT_FOUND', 'Unit not found in this organization');
    ResourceScopeService.assertUnit(auth, unit, 'onboarding.manage');
    if (unit.status !== 'VACANT') throw new AppError(409, 'UNIT_UNAVAILABLE', 'Only vacant units can be assigned during onboarding');
    if (!(await availableChannels()).includes('SMS') && !data.email) throw new AppError(400, 'EMAIL_REQUIRED', 'Tenant email is required while SMS authentication is unavailable.');
    const phone = normalizePhone(data.phone), email = data.email?.trim().toLowerCase();
    const matches = await User.find({ $or: [{ phone }, ...(email ? [{ email }] : [])] });
    if (matches.length > 1 || matches.some(user => user.isPlatformAdmin || user.phone !== phone || email && user.email && user.email !== email))
      throw new AppError(409, 'CONTACT_IDENTITY_CONFLICT', 'These contacts belong to a different account. Resolve the identity before onboarding.');
    const existing = await TenantOnboarding.findOne({ organizationId: orgId, phone, status: { $in: ['PRE_REGISTERED', 'OTP_SENT', 'VERIFIED'] }, expiresAt: { $gt: new Date() } });
    if (existing) throw new AppError(409, 'ONBOARDING_EXISTS', 'An active onboarding record already exists for this phone number');
    if (await Tenancy.exists({ organizationId: orgId, unitId: unit._id, status: { $in: ['ACTIVE', 'NOTICE'] } })) throw new AppError(409, 'UNIT_OCCUPIED', 'Unit already has an active tenancy');
    if (await TenantOnboarding.exists({ organizationId: orgId, unitId: unit._id, status: { $in: ['PRE_REGISTERED', 'OTP_SENT', 'VERIFIED'] }, expiresAt: { $gt: new Date() } })) throw new AppError(409, 'UNIT_ONBOARDING_RESERVED', 'Unit already has an active tenant onboarding reservation');
    const onboarding = await TenantOnboarding.create({ organizationId: orgId, phone, propertyId: unit.propertyId, buildingId: unit.buildingId, floorId: unit.floorId, unitId: unit._id, status: 'PRE_REGISTERED', expiresAt: new Date(Date.now() + data.expiresInDays * 86_400_000), initiatedBy: auth.userId, createdBy: auth.userId, updatedBy: auth.userId, metadata: { firstName: data.firstName, lastName: data.lastName, ...(email ? { email } : {}) } });
    await AuditService.record({ actorUserId: auth.userId, organizationId: orgId, action: 'tenant.onboarding.pre_registered', resourceType: 'TenantOnboarding', resourceId: onboarding._id });
    return { onboardingId: onboarding._id, phone: onboarding.phone, unitId: onboarding.unitId, expiresAt: onboarding.expiresAt, status: onboarding.status };
  }
  static async sendOtp(auth: AuthenticatedUser, onboardingId: string, selected?: OtpChannel) {
    const row = await TenantOnboarding.findById(onboardingId);
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Onboarding record not found');
    ResourceScopeService.assertUnit(auth, row, 'onboarding.manage');
    if (row.expiresAt <= new Date()) throw new AppError(410, 'ONBOARDING_EXPIRED', 'Onboarding record has expired');
    return this.sendRecord(row, auth.userId, selected);
  }
  private static async sendRecord(row: HydratedDocument<TenantOnboardingDocument>, actorUserId: Types.ObjectId | undefined, selected?: OtpChannel) {
    const details = metadata(row), email = typeof details.email === 'string' ? details.email : undefined;
    const enabled = await availableChannels(), channel = selected ?? (email && enabled.includes('EMAIL') ? 'EMAIL' : 'SMS');
    await assertOtpAvailable(channel);
    const destination = channel === 'EMAIL' ? email : row.phone;
    if (!destination) throw new AppError(400, 'EMAIL_REQUIRED', 'Register the tenant email before sending an email code.');
    const existing = await User.findOne({ phone: row.phone });
    if (existing && (existing.isPlatformAdmin || channel === 'EMAIL' && existing.email !== email)) throw new AppError(409, 'CONTACT_IDENTITY_CONFLICT', 'Email onboarding cannot change an existing account destination.');
    const now = new Date(), code = String(randomInt(0, 1_000_000)).padStart(6, '0'), token = randomBytes(32).toString('base64url');
    const reserved = await TenantOnboarding.findOneAndUpdate({ _id: row._id, status: { $in: ['PRE_REGISTERED', 'OTP_SENT'] }, expiresAt: { $gt: now },
      otpSendCount: { $lt: 4 }, $or: [{ otpNextSendAt: { $exists: false } }, { otpNextSendAt: { $lte: now } }] },
      { $inc: { otpSendCount: 1 }, $set: { status: 'OTP_SENT', otpChannel: channel, otpTokenHash: hashCredential(token), otpAttempts: 0,
        otpHash: await bcrypt.hash(adminOtpDigest(String(row._id) + ':ONBOARDING:' + token, channel, code), 12),
        otpExpiresAt: new Date(Date.now() + 300_000), otpNextSendAt: new Date(Date.now() + 60_000), otpNextVerifyAt: now,
        otpDeliveryStatus: 'PENDING', updatedBy: actorUserId ?? row.initiatedBy } }, { new: true });
    if (!reserved) throw new AppError(429, 'OTP_RESEND_THROTTLED', 'Onboarding delivery is limited. Wait before retrying.');
    try { await deliverOtp(channel, destination, code, 300, 'tenant activation'); }
    catch { await TenantOnboarding.updateOne({ _id: row._id, otpTokenHash: hashCredential(token) }, { $set: { otpDeliveryStatus: 'FAILED' } }); throw new AppError(503, 'OTP_DELIVERY_FAILED', 'Activation code delivery failed. Retry after the countdown.'); }
    await TenantOnboarding.updateOne({ _id: row._id, otpTokenHash: hashCredential(token) }, { $set: { otpDeliveryStatus: 'SENT' } });
    await AuditService.record({ actorUserId, organizationId: row.organizationId, action: 'tenant.onboarding.otp_issued', resourceType: 'TenantOnboarding', resourceId: row._id, metadata: { channel } });
    return { onboardingId: row._id, onboardingToken: token, channel, destination: channel === 'EMAIL' ? maskEmail(destination) : maskPhone(destination), expiresAt: reserved.otpExpiresAt, resendAt: reserved.otpNextSendAt };
  }
  static async requestActivation(identifier: string, channel: OtpChannel) {
    await assertOtpAvailable(channel);
    const identity = channel === 'EMAIL' ? { 'metadata.email': identifier.trim().toLowerCase() } : { phone: normalizePhone(identifier) };
    const candidates = await TenantOnboarding.find({ ...identity, status: { $in: ['PRE_REGISTERED', 'OTP_SENT'] }, expiresAt: { $gt: new Date() } }).limit(2);
    const destination = channel === 'EMAIL' ? 'your registered email' : 'your registered phone';
    if (candidates.length !== 1) {
      // Match normal hash work and response fields without inventing a tenant record.
      await bcrypt.hash(randomBytes(32).toString('hex'), 12);
      return { onboardingToken: randomBytes(32).toString('base64url'), channel, destination, expiresAt: new Date(Date.now() + 300_000), resendAt: new Date(Date.now() + 60_000) };
    }
    const sent = await this.sendRecord(authEvidence(candidates[0]), undefined, channel);
    return { onboardingToken: sent.onboardingToken, channel, destination, expiresAt: sent.expiresAt, resendAt: sent.resendAt };
  }
  static async verify(data: VerifyOnboardingInput) {
    const now = new Date();
    const row = await TenantOnboarding.findOneAndUpdate({ otpTokenHash: hashCredential(data.onboardingToken), otpChannel: data.channel,
      status: 'OTP_SENT', expiresAt: { $gt: now }, otpExpiresAt: { $gt: now }, otpDeliveryStatus: 'SENT', otpAttempts: { $lt: 5 }, otpNextVerifyAt: { $lte: now } },
      { $inc: { otpAttempts: 1 }, $set: { otpNextVerifyAt: new Date(Date.now() + 2000) } }, { new: true });
    if (!row || !row.otpHash || !await bcrypt.compare(adminOtpDigest(String(row._id) + ':ONBOARDING:' + data.onboardingToken, data.channel, data.otp), row.otpHash)) throw new AppError(401, 'INVALID_OTP', 'Activation code is invalid, expired, reused or temporarily limited.');
    await assertOtpAvailable(data.channel);
    let result: Record<string, unknown> | undefined;
    await mongoose.connection.transaction(async session => {
      const claimed = await TenantOnboarding.findOneAndUpdate({ _id: row._id, status: 'OTP_SENT', otpTokenHash: hashCredential(data.onboardingToken), otpExpiresAt: { $gt: new Date() } },
        { $set: { status: 'VERIFIED' } }, { new: true, session });
      if (!claimed) throw new AppError(401, 'INVALID_OTP', 'Activation was already consumed or superseded.');
      const unit = await Unit.findOne({ _id: row.unitId, organizationId: row.organizationId, status: 'VACANT' }).session(session);
      if (!unit) throw new AppError(409, 'UNIT_UNAVAILABLE', 'The assigned unit is no longer available');
      const details = metadata(row), email = typeof details.email === 'string' ? details.email : undefined;
      let user = await User.findOne({ phone: row.phone }).session(session);
      if (user && (user.isPlatformAdmin || email && user.email !== email)) throw new AppError(409, 'CONTACT_IDENTITY_CONFLICT', 'The existing identity must be resolved before activation.');
      if (!user) { user = new User({ phone: row.phone, ...(email ? { email } : {}), firstName: details.firstName, lastName: details.lastName }); await user.save({ session }); }
      user.set(data.channel === 'EMAIL' ? 'emailVerifiedAt' : 'phoneVerifiedAt', new Date()); user.verifiedAt ??= new Date(); await user.save({ session });
      const tenantRole = await Role.findOne({ key: 'TENANT', system: true, organizationId: null }).session(session);
      if (!tenantRole) throw new AppError(500, 'TENANT_ROLE_MISSING', 'System TENANT role is not configured');
      const existingMembership = await OrganizationMembership.findOne({ userId: user._id, organizationId: row.organizationId, status: 'ACTIVE' }).session(session);
      if (existingMembership && existingMembership.roleIds.some(id => String(id) !== String(tenantRole._id))) throw new AppError(409, 'CONTACT_IDENTITY_CONFLICT', 'Existing staff or owner membership cannot be replaced by tenant onboarding.');
      let tenant = await Tenant.findOne({ organizationId: row.organizationId, userId: user._id }).session(session);
      if (!tenant) { tenant = new Tenant({ organizationId: row.organizationId, userId: user._id, status: 'PROSPECT', createdBy: row.initiatedBy, updatedBy: row.initiatedBy }); await tenant.save({ session }); }
      await OrganizationMembership.updateOne({ userId: user._id, organizationId: row.organizationId }, { $set: { roleIds: [tenantRole._id], scope: { allProperties: false, propertyIds: [], buildingIds: [], unitIds: [row.unitId] }, status: 'ACTIVE', invitedBy: row.initiatedBy, joinedAt: new Date() } }, { upsert: true, session });
      await TenantOnboarding.updateOne({ _id: row._id }, { $set: { tenantUserId: user._id, tenantId: tenant._id, status: 'COMPLETED', verifiedAt: new Date(), completedAt: new Date() }, $unset: { otpHash: 1, otpTokenHash: 1, otpExpiresAt: 1 } }, { session });
      await AuditService.record({ actorUserId: user._id, organizationId: row.organizationId, action: 'tenant.onboarding.verified', resourceType: 'TenantOnboarding', resourceId: row._id, metadata: { channel: data.channel } }, session);
      result = { userId: user._id, tenantId: tenant._id, organizationId: row.organizationId, propertyId: row.propertyId, buildingId: row.buildingId, floorId: row.floorId, unitId: row.unitId, message: 'Tenant contact verified and assigned unit preserved. Sign in through the normal login page.' };
    });
    return result;
  }
  static async get(auth: AuthenticatedUser, onboardingId: string) {
    const row = await TenantOnboarding.findById(onboardingId);
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Onboarding record not found');
    ResourceScopeService.assertUnit(auth, row, 'onboarding.view');
    const safe = row.toObject();
    delete safe.otpHash; delete safe.otpTokenHash;
    return safe;
  }
}
