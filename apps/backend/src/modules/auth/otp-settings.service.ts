import bcrypt from 'bcryptjs';
import { randomBytes, randomInt } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { AppError } from '../../core/errors/AppError.js';
import { OtpChallenge } from '../../database/models/OtpChallenge.js';
import { PlatformSwitch } from '../../database/models/PlatformSwitch.js';
import { User } from '../../database/models/User.js';
import { AuditLog } from '../../database/models/AuditLog.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import { adminOtpDigest, authEvidence, contactsHash, hashCredential, maskEmail, maskPhone } from './admin-security.js';
import { deliverOtp, type OtpChannel } from './otp-delivery.js';
import { availableChannels, providerConfigured, providerFingerprint, otpSwitch } from './otp-policy.js';
import { PlatformControlService } from '../platform-control/platform-control.service.js';

const environment = () => env.LAUNCH_READINESS_ENV ?? env.NODE_ENV;
function recent(auth: AuthenticatedUser) {
  AuthorizationService.assertPlatformAdmin(auth);
  if (!auth.sessionId || !auth.mfaVerifiedAt || Date.now() - auth.mfaVerifiedAt.getTime() >= env.ADMIN_STEP_UP_SECONDS * 1000)
    throw new AppError(403, 'FRESH_AUTH_REQUIRED', 'Sign in again before testing a security delivery channel.');
}
export class OtpSettingsService {
  static async list(auth: AuthenticatedUser) {
    AuthorizationService.assertPlatformAdmin(auth);
    const rows = await PlatformControlService.list();
    const proofs = await PlatformSwitch.find({ key: { $in: ['EMAIL_OTP', 'SMS_OTP'] } }).select('+deliveryConfigHash').lean();
    const active = await availableChannels();
    const history = await AuditLog.find({ action: { $in: ['platform.switch.enabled', 'platform.switch.disabled', 'auth.otp.provider_test_verified', 'auth.otp.provider_test_failed'] } })
      .select('action occurredAt actorUserId metadata').sort({ occurredAt: -1 }).limit(30).lean();
    const failures = await AuditLog.find({ action: { $in: ['auth.otp.delivery_failed', 'auth.super_admin.delivery_failed'] } })
      .select('action occurredAt metadata').sort({ occurredAt: -1 }).limit(20).lean();
    return { environment: environment(), channels: (['EMAIL', 'SMS'] as const).map(channel => {
      const row = rows.find(item => item.key === otpSwitch(channel)), proof = proofs.find(item => item.key === otpSwitch(channel));
      const tested = !!(proof?.deliveryVerifiedAt && proof.deliveryConfigHash === providerFingerprint(channel) && proof.deliveryEnvironment === environment());
      return { channel, provider: channel === 'EMAIL' ? env.EMAIL_PROVIDER : env.SMS_PROVIDER, configured: providerConfigured(channel),
        runtimeEnabled: channel === 'EMAIL' ? env.EMAIL_ENABLED : env.SMS_ENABLED,
        enabled: !!row?.enabled && row.mode === 'ON', available: active.includes(channel), tested,
        verifiedAt: tested ? proof?.deliveryVerifiedAt : null,
        health: tested ? 'RECEIPT_VERIFIED' : 'NOT_VERIFIED',
        productionReady: providerConfigured(channel) && tested && environment() === 'production' };
    }), history, failures, sensitivePolicy: 'PASSWORD_EMAIL_SMS', defaultChannel: 'EMAIL' };
  }
  static async startTest(auth: AuthenticatedUser, channel: OtpChannel) { recent(auth); return this.startOperatorTest(auth.userId, channel, 'AUTHENTICATED_DIAGNOSTIC'); }
  static async startOperatorTest(userId: Types.ObjectId, channel: OtpChannel, mechanism = 'HOST_OPERATOR') {
    const account = await User.findOne({ _id: userId, isPlatformAdmin: true, status: 'ACTIVE' });
    const destination = channel === 'EMAIL' ? account?.email : account?.phone;
    if (!account || !destination || !(channel === 'EMAIL' ? account.emailVerifiedAt : account.phoneVerifiedAt)) throw new AppError(409, 'VERIFIED_CONTACT_REQUIRED', 'Testing requires the existing verified administrator destination.');
    if (!providerConfigured(channel)) throw new AppError(409, 'OTP_PROVIDER_NOT_READY', 'Configure a valid provider and sender before testing.');
    const now = new Date();
    await User.updateOne({ _id: userId, $or: [{ authSendWindowAt: { $lte: new Date(Date.now() - 900_000) } }, { authSendWindowAt: { $exists: false } }] }, { $set: { authSendWindowAt: now, authSendCount: 0 } });
    if (!await User.findOneAndUpdate({ _id: userId, authSendCount: { $lt: 10 } }, { $inc: { authSendCount: 1 } })) throw new AppError(429, 'OTP_DELIVERY_THROTTLED', 'Too many provider tests. Try again later.');
    const previous = await OtpChallenge.findOne({ userId, purpose: 'CHANNEL_TEST', channel }).sort({ createdAt: -1 });
    if (previous && previous.createdAt.getTime() > Date.now() - 60_000) throw new AppError(429, 'OTP_RESEND_THROTTLED', 'Wait one minute before repeating a provider test.');
    await OtpChallenge.updateMany({ userId, purpose: 'CHANNEL_TEST', channel, consumedAt: { $exists: false } }, { $set: { consumedAt: now } });
    const token = randomBytes(32).toString('base64url'), id = new Types.ObjectId(), code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const challenge = await OtpChallenge.create({ _id: id, userId, phone: account.phone, purpose: 'CHANNEL_TEST', channel, tokenHash: hashCredential(token),
      contactsHash: contactsHash(account.email ?? '', account.phone), authVersion: account.authVersion,
      providerConfigHash: providerFingerprint(channel), codeHash: await bcrypt.hash(adminOtpDigest(String(id) + ':CHANNEL_TEST', channel, code), 12),
      deliveryStatus: 'PENDING', nextVerifyAt: now, expiresAt: new Date(Date.now() + 300_000) });
    try {
      await deliverOtp(channel, destination, code, 300, 'provider delivery test', true);
      challenge.deliveryStatus = 'SENT'; await challenge.save();
    } catch {
      challenge.deliveryStatus = 'FAILED'; challenge.consumedAt = new Date(); await challenge.save();
      await AuditService.record({ actorUserId: userId, actorRole: 'SUPER_ADMIN', action: 'auth.otp.provider_test_failed', resourceType: 'Authentication', metadata: { channel, mechanism } });
      throw new AppError(503, 'OTP_DELIVERY_FAILED', 'The provider did not accept the test. Check server configuration and provider status.');
    }
    await AuditService.record({ actorUserId: userId, actorRole: 'SUPER_ADMIN', action: 'auth.otp.provider_test_sent', resourceType: 'Authentication', metadata: { channel, mechanism } });
    return { testToken: token, channel, destination: channel === 'EMAIL' ? maskEmail(destination) : maskPhone(destination), expiresAt: challenge.expiresAt };
  }
  static async verifyTest(auth: AuthenticatedUser, token: string, code: string) { recent(auth); return this.verifyOperatorTest(auth.userId, token, code); }
  static async verifyOperatorTest(userId: Types.ObjectId, token: string, code: string) {
    const now = new Date();
    const challenge = await OtpChallenge.findOneAndUpdate({ userId, tokenHash: hashCredential(token), purpose: 'CHANNEL_TEST', deliveryStatus: 'SENT',
      consumedAt: { $exists: false }, expiresAt: { $gt: now }, attempts: { $lt: 5 }, nextVerifyAt: { $lte: now } },
      { $inc: { attempts: 1 }, $set: { nextVerifyAt: new Date(Date.now() + 2000) } }, { new: true }).select('+providerConfigHash +contactsHash');
    if (!challenge || !challenge.channel || !await bcrypt.compare(adminOtpDigest(String(challenge._id) + ':CHANNEL_TEST', challenge.channel, code), challenge.codeHash))
      throw new AppError(401, 'OTP_TEST_INVALID', 'The test code is invalid, expired, reused or temporarily limited.');
    const channel = challenge.channel;
    await PlatformControlService.ensureCatalog();
    await mongoose.connection.transaction(async session => {
      const account = await User.findOne({ _id: userId, status: 'ACTIVE', isPlatformAdmin: true, authVersion: challenge.authVersion }).session(session);
      if (!account || contactsHash(account.email ?? '', account.phone) !== challenge.contactsHash || challenge.providerConfigHash !== providerFingerprint(channel)) throw new AppError(401, 'OTP_TEST_INVALID', 'The destination or provider configuration changed.');
      if (!await OtpChallenge.findOneAndUpdate({ _id: challenge._id, consumedAt: { $exists: false }, expiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date() } }, { session })) throw new AppError(401, 'OTP_TEST_INVALID', 'Test receipt already verified.');
      const proof = await PlatformSwitch.findOneAndUpdate({ key: otpSwitch(channel) }, { $set: {
        deliveryConfigHash: providerFingerprint(channel), deliveryVerifiedAt: now, deliveryTestedBy: userId, deliveryEnvironment: environment() } }, { new: true, session });
      await AuditService.record({ actorUserId: userId, actorRole: 'SUPER_ADMIN', action: 'auth.otp.provider_test_verified', resourceType: 'PlatformSwitch', resourceId: authEvidence(proof)._id, metadata: { channel, environment: environment() } }, session);
    });
    return { channel, verified: true };
  }
}
