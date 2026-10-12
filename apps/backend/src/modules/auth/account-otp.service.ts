import bcrypt from "bcryptjs";
import { randomBytes, randomInt } from "node:crypto";
import mongoose, { type Types, type ClientSession } from "mongoose";
import { env } from "../../config/env.js";
import { AppError } from "../../core/errors/AppError.js";
import { OtpChallenge } from "../../database/models/OtpChallenge.js";
import { Organization } from "../../database/models/Organization.js";
import { User } from "../../database/models/User.js";
import { AuditService } from "../audit/audit.service.js";
import { issueSession } from "./auth.service.js";
import {
  adminOtpDigest,
  authEvidence,
  contactsHash,
  hashCredential,
  maskEmail,
  maskPhone,
  type AuthMetadata,
} from "./admin-security.js";
import { assertOtpAvailable, availableChannels } from "./otp-policy.js";
import { deliverOtp, type OtpChannel } from "./otp-delivery.js";

type Challenge = NonNullable<Awaited<ReturnType<typeof OtpChallenge.findOne>>>;
type Account = NonNullable<Awaited<ReturnType<typeof User.findOne>>>;
const genericError = () =>
  new AppError(
    401,
    "OTP_INVALID",
    "The code is invalid, expired or no longer available.",
  );
const audit = (
  action: string,
  userId: Types.ObjectId | undefined,
  meta: AuthMetadata,
  metadata: Record<string, unknown> = {},
  session?: ClientSession,
) =>
  AuditService.record(
    {
      actorUserId: userId,
      action: "auth.otp." + action,
      resourceType: "Authentication",
      requestId: meta.requestId,
      metadata,
    },
    session,
  );
function response(
  challenge: Challenge,
  token: string,
  account?: Account | null,
) {
  const channel =
    challenge.channel === "SMS" ? ("SMS" as const) : ("EMAIL" as const);
  return {
    accountOtpRequired: true as const,
    challengeToken: token,
    challenge: {
      channel,
      // Before password verification the shape/destination does not reveal whether an account exists.
      destination:
        challenge.passwordVerifiedAt && account
          ? channel === "EMAIL"
            ? maskEmail(account.email ?? "")
            : maskPhone(account.phone)
          : channel === "EMAIL"
            ? "your registered email"
            : "your registered phone",
      expiresAt: challenge.expiresAt.toISOString(),
      resendAt: (challenge.nextSendAt ?? challenge.expiresAt).toISOString(),
      delivery: challenge.deliveryStatus ?? "SENT",
    },
  };
}
async function getChallenge(token: string) {
  const challenge = await OtpChallenge.findOne({
    tokenHash: hashCredential(token),
    purpose: { $in: ["LOGIN", "STEP_UP"] },
    consumedAt: { $exists: false },
    flowExpiresAt: { $gt: new Date() },
  }).select("+contactsHash +tokenHash");
  if (!challenge) throw genericError();
  const account = challenge.userId
    ? await User.findById(challenge.userId)
    : null;
  if (
    account &&
    (account.isPlatformAdmin ||
      account.status !== "ACTIVE" ||
      account.authVersion !== challenge.authVersion ||
      account.authFlowGeneration !== challenge.authGeneration ||
      contactsHash(account.email ?? "", account.phone) !==
        challenge.contactsHash ||
      (account.authLockedUntil && account.authLockedUntil > new Date()))
  )
    throw genericError();
  return { challenge, account };
}
async function send(
  challenge: Challenge,
  account: Account | null,
  token: string,
  channel: OtpChannel,
  meta: AuthMetadata,
  resend: boolean,
) {
  await assertOtpAvailable(channel);
  const now = new Date();
  const reserved = await OtpChallenge.findOneAndUpdate(
    {
      _id: challenge._id,
      generation: challenge.generation,
      consumedAt: { $exists: false },
      nextSendAt: { $lte: now },
      resendCount: { $lt: 3 },
      flowExpiresAt: { $gt: now },
    },
    {
      $inc: { generation: 1, ...(resend ? { resendCount: 1 } : {}) },
      $set: {
        channel,
        nextSendAt: new Date(Date.now() + 60_000),
        nextVerifyAt: now,
        deliveryStatus: "PENDING",
        expiresAt: new Date(
          Math.min(
            authEvidence(challenge.flowExpiresAt).getTime(),
            Date.now() + env.OTP_TTL_SECONDS * 1000,
          ),
        ),
      },
    },
    { new: true },
  );
  if (!reserved)
    throw new AppError(
      429,
      "OTP_RESEND_THROTTLED",
      "Wait for the resend countdown, or restart sign-in after the resend limit.",
    );
  if (account) {
    const cutoff = new Date(Date.now() - 900_000);
    await User.updateOne(
      {
        _id: account._id,
        $or: [
          { authSendWindowAt: { $lte: cutoff } },
          { authSendWindowAt: { $exists: false } },
        ],
      },
      { $set: { authSendWindowAt: now, authSendCount: 0 } },
    );
    const budget = await User.findOneAndUpdate(
      { _id: account._id, authSendCount: { $lt: 10 } },
      { $inc: { authSendCount: 1 } },
    );
    if (!budget) {
      await audit("delivery_throttled", account._id, meta);
      throw new AppError(
        429,
        "OTP_DELIVERY_THROTTLED",
        "Too many code requests. Try again later.",
      );
    }
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const codeHash = await bcrypt.hash(
    adminOtpDigest(
      String(challenge._id) +
        ":" +
        challenge.purpose +
        ":" +
        reserved.generation,
      channel,
      code,
    ),
    12,
  );
  await OtpChallenge.updateOne(
    { _id: reserved._id, generation: reserved.generation },
    { $set: { codeHash } },
  );
  const destination = channel === "EMAIL" ? account?.email : account?.phone;
  let delivery: "SENT" | "FAILED" = "SENT";
  if (destination) {
    try {
      await deliverOtp(channel, destination, code, env.OTP_TTL_SECONDS);
    } catch {
      delivery = "FAILED";
    }
  }
  await OtpChallenge.updateOne(
    {
      _id: reserved._id,
      generation: reserved.generation,
      consumedAt: { $exists: false },
    },
    { $set: { deliveryStatus: delivery } },
  );
  reserved.deliveryStatus = delivery;
  await audit(
    delivery === "FAILED" ? "delivery_failed" : resend ? "resent" : "issued",
    account?._id,
    meta,
    { channel, delivery, purpose: challenge.purpose },
  );
  return response(reserved, token, account);
}
export async function startAccountOtp(
  userId: Types.ObjectId | undefined,
  passwordVerified: boolean,
  preferred?: OtpChannel,
  meta: AuthMetadata = {},
) {
  const channels = await availableChannels();
  const channel = preferred ?? channels[0];
  if (!channel)
    throw new AppError(
      503,
      "OTP_CHANNEL_UNAVAILABLE",
      "Verification is temporarily unavailable. Contact your administrator.",
    );
  const account = userId
    ? await User.findOne({
        _id: userId,
        status: "ACTIVE",
        isPlatformAdmin: false,
      })
    : null;
  if (account?.authLockedUntil && account.authLockedUntil > new Date())
    throw new AppError(
      429,
      "OTP_LOCKED",
      "Authentication is temporarily locked. Try again later.",
    );
  const token = randomBytes(32).toString("base64url"),
    now = new Date(),
    purpose = passwordVerified ? "STEP_UP" : "LOGIN";
  let generation = 0;
  if (account) {
    const updated = await User.findOneAndUpdate(
      { _id: account._id },
      { $inc: { authFlowGeneration: 1 } },
      { new: true },
    );
    generation = authEvidence(updated).authFlowGeneration;
    await OtpChallenge.updateMany(
      {
        userId: account._id,
        purpose: { $in: ["LOGIN", "STEP_UP"] },
        tokenHash: { $exists: true },
        consumedAt: { $exists: false },
      },
      { $set: { consumedAt: now } },
    );
  }
  const challenge = await OtpChallenge.create({
    phone: account?.phone ?? "unresolved",
    userId: account?._id,
    tokenHash: hashCredential(token),
    contactsHash: account
      ? contactsHash(account.email ?? "", account.phone)
      : undefined,
    authVersion: account?.authVersion ?? 0,
    authGeneration: generation,
    generation: 0,
    purpose,
    ...(passwordVerified ? { passwordVerifiedAt: now } : {}),
    channel,
    codeHash: hashCredential(randomBytes(32).toString("hex")),
    nextSendAt: now,
    nextVerifyAt: now,
    expiresAt: new Date(Date.now() + env.OTP_TTL_SECONDS * 1000),
    flowExpiresAt: new Date(Date.now() + 900_000),
  });
  return send(challenge, account, token, channel, meta, false);
}
export async function resendAccountOtp(
  token: string,
  channel?: OtpChannel,
  meta: AuthMetadata = {},
) {
  const { challenge, account } = await getChallenge(token);
  return send(
    challenge,
    account,
    token,
    channel ?? (challenge.channel === "SMS" ? "SMS" : "EMAIL"),
    meta,
    true,
  );
}
export async function verifyAccountOtp(
  token: string,
  channel: OtpChannel,
  code: string,
  meta: AuthMetadata = {},
) {
  await assertOtpAvailable(channel);
  const { challenge, account } = await getChallenge(token);
  if (!account || challenge.channel !== channel) throw genericError();
  const now = new Date();
  const reserved = await OtpChallenge.findOneAndUpdate(
    {
      _id: challenge._id,
      generation: challenge.generation,
      channel,
      deliveryStatus: "SENT",
      consumedAt: { $exists: false },
      expiresAt: { $gt: now },
      attempts: { $lt: env.OTP_MAX_ATTEMPTS },
      nextVerifyAt: { $lte: now },
    },
    {
      $inc: { attempts: 1 },
      $set: { nextVerifyAt: new Date(Date.now() + 2000) },
    },
    { new: true },
  );
  if (!reserved) {
    if (challenge.deliveryStatus === "FAILED")
      throw new AppError(
        503,
        "OTP_DELIVERY_FAILED",
        "Delivery failed. Retry after the resend countdown or choose another enabled channel.",
      );
    if (challenge.expiresAt <= now)
      throw new AppError(
        401,
        "OTP_EXPIRED",
        "The code expired. Request a new code.",
      );
    throw new AppError(
      429,
      "OTP_VERIFY_THROTTLED",
      "Verification is limited. Wait before retrying or request a new code after the countdown.",
    );
  }
  if (
    !(await bcrypt.compare(
      adminOtpDigest(
        String(reserved._id) +
          ":" +
          reserved.purpose +
          ":" +
          reserved.generation,
        channel,
        code,
      ),
      reserved.codeHash,
    ))
  ) {
    await User.updateOne(
      { _id: account._id },
      { $inc: { authFailureCount: 1 } },
    );
    const failures = await User.findById(account._id).select(
      "+authFailureCount",
    );
    if ((failures?.authFailureCount ?? 0) >= env.OTP_MAX_ATTEMPTS)
      await User.updateOne(
        { _id: account._id },
        { $set: { authLockedUntil: new Date(Date.now() + 900_000) } },
      );
    await audit("verification_failed", account._id, meta, { channel });
    throw genericError();
  }
  let result: Awaited<ReturnType<typeof issueSession>> | undefined;
  await mongoose.connection.transaction(async (session) => {
    const claimed = await OtpChallenge.findOneAndUpdate(
      {
        _id: reserved._id,
        generation: reserved.generation,
        consumedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      },
      { $set: { consumedAt: new Date() } },
      { new: true, session },
    );
    const current = await User.findOne({
      _id: account._id,
      status: "ACTIVE",
      isPlatformAdmin: false,
      authVersion: challenge.authVersion,
      authFlowGeneration: challenge.authGeneration,
    }).session(session);
    if (
      !claimed ||
      !current ||
      contactsHash(current.email ?? "", current.phone) !==
        challenge.contactsHash ||
      (current.authLockedUntil && current.authLockedUntil > new Date())
    )
      throw genericError();
    if (reserved.purpose === "STEP_UP" && !reserved.passwordVerifiedAt)
      throw genericError();
    const firstEmailProof = channel === "EMAIL" && !current.emailVerifiedAt;
    current.set(
      channel === "EMAIL" ? "emailVerifiedAt" : "phoneVerifiedAt",
      new Date(),
    );
    current.verifiedAt ??= new Date();
    current.lastLoginAt = new Date();
    current.authFailureCount = 0;
    await current.save({ session });
    if (firstEmailProof) {
      const orgs = await Organization.find({
        "onboarding.ownerUserId": current._id,
      })
        .select("_id")
        .session(session);
      for (const org of orgs)
        await AuditService.publish(
          {
            organizationId: org._id,
            name: "landlord.email.verified",
            aggregateType: "Organization",
            aggregateId: org._id,
            payload: {},
          },
          session,
        );
    }
    result = await issueSession(current._id, meta, session);
    await audit(
      "verified",
      current._id,
      meta,
      { channel, purpose: reserved.purpose },
      session,
    );
  });
  if (!result) throw genericError();
  return result;
}
