import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { Types } from 'mongoose';
import { TenantOnboarding } from '../../database/models/TenantOnboarding.js';
import { Tenant } from '../../database/models/Tenant.js';
import { Tenancy } from '../../database/models/Tenancy.js';
import { User } from '../../database/models/User.js';
import { OrganizationMembership } from '../../database/models/OrganizationMembership.js';
import { Role } from '../../database/models/Role.js';
import { Unit } from '../../database/models/Unit.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { ResourceScopeService } from '../../core/authorization/resource-scope.service.js';
import { AppError } from '../../core/errors/AppError.js';
import { env } from '../../config/env.js';
import { getSmsProvider } from '../../core/integrations/messaging-providers.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import type { StartOnboardingInput, VerifyOnboardingInput } from './onboarding.schemas.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const normalizePhone = (phone: string): string => phone.trim().replace(/[\s()-]/g, '');

export class OnboardingService {
  static async start(auth: AuthenticatedUser, organizationId: string, data: StartOnboardingInput) {
    const orgId = new Types.ObjectId(organizationId);
    const unit = await Unit.findOne({ _id: data.unitId, organizationId: orgId });
    if (!unit) throw new AppError(404, 'UNIT_NOT_FOUND', 'Unit not found in this organization');
    ResourceScopeService.assertUnit(auth, unit, 'onboarding.manage');
    if (unit.status !== 'VACANT') throw new AppError(409, 'UNIT_UNAVAILABLE', 'Only vacant units can be assigned during onboarding');
    const normalizedPhone = normalizePhone(data.phone);
    const existing = await TenantOnboarding.findOne({ organizationId: orgId, phone: normalizedPhone, status: { $in: ['PRE_REGISTERED', 'OTP_SENT', 'VERIFIED'] }, expiresAt: { $gt: new Date() } });
    if (existing) throw new AppError(409, 'ONBOARDING_EXISTS', 'An active onboarding record already exists for this phone number');
    const activeTenancy = await Tenancy.exists({ organizationId: orgId, unitId: unit._id, status: { $in: ['ACTIVE', 'NOTICE'] } });
    if (activeTenancy) throw new AppError(409, 'UNIT_OCCUPIED', 'Unit already has an active tenancy');
    const reservedOnboarding = await TenantOnboarding.exists({ organizationId: orgId, unitId: unit._id, status: { $in: ['PRE_REGISTERED', 'OTP_SENT', 'VERIFIED'] }, expiresAt: { $gt: new Date() } });
    if (reservedOnboarding) throw new AppError(409, 'UNIT_ONBOARDING_RESERVED', 'Unit already has an active tenant onboarding reservation');
    const onboarding = await TenantOnboarding.create({ organizationId: orgId, phone: normalizedPhone, propertyId: unit.propertyId, buildingId: unit.buildingId, floorId: unit.floorId, unitId: unit._id, status: 'PRE_REGISTERED', expiresAt: new Date(Date.now() + data.expiresInDays * 86_400_000), initiatedBy: auth.userId, createdBy: auth.userId, updatedBy: auth.userId, metadata: { firstName: data.firstName, lastName: data.lastName, email: data.email } });
    return { onboardingId: onboarding._id, phone: onboarding.phone, unitId: onboarding.unitId, expiresAt: onboarding.expiresAt, status: onboarding.status };
  }

  static async sendOtp(auth: AuthenticatedUser, onboardingId: string) {
    const onboarding = await TenantOnboarding.findById(onboardingId);
    if (!onboarding) throw new AppError(404, 'NOT_FOUND', 'Onboarding record not found');
    ResourceScopeService.assertUnit(auth, onboarding, 'onboarding.manage');
    if (onboarding.expiresAt <= new Date()) { onboarding.status = 'EXPIRED'; await onboarding.save(); throw new AppError(410, 'ONBOARDING_EXPIRED', 'Onboarding record has expired'); }
    if (!['PRE_REGISTERED', 'OTP_SENT'].includes(onboarding.status)) throw new AppError(409, 'INVALID_ONBOARDING_STATE', 'OTP cannot be sent in the current state');
    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    onboarding.otpHash = await bcrypt.hash(otp, 12);
    onboarding.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
    onboarding.otpAttempts = 0;
    onboarding.status = 'OTP_SENT';
    onboarding.updatedBy = auth.userId;
    await onboarding.save();
    if (env.NODE_ENV === 'production') {
      await getSmsProvider().send({
        to: onboarding.phone,
        body: `Your Property Command Center onboarding code is ${otp}. It expires in 10 minutes. Do not share this code.`,
      });
    }
    return { onboardingId: onboarding._id, expiresAt: onboarding.otpExpiresAt, ...(env.NODE_ENV !== 'production' ? { developmentOtp: otp } : {}) };
  }

  static async verify(data: VerifyOnboardingInput) {
    const phone = normalizePhone(data.phone);
    const onboarding = await TenantOnboarding.findOne({ phone, status: 'OTP_SENT', expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
    if (!onboarding) throw new AppError(404, 'ONBOARDING_NOT_FOUND', 'No active tenant onboarding was found for this phone number');
    if (!onboarding.otpHash || !onboarding.otpExpiresAt || onboarding.otpExpiresAt <= new Date()) throw new AppError(410, 'OTP_EXPIRED', 'OTP has expired');
    if (onboarding.otpAttempts >= MAX_ATTEMPTS) throw new AppError(429, 'OTP_ATTEMPTS_EXCEEDED', 'Too many OTP attempts');
    const valid = await bcrypt.compare(data.otp, onboarding.otpHash);
    if (!valid) { onboarding.otpAttempts += 1; await onboarding.save(); throw new AppError(401, 'INVALID_OTP', 'Invalid OTP'); }
    const unit = await Unit.findOne({ _id: onboarding.unitId, organizationId: onboarding.organizationId });
    if (!unit || unit.status !== 'VACANT') throw new AppError(409, 'UNIT_UNAVAILABLE', 'The assigned unit is no longer available');
    const metadataValue = onboarding.get('metadata') as unknown;
    const metadata = metadataValue instanceof Map ? Object.fromEntries(metadataValue) : metadataValue as Record<string, unknown> | undefined;
    const firstName = typeof metadata?.firstName === 'string' ? metadata.firstName : 'Tenant';
    const lastName = typeof metadata?.lastName === 'string' ? metadata.lastName : 'User';
    const email = typeof metadata?.email === 'string' ? metadata.email : undefined;
    const user = await User.findOne({ phone }).exec() ?? await User.create({ phone, firstName, lastName, ...(email ? { email } : {}), verifiedAt: new Date() });
    const tenant = await Tenant.findOne({ organizationId: onboarding.organizationId, userId: user._id }).exec() ?? await Tenant.create({ organizationId: onboarding.organizationId, userId: user._id, status: 'PROSPECT', createdBy: onboarding.initiatedBy, updatedBy: onboarding.initiatedBy });
    const tenantRole = await Role.findOne({ key: 'TENANT', $or: [{ organizationId: null }, { organizationId: onboarding.organizationId }] }).sort({ organizationId: 1 }).exec();
    if (!tenantRole) throw new AppError(500, 'TENANT_ROLE_MISSING', 'System TENANT role is not configured');
    await OrganizationMembership.updateOne({ userId: user._id, organizationId: onboarding.organizationId }, { $set: { roleIds: [tenantRole._id], scope: { allProperties: false, propertyIds: [], buildingIds: [], unitIds: [onboarding.unitId] }, status: 'ACTIVE', invitedBy: onboarding.initiatedBy, joinedAt: new Date() } }, { upsert: true });
    onboarding.tenantUserId = user._id;
    onboarding.tenantId = tenant._id;
    onboarding.status = 'COMPLETED';
    onboarding.verifiedAt = new Date();
    onboarding.completedAt = new Date();
    onboarding.set('otpHash', undefined);
    onboarding.set('otpExpiresAt', undefined);
    onboarding.updatedBy = onboarding.initiatedBy;
    await onboarding.save();
    return { userId: user._id, tenantId: tenant._id, organizationId: onboarding.organizationId, propertyId: onboarding.propertyId, buildingId: onboarding.buildingId, floorId: onboarding.floorId, unitId: onboarding.unitId, message: 'Tenant verified and locked to the assigned unit. The tenant can now authenticate using the normal phone OTP login flow.' };
  }

  static async get(auth: AuthenticatedUser, onboardingId: string) {
    const onboarding = await TenantOnboarding.findById(onboardingId);
    if (!onboarding) throw new AppError(404, 'NOT_FOUND', 'Onboarding record not found');
    ResourceScopeService.assertUnit(auth, onboarding, 'onboarding.view');
    return onboarding;
  }
}
