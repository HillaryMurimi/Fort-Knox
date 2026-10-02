import bcrypt from 'bcryptjs';
import { randomBytes, randomInt } from 'node:crypto';
import mongoose, { type Types } from 'mongoose';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/AppError.js';
import { User } from '../../database/models/User.js';
import { OtpChallenge } from '../../database/models/OtpChallenge.js';
import { AdminAuthFlow } from '../../database/models/AdminAuthFlow.js';
import { getEmailProvider, getSmsProvider } from '../../core/integrations/messaging-providers.js';
import { authEvidence, adminOtpDigest, contactsHash, hashCredential, maskEmail, maskPhone, securityAudit, type AuthMetadata } from './admin-security.js';

type Channel = 'EMAIL' | 'SMS';
const adminOtpPurpose = (purpose: 'LOGIN' | 'STEP_UP' | 'ENROLLMENT') => ({ LOGIN: 'ADMIN_LOGIN', STEP_UP: 'ADMIN_STEP_UP', ENROLLMENT: 'ADMIN_ENROLLMENT' } as const)[purpose];
type Flow = NonNullable<Awaited<ReturnType<typeof AdminAuthFlow.findOne>>>;
type Account = NonNullable<Awaited<ReturnType<typeof User.findOne>>>;
// Tests capture actual randomly generated codes in memory. No fixed codes, public
// capture endpoint, environment bypass, logs or plaintext database/outbox values.
let testDelivery: ((channel: Channel, destination: string, code: string) => Promise<void>) | undefined;
export function setAdminMfaTestDelivery(deliver?: typeof testDelivery) {
  if (env.NODE_ENV !== 'test') throw new Error('MFA delivery injection requires NODE_ENV=test');
  testDelivery = deliver;
}
export async function registerAdminFailure(userId: Types.ObjectId, meta: AuthMetadata, reason: 'PASSWORD' | 'OTP', channel?: Channel) {
  const now = new Date(), cutoff = new Date(Date.now() - env.ADMIN_LOCKOUT_SECONDS * 1000);
  const account = await User.findOneAndUpdate({ _id: userId }, [
    { $set: { authFailureCount: { $cond: [{ $gt: ['$authFailureWindowAt', cutoff] }, { $add: [{ $ifNull: ['$authFailureCount', 0] }, 1] }, 1] },
      authFailureWindowAt: { $cond: [{ $gt: ['$authFailureWindowAt', cutoff] }, '$authFailureWindowAt', now] } } },
    { $set: { authLockedUntil: { $cond: [{ $gte: ['$authFailureCount', env.ADMIN_MAX_FAILURES] }, new Date(Date.now() + env.ADMIN_LOCKOUT_SECONDS * 1000), '$authLockedUntil'] } } }
  ], { new: true, updatePipeline: true });
  await securityAudit(reason === 'PASSWORD' ? 'password_failed' : 'otp_failed', userId, meta, { reason, ...(channel ? { channel } : {}) });
  if (account?.authLockedUntil && account.authLockedUntil > now) {
    await AdminAuthFlow.updateMany({ userId, stage: { $in: ['EMAIL', 'SMS', 'VERIFIED'] } }, { $set: { stage: 'INVALIDATED' } });
    await securityAudit('lockout', userId, meta, { seconds: env.ADMIN_LOCKOUT_SECONDS });
  }
}
function assertAccount(account: Account, flow?: Flow) {
  if (!account.isPlatformAdmin || account.status !== 'ACTIVE' || !account.email || !account.phone)
    throw new AppError(401, 'MFA_INVALID', 'Authentication is no longer valid. Sign in again.');
  if (account.authLockedUntil && account.authLockedUntil > new Date())
    throw new AppError(429, 'ADMIN_LOCKED', 'Too many authentication failures. Try again after the temporary lockout.');
  const currentHash = contactsHash(account.email, account.phone);
  if (flow && (flow.contactsHash !== currentHash || flow.authVersion !== (account.authVersion ?? 0) || flow.userFlowGeneration !== account.authFlowGeneration))
    throw new AppError(401, 'MFA_INVALID', 'Account security details changed. Sign in again.');
  if ((!flow || flow.purpose !== 'ENROLLMENT') &&
      (!account.emailVerifiedAt || !account.phoneVerifiedAt || account.mfaContactsHash !== currentHash))
    throw new AppError(403, 'ADMIN_ENROLLMENT_REQUIRED', 'Both administrator channels require secure enrollment. Contact the authorized platform operator.');
}
async function getFlow(token: string) {
  const flow = await AdminAuthFlow.findOne({ tokenHash: hashCredential(token), expiresAt: { $gt: new Date() }, stage: { $in: ['EMAIL', 'SMS', 'VERIFIED'] } });
  if (!flow) throw new AppError(401, 'MFA_EXPIRED', 'Authentication expired or was superseded. Sign in again.');
  const account = await User.findById(flow.userId).select('+mfaContactsHash');
  if (!account) throw new AppError(401, 'MFA_INVALID', 'Authentication is no longer valid.');
  assertAccount(account, flow);
  return { flow, account };
}
async function describe(flow: Flow, account: Account, token: string) {
  const channel = flow.stage === 'EMAIL' ? 'EMAIL' : 'SMS';
  const challenge = await OtpChallenge.findOne({ flowId: flow._id, channel, generation: flow.generation }).lean();
  return { mfaRequired: true as const, flowToken: token, stage: flow.stage, challenge: {
    channel, destination: channel === 'EMAIL' ? maskEmail(authEvidence(account.email)) : maskPhone(account.phone),
    expiresAt: challenge?.expiresAt?.toISOString() ?? flow.expiresAt.toISOString(),
    resendAt: flow.nextSendAt.toISOString(), delivery: challenge?.deliveryStatus ?? 'FAILED'
  } };
}
async function send(flow: Flow, account: Account, token: string, meta: AuthMetadata, resend: boolean) {
  const channel: Channel = flow.stage === 'EMAIL' ? 'EMAIL' : 'SMS';
  const now = new Date();
  const reserved = await AdminAuthFlow.findOneAndUpdate({ _id: flow._id, stage: flow.stage, generation: flow.generation,
    nextSendAt: { $lte: now }, resendCount: { $lt: env.ADMIN_MAX_RESENDS }, expiresAt: { $gt: now } },
    { $set: { nextSendAt: new Date(Date.now() + env.ADMIN_RESEND_SECONDS * 1000) }, $inc: { generation: 1, ...(resend ? { resendCount: 1 } : {}) } }, { new: true });
  if (!reserved) { await securityAudit('resend_throttled', account._id, meta, { channel }); throw new AppError(429, 'MFA_RESEND_THROTTLED', 'Please wait before requesting another code, or start a new sign-in after the resend limit.'); }
  const windowStart = new Date(Date.now() - env.ADMIN_LOCKOUT_SECONDS * 1000);
  await User.updateOne({ _id: account._id, $or: [{ authSendWindowAt: { $lte: windowStart } }, { authSendWindowAt: { $exists: false } }] },
    { $set: { authSendWindowAt: now, authSendCount: 0 } });
  const budget = await User.findOneAndUpdate({ _id: account._id, authSendCount: { $lt: env.ADMIN_MAX_SENDS } }, { $inc: { authSendCount: 1 } });
  if (!budget) {
    await securityAudit('delivery_rate_limited', account._id, meta);
    throw new AppError(429, 'MFA_DELIVERY_THROTTLED', 'Too many code requests. Try again after the temporary delivery limit.');
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0'), codeHash = await bcrypt.hash(adminOtpDigest(String(flow._id), channel, code), 12);
  await OtpChallenge.updateMany({ flowId: flow._id, channel, consumedAt: { $exists: false } }, { $set: { consumedAt: now } });
  const challenge = await OtpChallenge.create({ phone: account.phone, userId: account._id, flowId: flow._id, channel, generation: reserved.generation,
    purpose: adminOtpPurpose(flow.purpose), codeHash, deliveryStatus: 'PENDING', nextVerifyAt: now,
    expiresAt: new Date(Math.min(flow.expiresAt.getTime(), Date.now() + env.ADMIN_OTP_TTL_SECONDS * 1000)) });
  try {
    const destination = channel === 'EMAIL' ? authEvidence(account.email) : account.phone;
    if (testDelivery) await testDelivery(channel, destination, code);
    else {
      const body = 'Your Property Command Center administrator ' + channel.toLowerCase() + ' verification code is ' + code +
        '. It expires in ' + Math.ceil(env.ADMIN_OTP_TTL_SECONDS / 60) + ' minutes. Never share it.';
      if (channel === 'EMAIL') await getEmailProvider().send({ to: destination, subject: 'Administrator sign-in verification', body });
      else await getSmsProvider().send({ to: destination, body });
    }
    await OtpChallenge.updateOne({ _id: challenge._id, consumedAt: { $exists: false } }, { $set: { deliveryStatus: 'SENT' } });
    await securityAudit(channel === 'EMAIL' ? 'email_otp_issued' : 'sms_otp_issued', account._id, meta, { purpose: flow.purpose });
  } catch {
    await OtpChallenge.updateOne({ _id: challenge._id }, { $set: { deliveryStatus: 'FAILED', consumedAt: new Date() } });
    await securityAudit('delivery_failed', account._id, meta, { channel });
  }
  if (resend) await securityAudit('otp_resend', account._id, meta, { channel });
  return describe(reserved, account, token);
}
export async function startAdminMfa(userId: Types.ObjectId, meta: AuthMetadata = {}, options: { purpose?: 'LOGIN' | 'STEP_UP' | 'ENROLLMENT'; sessionId?: Types.ObjectId } = {}) {
  const account = await User.findById(userId).select('+mfaContactsHash');
  if (!account) throw new AppError(401, 'MFA_INVALID', 'Authentication is no longer valid.');
  const purpose = options.purpose ?? 'LOGIN';
  // ENROLLMENT is exposed only by the explicit host-operator CLI.
  if (purpose === 'ENROLLMENT') {
    if (!account.isPlatformAdmin || account.status !== 'ACTIVE' || !account.email || !account.phone)
      throw new AppError(403, 'ADMIN_ENROLLMENT_REQUIRED', 'An existing active administrator with both destinations is required.');
    if (account.authLockedUntil && account.authLockedUntil > new Date()) throw new AppError(429, 'ADMIN_LOCKED', 'Administrator temporarily locked.');
  } else assertAccount(account);
  await AdminAuthFlow.updateMany({ userId, purpose, stage: { $in: ['EMAIL', 'SMS', 'VERIFIED'] } }, { $set: { stage: 'INVALIDATED' } });
  const generation = await User.findOneAndUpdate({ _id: userId }, { $inc: { authFlowGeneration: 1 } }, { new: true });
  const token = randomBytes(32).toString('base64url');
  const flow = await AdminAuthFlow.create({ userId, tokenHash: hashCredential(token), purpose, stage: 'EMAIL',
    contactsHash: contactsHash(authEvidence(account.email), account.phone), authVersion: account.authVersion ?? 0, userFlowGeneration: authEvidence(generation).authFlowGeneration,
    passwordVerifiedAt: new Date(), nextSendAt: new Date(), expiresAt: new Date(Date.now() + env.ADMIN_FLOW_SECONDS * 1000),
    ...(options.sessionId ? { sessionId: options.sessionId } : {}) });
  return send(flow, account, token, meta, false);
}
export async function resendAdminMfa(token: string, meta: AuthMetadata = {}) {
  const { flow, account } = await getFlow(token);
  if (!['EMAIL', 'SMS'].includes(flow.stage)) throw new AppError(409, 'MFA_STAGE_INVALID', 'This authentication stage is complete.');
  return send(flow, account, token, meta, true);
}
export async function verifyAdminMfa(token: string, channel: Channel, code: string, meta: AuthMetadata = {}) {
  const { flow, account } = await getFlow(token);
  if (flow.stage !== channel) throw new AppError(409, 'MFA_STAGE_INVALID', 'Complete the current authentication stage first.');
  const now = new Date();
  const challenge = await OtpChallenge.findOneAndUpdate({ flowId: flow._id, userId: account._id, channel, generation: flow.generation,
    purpose: adminOtpPurpose(flow.purpose), deliveryStatus: 'SENT', consumedAt: { $exists: false }, expiresAt: { $gt: now },
    attempts: { $lt: env.OTP_MAX_ATTEMPTS }, nextVerifyAt: { $lte: now } },
    { $inc: { attempts: 1 }, $set: { nextVerifyAt: new Date(Date.now() + env.ADMIN_VERIFY_SECONDS * 1000) } }, { new: true });
  if (!challenge) {
    await securityAudit('verification_rate_limited_or_expired', account._id, meta, { channel });
    const current = await OtpChallenge.findOne({ flowId: flow._id, channel, generation: flow.generation }).lean();
    if (current?.expiresAt && current.expiresAt <= now) throw new AppError(401, 'MFA_CODE_EXPIRED', 'This code expired. Request a new code for this stage.');
    if (current?.deliveryStatus === 'FAILED') throw new AppError(503, 'MFA_DELIVERY_FAILED', 'Code delivery failed. Retry delivery after the resend countdown.');
    if (current?.consumedAt) throw new AppError(401, 'MFA_CODE_REUSED', 'This code has already been used.');
    if (current && current.attempts >= env.OTP_MAX_ATTEMPTS) throw new AppError(429, 'MFA_ATTEMPTS_EXHAUSTED', 'Too many attempts for this code. Request a new code after the cooldown.');
    throw new AppError(429, 'MFA_VERIFY_THROTTLED', 'Verification is temporarily limited. Wait a few seconds before trying again.');
  }
  if (!(await bcrypt.compare(adminOtpDigest(String(flow._id), channel, code), challenge.codeHash))) {
    await registerAdminFailure(account._id, meta, 'OTP', channel);
    throw new AppError(401, 'MFA_CODE_INVALID', 'The verification code is incorrect.');
  }
  const claimed = await OtpChallenge.findOneAndUpdate({ _id: challenge._id, consumedAt: { $exists: false }, expiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date() } });
  if (!claimed) throw new AppError(401, 'MFA_CODE_REUSED', 'This verification code has already been used.');
  const advanced = await AdminAuthFlow.findOneAndUpdate({ _id: flow._id, stage: channel, generation: challenge.generation },
    { $set: channel === 'EMAIL' ? { stage: 'SMS', emailVerifiedAt: new Date(), nextSendAt: new Date(), resendCount: 0 } : { stage: 'VERIFIED', smsVerifiedAt: new Date() } }, { new: true });
  if (!advanced) throw new AppError(401, 'MFA_INVALID', 'Authentication was superseded. Sign in again.');
  await securityAudit('otp_verified', account._id, meta, { channel, purpose: flow.purpose });
  if (channel === 'EMAIL') return { complete: false as const, challenge: await send(advanced, account, token, meta, false) };
  return { complete: true as const, flowId: flow._id, userId: account._id, purpose: flow.purpose };
}
export async function finishAdminEnrollment(flowId: Types.ObjectId, caseId: string, meta: AuthMetadata = {}) {
  await mongoose.connection.transaction(async session => {
    const flow = await AdminAuthFlow.findOneAndUpdate({ _id: flowId, purpose: 'ENROLLMENT', stage: 'VERIFIED', expiresAt: { $gt: new Date() },
      emailVerifiedAt: { $exists: true }, smsVerifiedAt: { $exists: true } }, { $set: { stage: 'COMPLETED' } }, { new: true, session });
    if (!flow) throw new AppError(401, 'MFA_INVALID', 'Enrollment evidence is no longer valid.');
    const account = await User.findOne({ _id: flow.userId, status: 'ACTIVE', isPlatformAdmin: true, $or: [{ authVersion: flow.authVersion }, ...(flow.authVersion === 0 ? [{ authVersion: { $exists: false } }] : [])] }).session(session);
    if (!account || account.authFlowGeneration !== flow.userFlowGeneration || contactsHash(authEvidence(account.email), account.phone) !== flow.contactsHash) throw new AppError(401, 'MFA_INVALID', 'Security destinations changed.');
    account.emailVerifiedAt = flow.emailVerifiedAt; account.phoneVerifiedAt = flow.smsVerifiedAt; account.mfaContactsHash = flow.contactsHash;
    account.authVersion = (account.authVersion ?? 0) + 1; account.authFailureCount = 0;
    await account.save({ session });
    await import('../../database/models/RefreshSession.js').then(({ RefreshSession }) => RefreshSession.updateMany({ userId: account._id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } }, { session }));
    await import('../audit/audit.service.js').then(({ AuditService }) => AuditService.record({ actorUserId: account._id, actorRole: 'SUPER_ADMIN',
      action: 'auth.super_admin.channels_enrolled', resourceType: 'User', resourceId: account._id, metadata: { caseId, mechanism: 'HOST_OPERATOR_DUAL_CHANNEL_PROOF' }, ...meta }, session));
  });
}
