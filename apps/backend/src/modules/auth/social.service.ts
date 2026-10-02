import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { SocialAuthFlow } from '../../database/models/SocialAuthFlow.js';
import { SocialIdentity } from '../../database/models/SocialIdentity.js';
import { User } from '../../database/models/User.js';
import { Role } from '../../database/models/Role.js';
import { Organization } from '../../database/models/Organization.js';
import { OrganizationMembership } from '../../database/models/OrganizationMembership.js';
import { AuditLog } from '../../database/models/AuditLog.js';
import { AuditService } from '../audit/audit.service.js';
import { AppError } from '../../core/errors/AppError.js';
import { getSmsProvider } from '../../core/integrations/messaging-providers.js';
import { env } from '../../config/env.js';
import { socialAuthorizationUrl, verifySocialCode, type SocialProvider } from '../../integrations/auth/social-provider.js';
import { socialLinkSchema, socialSignupSchema } from './social.schemas.js';
import { issueSession } from './auth.service.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const opaque = () => randomBytes(32).toString('base64url');
const expired = () => new AppError(401, 'SOCIAL_FLOW_EXPIRED', 'This sign-in has expired or was already used. Start again.');
function flowFilter(token: string) {
  if (!/^[\w-]{43}$/.test(token)) throw expired();
  return { tokenHash: hash(token), expiresAt: { $gt: new Date() } };
}

export async function startSocial(provider: SocialProvider) {
  const token = opaque();
  const state = opaque();
  const nonce = opaque();
  const verifier = opaque();
  const url = await socialAuthorizationUrl(provider, state, nonce, verifier);
  await SocialAuthFlow.create({ tokenHash: hash(token), stateHash: hash(state), provider, nonce, verifier, status: 'STARTED', expiresAt: new Date(Date.now() + 600000) });
  return { token, url };
}

export async function callbackSocial(provider: SocialProvider, token: string, parameters: URLSearchParams) {
  const state = parameters.get('state');
  if (!state || state.length > 200) throw expired();
  // Claim before exchanging the code; another callback cannot reuse this browser-bound flow.
  const flow = await SocialAuthFlow.findOneAndUpdate({ ...flowFilter(token), provider, stateHash: hash(state), status: 'STARTED' }, { $set: { status: 'CONSUMED' } }, { new: true });
  if (!flow?.nonce || !flow.verifier) throw expired();
  const subject = await verifySocialCode(provider, parameters, state, flow.nonce, flow.verifier);
  const identity = await SocialIdentity.findOne({ provider, subject });
  const nextToken = opaque();
  await SocialAuthFlow.updateOne({ _id: flow._id }, { $set: { tokenHash: hash(nextToken), subject, ...(identity ? { userId: identity.userId } : {}), status: 'VERIFIED', expiresAt: new Date(Date.now() + 600000) }, $unset: { nonce: 1, verifier: 1, stateHash: 1 } });
  return nextToken;
}

export async function socialStatus(token: string) {
  const flow = await SocialAuthFlow.findOne({ ...flowFilter(token), status: { $in: ['VERIFIED', 'CHALLENGED'] } });
  if (!flow) throw expired();
  return { provider: flow.provider, requiresSignup: !flow.userId, challenged: flow.status === 'CHALLENGED', phoneSuffix: flow.phone?.slice(-4) };
}

export async function challengeSocial(token: string, input: unknown) {
  const flow = await SocialAuthFlow.findOne({ ...flowFilter(token), status: 'VERIFIED' });
  if (!flow) throw expired();
  let signup: z.infer<typeof socialSignupSchema> | undefined;
  let phone: string;
  let linkedUserId: mongoose.Types.ObjectId | undefined;
  if (flow.userId) {
    z.object({}).strict().parse(input);
    const user = await User.findOne({ _id: flow.userId, status: 'ACTIVE', isPlatformAdmin: false });
    const ownerRole = await Role.findOne({ key: 'LANDLORD', system: true, organizationId: null });
    const membership = ownerRole && await OrganizationMembership.findOne({ userId: flow.userId, roleIds: ownerRole._id, status: 'ACTIVE' });
    if (!user || !membership || !(await Organization.exists({ _id: membership.organizationId, status: 'ACTIVE' }))) throw new AppError(403, 'SOCIAL_OWNER_REQUIRED', 'An active owner account is required for social sign-in.');
    phone = user.phone;
  } else {
    if (typeof input === 'object' && input !== null && 'existingAccount' in input) {
      const credentials = socialLinkSchema.parse(input);
      const user = await User.findOne({ email: credentials.email, status: 'ACTIVE', isPlatformAdmin: false }).select('+passwordHash');
      if (!user?.passwordHash || !(await bcrypt.compare(credentials.password, user.passwordHash))) throw new AppError(401, 'LINK_CREDENTIALS_INVALID', 'The existing owner credentials are invalid.');
      const ownerRole = await Role.findOne({ key: 'LANDLORD', system: true, organizationId: null });
      const membership = ownerRole && await OrganizationMembership.findOne({ userId: user._id, roleIds: ownerRole._id, status: 'ACTIVE' });
      if (!membership || !(await Organization.exists({ _id: membership.organizationId, status: 'ACTIVE' }))) throw new AppError(403, 'SOCIAL_OWNER_REQUIRED', 'An active owner account is required for social sign-in.');
      linkedUserId = user._id;
      phone = user.phone;
    } else {
      signup = socialSignupSchema.parse(input);
      phone = signup.phone;
      // Contact matches never link an account. Existing owners must prove password and phone possession.
      if (await User.exists({ $or: [{ email: signup.email }, { phone }] })) throw new AppError(409, 'ACCOUNT_EXISTS', 'An account already exists for this email or phone. Choose Link existing owner account.');
    }
  }
  const code = env.NODE_ENV === 'production' ? String(randomInt(100000, 1000000)) : '123456';
  const codeHash = await bcrypt.hash(code, 10);
  const claimed = await SocialAuthFlow.updateOne({ _id: flow._id, status: 'VERIFIED' }, { $set: { ...signup, ...(linkedUserId ? { userId: linkedUserId } : {}), phone, codeHash, codeExpiresAt: new Date(Date.now() + env.OTP_TTL_SECONDS * 1000), status: 'CHALLENGED' } });
  if (!claimed.modifiedCount) throw expired();
  try {
    if (env.NODE_ENV === 'production') await getSmsProvider().send({ to: phone, body: `Your Fort Knox sign-in code is ${code}. It expires in ${Math.ceil(env.OTP_TTL_SECONDS / 60)} minutes. Do not share it.` });
  } catch {
    await SocialAuthFlow.updateOne({ _id: flow._id, status: 'CHALLENGED' }, { $set: { status: 'VERIFIED' }, $unset: { codeHash: 1, codeExpiresAt: 1 } });
    throw new AppError(503, 'SMS_UNAVAILABLE', 'The verification message could not be sent. Please try again.');
  }
  return { phoneSuffix: phone.slice(-4), ...(env.NODE_ENV !== 'production' ? { developmentCode: code } : {}) };
}

export async function finishSocial(token: string, code: string, meta: { userAgent?: string; ipAddress?: string }) {
  // Increment before comparing to bound concurrent failed guesses as well as sequential ones.
  const flow = await SocialAuthFlow.findOneAndUpdate({ ...flowFilter(token), status: 'CHALLENGED', codeExpiresAt: { $gt: new Date() }, attempts: { $lt: env.OTP_MAX_ATTEMPTS } }, { $inc: { attempts: 1 } }, { new: true });
  if (!flow?.codeHash || !(await bcrypt.compare(code, flow.codeHash))) throw new AppError(401, 'SOCIAL_CODE_INVALID', 'The code is invalid, expired, or the attempt limit has been reached.');
  const signup = !flow.userId;
  if (!flow.subject) throw expired();
  const userId = await mongoose.connection.transaction(async (session) => {
    const claimed = await SocialAuthFlow.updateOne({ _id: flow._id, status: 'CHALLENGED' }, { $set: { status: 'CONSUMED' }, $unset: { codeHash: 1 } }, { session });
    if (!claimed.modifiedCount) throw expired();
    if (flow.userId) {
      const user = await User.findOne({ _id: flow.userId, phone: flow.phone, status: 'ACTIVE', isPlatformAdmin: false }).session(session);
      const role = await Role.findOne({ key: 'LANDLORD', system: true, organizationId: null }).session(session);
      const membership = role && await OrganizationMembership.findOne({ userId: flow.userId, roleIds: role._id, status: 'ACTIVE' }).session(session);
      const organization = membership && await Organization.exists({ _id: membership.organizationId, status: 'ACTIVE' }).session(session);
      if (!user || !organization) throw new AppError(403, 'ACCOUNT_INACTIVE', 'Account is inactive.');
      const existingIdentity = await SocialIdentity.findOne({ provider: flow.provider, subject: flow.subject }).session(session);
      if (existingIdentity && String(existingIdentity.userId) !== String(user._id)) throw new AppError(409, 'SOCIAL_IDENTITY_CONFLICT', 'This provider identity is already linked to another account.');
      if (!existingIdentity) {
        await SocialIdentity.create([{ provider: flow.provider, subject: flow.subject!, userId: user._id }], { session });
        await AuditLog.create([{ actorUserId: user._id, organizationId: membership!.organizationId, action: 'auth.social.link', resourceType: 'User', resourceId: user._id, occurredAt: new Date(), metadata: { provider: flow.provider } }], { session });
      }
      return user._id;
    }
    const details = socialSignupSchema.parse({ firstName: flow.firstName, lastName: flow.lastName, email: flow.email, phone: flow.phone, organizationName: flow.organizationName });
    const role = await Role.findOne({ key: 'LANDLORD', system: true, organizationId: null }).session(session);
    if (!role) throw new AppError(503, 'SYSTEM_ROLE_MISSING', 'Owner setup is temporarily unavailable.');
    const [user] = await User.create([{ firstName: details.firstName, lastName: details.lastName, email: details.email, phone: details.phone, verifiedAt: new Date() }], { session });
    const [organization] = await Organization.create([{ name: details.organizationName, slug: `portfolio-${randomUUID()}`, onboarding: { state: 'ACCOUNT_CREATED' } }], { session });
    await OrganizationMembership.create([{ userId: user!._id, organizationId: organization!._id, roleIds: [role._id], scope: { allProperties: true }, joinedAt: new Date() }], { session });
    await SocialIdentity.create([{ provider: flow.provider, subject: flow.subject!, userId: user!._id }], { session });
    await AuditLog.create([{ actorUserId: user!._id, organizationId: organization!._id, action: 'auth.social.owner_created', resourceType: 'Organization', resourceId: organization!._id, occurredAt: new Date(), metadata: { provider: flow.provider } }], { session });
    return user!._id;
  });
  await AuditService.record({ actorUserId: userId, action: 'auth.social.login', resourceType: 'User', resourceId: userId, metadata: { provider: flow.provider } });
  return { ...await issueSession(userId, meta), newOwner: signup };
}
