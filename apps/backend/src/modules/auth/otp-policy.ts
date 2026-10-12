import { createHmac } from 'node:crypto';
import type { ClientSession } from 'mongoose';
import { env } from '../../config/env.js';
import { PlatformSwitch } from '../../database/models/PlatformSwitch.js';
import { User } from '../../database/models/User.js';
import { AppError } from '../../core/errors/AppError.js';
import type { OtpChannel } from './otp-delivery.js';

export const otpSwitch = (channel: OtpChannel) => channel === 'EMAIL' ? 'EMAIL_OTP' : 'SMS_OTP';
export const deliverySwitch = (channel: OtpChannel) => channel === 'EMAIL' ? 'EMAIL_NOTIFICATIONS' : 'SMS_NOTIFICATIONS';
export function providerConfigured(channel: OtpChannel) {
  if (env.NODE_ENV === 'test') return true;
  if (channel === 'EMAIL') return !!(env.EMAIL_FROM && (env.EMAIL_PROVIDER === 'RESEND' ? env.RESEND_API_KEY : env.SENDGRID_API_KEY) &&
    (env.NODE_ENV !== 'production' || env.EMAIL_DOMAIN_VERIFIED && env.EMAIL_SENDING_DOMAIN === env.EMAIL_FROM.split('@')[1]));
  return !!(env.TWILIO_ACCOUNT_SID && /^AC[a-f0-9]{32}$/i.test(env.TWILIO_ACCOUNT_SID) && env.TWILIO_AUTH_TOKEN && /^\+[1-9]\d{6,14}$/.test(env.SMS_FROM ?? ''));
}
export function providerFingerprint(channel: OtpChannel) {
  const values = channel === 'EMAIL' ? [env.EMAIL_PROVIDER, env.EMAIL_FROM, env.EMAIL_FROM_NAME, env.EMAIL_SENDING_DOMAIN, env.EMAIL_DOMAIN_VERIFIED, env.EMAIL_PROVIDER === 'RESEND' ? env.RESEND_API_KEY : env.SENDGRID_API_KEY] :
    [env.SMS_PROVIDER, env.SMS_FROM, env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN];
  return createHmac('sha256', env.JWT_REFRESH_SECRET).update(JSON.stringify(values)).digest('hex');
}
export async function channelAvailable(channel: OtpChannel, session?: ClientSession) {
  if (!(channel === 'EMAIL' ? env.EMAIL_ENABLED : env.SMS_ENABLED) || !providerConfigured(channel)) return false;
  const rows = await PlatformSwitch.find({ key: { $in: [otpSwitch(channel), deliverySwitch(channel)] } }).select('+deliveryConfigHash').session(session ?? null).lean();
  const otp = rows.find(row => row.key === otpSwitch(channel)), delivery = rows.find(row => row.key === deliverySwitch(channel));
  if (delivery ? !delivery.enabled || delivery.mode !== 'ON' : channel === 'SMS' && env.NODE_ENV === 'production') return false;
  if (otp ? !otp.enabled || otp.mode !== 'ON' : channel === 'SMS' && env.NODE_ENV === 'production') return false;
  if (channel === 'SMS' && env.NODE_ENV === 'production' && (!otp?.deliveryVerifiedAt || otp.deliveryConfigHash !== providerFingerprint(channel) || otp.deliveryEnvironment !== (env.LAUNCH_READINESS_ENV ?? env.NODE_ENV))) return false;
  return true;
}
export async function availableChannels(session?: ClientSession) {
  const candidates = ['EMAIL', 'SMS'] as const;
  if (session) {
    const enabled: OtpChannel[] = [];
    // MongoDB transaction operations on one session must run sequentially.
    for (const channel of candidates) if (await channelAvailable(channel, session)) enabled.push(channel);
    return enabled;
  }
  const available = await Promise.all(candidates.map(channel => channelAvailable(channel, session)));
  return candidates.filter((_, index) => available[index]);
}
export async function assertOtpAvailable(channel: OtpChannel) {
  if (!(await channelAvailable(channel))) throw new AppError(503, 'OTP_CHANNEL_UNAVAILABLE', 'This verification channel is disabled or is not ready. Choose an available channel.');
}
export async function validateOtpSwitchChange(key: string, mode: string, session: ClientSession) {
  const channel: OtpChannel = key.startsWith('EMAIL') ? 'EMAIL' : 'SMS';
  if (![otpSwitch(channel), deliverySwitch(channel)].includes(key)) return;
  if (mode === 'ON') {
    if (!(channel === 'EMAIL' ? env.EMAIL_ENABLED : env.SMS_ENABLED) || !providerConfigured(channel))
      throw new AppError(409, 'OTP_PROVIDER_NOT_READY', 'Configure the provider, verified sender and runtime enable flag before activation.');
    if (key === otpSwitch(channel) || channel === 'SMS') {
      const proof = await PlatformSwitch.findOne({ key: otpSwitch(channel) }).select('+deliveryConfigHash').session(session);
      if (!proof?.deliveryVerifiedAt || proof.deliveryConfigHash !== providerFingerprint(channel) || proof.deliveryEnvironment !== (env.LAUNCH_READINESS_ENV ?? env.NODE_ENV))
        throw new AppError(409, 'OTP_DELIVERY_NOT_TESTED', 'Complete a real receipt verification with the current provider configuration before enabling this channel.');
    }
    return;
  }
  const alternate: OtpChannel = channel === 'EMAIL' ? 'SMS' : 'EMAIL';
  if (!(await channelAvailable(alternate, session))) throw new AppError(409, 'OTP_LOCKOUT_PREVENTED', 'This is the last available verification channel.');
  const field = alternate === 'EMAIL' ? 'email' : 'phone';
  const verification = alternate === 'EMAIL' ? 'emailVerifiedAt' : 'phoneVerifiedAt';
  const stranded = await User.exists({ status: 'ACTIVE', $or: [
    { [field]: { $exists: false } }, { [field]: { $in: ['', null] } },
    { [verification]: { $exists: false } }
  ] }).session(session);
  if (stranded) throw new AppError(409, 'OTP_ACCOUNT_LOCKOUT_PREVENTED', 'Some active accounts cannot use the remaining channel. Enroll them before disabling this channel.');
}
