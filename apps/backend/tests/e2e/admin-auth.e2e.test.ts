import { ipKeyGenerator } from 'express-rate-limit';
import { authRateLimit, publicRateLimit } from '../../src/core/api/rate-limits.js';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { User } from '../../src/database/models/User.js';
import { Role } from '../../src/database/models/Role.js';
import { OrganizationMembership } from '../../src/database/models/OrganizationMembership.js';
import { OtpChallenge } from '../../src/database/models/OtpChallenge.js';
import { AdminAuthFlow } from '../../src/database/models/AdminAuthFlow.js';
import { RefreshSession } from '../../src/database/models/RefreshSession.js';
import { AuditLog } from '../../src/database/models/AuditLog.js';
import { Notification } from '../../src/database/models/Notification.js';
import { Job } from '../../src/database/models/Job.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { setAdminMfaTestDelivery, startAdminMfa, finishAdminEnrollment } from '../../src/modules/auth/admin-mfa.service.js';
import { adminOtpDigest, contactsHash, hashCredential } from '../../src/modules/auth/admin-security.js';
import { issueSession } from '../../src/modules/auth/auth.service.js';

describe.skipIf(!process.env.RUN_E2E)('SUPER_ADMIN selectable login and dual-channel step-up HTTP / Mongo E2E', () => {
  let mongo: MongoMemoryReplSet, userId: Types.ObjectId, password: string;
  let delivered: Record<string, string>, deliveryFails: string | undefined;
  const required = <T>(value: T | null | undefined): T => { if (value == null) throw new Error('Missing test evidence'); return value; };
  const app = createApp(), base = '/api/v1/auth', origin = () => ({ Origin: env.WEB_ORIGIN, 'X-PCC-Auth': '1' });
  const call = (path: string, body: unknown) => request(app).post(base + path).set(origin()).send(body);
  const passwordLogin = () => call('/login', { method: 'email', email: 'security-admin@example.test', password });
  const choose = (flowToken: string, channel: 'EMAIL' | 'SMS') => call('/admin-mfa/channel', { flowToken, channel });
  async function login(channel: 'EMAIL' | 'SMS' = 'EMAIL') {
    const first = await passwordLogin();
    if (first.status !== 200) return first;
    return choose(first.body.data.flowToken, channel);
  }
  const verify = (flowToken: string, channel: 'EMAIL' | 'SMS', code = delivered[channel]) => call('/admin-mfa/verify', { flowToken, channel, code });
  async function fullLogin(channel: 'EMAIL' | 'SMS' = 'EMAIL') {
    const first = await login(channel); expect(first.status).toBe(200);
    const result = await verify(first.body.data.flowToken, channel);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    return Object.assign(result, { flowToken: first.body.data.flowToken as string });
  }
  async function dualLogin() {
    const first = await fullLogin();
    const step = await request(app).post(base + '/admin-mfa/step-up').set(origin()).auth(first.body.data.accessToken, { type: 'bearer' }).send({ password });
    expect(step.status).toBe(200);
    expect((await verify(step.body.data.flowToken, 'EMAIL')).status).toBe(200);
    const result = await verify(step.body.data.flowToken, 'SMS'); expect(result.status).toBe(200);
    return result;
  }
  const platform = (token: string) => request(app).get('/api/v1/platform-control/switches').auth(token, { type: 'bearer' });
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : {} });
    await mongoose.connect(mongo.getUri('property-admin-auth-test'), { autoIndex: false });
    for (const model of Object.values(mongoose.models)) await model.createCollection();
    for (const model of [User, Role, OtpChallenge, AdminAuthFlow, RefreshSession, Notification, Job]) await model.createIndexes();
  }, 180000);
  beforeEach(async () => {
    for (const ip of ['127.0.0.1', '::ffff:127.0.0.1', '::1']) { authRateLimit.resetKey(ipKeyGenerator(ip)); publicRateLimit.resetKey(ipKeyGenerator(ip)); }
    for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
    password = randomBytes(24).toString('base64url'); delivered = {}; deliveryFails = undefined;
    const now = new Date();
    const user = await User.create({ email: 'security-admin@example.test', phone: '+254700009801', firstName: 'Security', lastName: 'Fixture',
      isPlatformAdmin: true, passwordHash: await bcrypt.hash(password, 10), emailVerifiedAt: now, phoneVerifiedAt: now,
      mfaContactsHash: contactsHash('security-admin@example.test', '+254700009801') });
    userId = user._id;
    setAdminMfaTestDelivery(async (channel, _destination, code) => { if (deliveryFails === channel) throw new Error('Fixture delivery unavailable'); delivered[channel] = code; });
  });
  afterEach(() => { setAdminMfaTestDelivery(); vi.restoreAllMocks(); });
  afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
  it.each(['EMAIL', 'SMS'] as const)('establishes a session only after password and selected %s OTP', async channel => {
    const first = await passwordLogin(), flowToken = first.body.data.flowToken;
    expect(first.body.data).toMatchObject({ mfaRequired: true, stage: 'CHANNEL', channels: [
      { channel: 'EMAIL', destination: 's***@example.test' }, { channel: 'SMS', destination: '+254 *** *** **' }
    ] });
    expect(first.body.data.user).toBeUndefined(); expect(first.headers['set-cookie']).toBeUndefined();
    expect(await RefreshSession.countDocuments()).toBe(0); expect(await OtpChallenge.countDocuments()).toBe(0);
    const selected = await choose(flowToken, channel);
    expect(selected.body.data).toMatchObject({ stage: channel, requiredChannels: 'ONE', challenge: { channel, delivery: 'SENT' } });
    expect(selected.body.data.accessToken).toBeUndefined(); expect(await RefreshSession.countDocuments()).toBe(0);
    const result = await verify(flowToken, channel);
    expect(result.body.data.roles).toContain('SUPER_ADMIN'); expect(result.body.data.refreshToken).toBeUndefined();
    expect(result.headers['set-cookie'][0]).toMatch(/HttpOnly/); expect(result.headers['set-cookie'][0]).toMatch(/SameSite=Strict/);
    expect((await platform(result.body.data.accessToken)).status).toBe(200);
    const entries = await OtpChallenge.find().lean(); expect(entries).toHaveLength(1);
    expect(entries[0]?.consumedAt).toBeTruthy(); expect(entries[0]?.channel).toBe(channel);
    expect(Object.keys(delivered)).toEqual([channel]);
    for (const entry of entries) { expect(entry.codeHash).not.toBe(delivered[channel]); expect(await bcrypt.compare(adminOtpDigest(String(entry.flowId), channel, delivered[channel]), entry.codeHash)).toBe(true); }
    const session = await RefreshSession.findOne().lean(); expect(session?.mfaChannel).toBe(channel);
    expect(channel === 'EMAIL' ? session?.smsVerifiedAt : session?.emailVerifiedAt).toBeUndefined();
    const event = await AuditLog.findOne({ action: 'auth.super_admin.login_completed' }).lean();
    expect(event?.metadata?.channels).toEqual([channel]);
  });
  it('rejects an incorrect password without issuing an OTP', async () => {
    password = randomBytes(12).toString('hex'); expect((await login()).status).toBe(401);
    expect(await OtpChallenge.countDocuments()).toBe(0); expect(await AuditLog.countDocuments({ action: 'auth.super_admin.password_failed' })).toBe(1);
  });
  it.each(['EMAIL', 'SMS'] as const)('rejects an incorrect %s OTP', async channel => {
    const first = await login(channel);
    const wrong = delivered[channel] === '000000' ? '000001' : '000000';
    expect((await verify(first.body.data.flowToken, channel, wrong)).status).toBe(401);
    expect(await RefreshSession.countDocuments()).toBe(0);
  });
  it('cannot verify an unselected channel', async () => { const first = await login(); expect((await verify(first.body.data.flowToken, 'SMS', '000000')).status).toBe(409); });
  it('cannot replay email during dual-channel step-up after reaching SMS', async () => {
    const first = await fullLogin();
    const step = await request(app).post(base + '/admin-mfa/step-up').set(origin()).auth(first.body.data.accessToken, { type: 'bearer' }).send({ password });
    await verify(step.body.data.flowToken, 'EMAIL'); expect((await verify(step.body.data.flowToken, 'EMAIL')).status).toBe(409);
  });
  it('cannot replay a completed authentication', async () => { const result = await fullLogin(); const flow = await AdminAuthFlow.findOne(); expect(flow?.stage).toBe('COMPLETED'); expect(await RefreshSession.countDocuments()).toBe(1); expect(result.body.data.accessToken).toBeTruthy(); expect((await verify(result.flowToken, 'EMAIL')).status).toBe(401); });
  it('invalidates an older flow when password login is repeated', async () => { const first = await login(); await login(); expect((await verify(first.body.data.flowToken, 'EMAIL')).status).toBe(401); });
  it('expires flows', async () => { const first = await login(); await AdminAuthFlow.updateMany({}, { $set: { expiresAt: new Date(0) } }); expect((await verify(first.body.data.flowToken, 'EMAIL')).status).toBe(401); });
  it.each(['EMAIL', 'SMS'] as const)('expires %s codes without granting a session', async channel => {
    const first = await login(channel);
    await OtpChallenge.updateMany({ channel }, { $set: { expiresAt: new Date(0) } }); expect((await verify(first.body.data.flowToken, channel)).status).not.toBe(200);
    expect(await RefreshSession.countDocuments()).toBe(0);
  });
  it('throttles resend and invalidates the superseded code', async () => {
    const first = await login(), old = delivered.EMAIL;
    expect((await call('/admin-mfa/resend', { flowToken: first.body.data.flowToken })).status).toBe(429);
    await AdminAuthFlow.updateMany({}, { $set: { nextSendAt: new Date(0) } });
    expect((await call('/admin-mfa/resend', { flowToken: first.body.data.flowToken })).status).toBe(200);
    const oldChallenge = await OtpChallenge.findOne({ generation: 1 });
    expect(oldChallenge?.consumedAt).toBeTruthy();
    // Assert hash invalidation instead of assuming two independent draws differ.
    expect(await bcrypt.compare(adminOtpDigest(String(required(oldChallenge).flowId), 'EMAIL', old), required(oldChallenge).codeHash)).toBe(true);
    expect((await verify(first.body.data.flowToken, 'EMAIL')).status).toBe(200);
  });
  it('caps resends even when the cooldown has passed', async () => {
    const first = await login(); await AdminAuthFlow.updateMany({}, { $set: { nextSendAt: new Date(0), resendCount: env.ADMIN_MAX_RESENDS } });
    expect((await call('/admin-mfa/resend', { flowToken: first.body.data.flowToken })).status).toBe(429);
  });
  it('throttles repeated verification attempts', async () => {
    const first = await login(), wrong = delivered.EMAIL === '000000' ? '000001' : '000000';
    expect((await verify(first.body.data.flowToken, 'EMAIL', wrong)).status).toBe(401);
    expect((await verify(first.body.data.flowToken, 'EMAIL', wrong)).status).toBe(429);
  });
  it('locks the account after repeated failures and does not reset failure counts on password success', async () => {
    const first = await login(), wrong = delivered.EMAIL === '000000' ? '000001' : '000000';
    for (let index = 0; index < env.ADMIN_MAX_FAILURES; index++) {
      await OtpChallenge.updateMany({}, { $set: { nextVerifyAt: new Date(0) } }); await verify(first.body.data.flowToken, 'EMAIL', wrong);
    }
    expect((await login()).status).toBe(429); expect(await AuditLog.countDocuments({ action: 'auth.super_admin.lockout' })).toBeGreaterThan(0);
  });
  it('caps per-code attempts independently of account limits', async () => {
    const first = await login(); await OtpChallenge.updateMany({}, { $set: { attempts: env.OTP_MAX_ATTEMPTS } });
    expect((await verify(first.body.data.flowToken, 'EMAIL')).status).toBe(429);
  });
  it('caps delivery across repeated password logins', async () => {
    await User.updateOne({ _id: userId }, { $set: { authSendWindowAt: new Date(), authSendCount: env.ADMIN_MAX_SENDS } });
    expect((await login()).status).toBe(429);
  });
  it('fails closed if either administrator channel was not verified', async () => {
    await User.updateOne({ _id: userId }, { $unset: { phoneVerifiedAt: 1 } });
    expect((await login()).body.error.code).toBe('ADMIN_ENROLLMENT_REQUIRED');
  });
  it.each(['EMAIL', 'SMS'] as const)('handles %s delivery failure without session issuance', async channel => {
    deliveryFails = channel; const result = await login(channel);
    expect(result.body.data.challenge.delivery).toBe('FAILED');
    expect((await verify(result.body.data.flowToken, channel, '000000')).status).not.toBe(200);
    expect(await RefreshSession.countDocuments()).toBe(0);
  });
  it('recovers provider delivery through a throttled resend', async () => {
    deliveryFails = 'EMAIL'; const first = await login(); deliveryFails = undefined;
    await AdminAuthFlow.updateMany({}, { $set: { nextSendAt: new Date(0) } });
    const resent = await call('/admin-mfa/resend', { flowToken: first.body.data.flowToken }); expect(resent.body.data.challenge.delivery).toBe('SENT');
    expect((await verify(first.body.data.flowToken, 'EMAIL')).status).toBe(200);
  });
  it('denies legacy OTP routes and central generic session issuance for administrators', async () => {
    expect((await call('/otp/request', { phone: '+254700009801' })).status).toBe(403);
    expect((await call('/login', { method: 'phone', phone: '+254700009801' })).status).toBe(400);
    expect((await call('/verify-step-up', { email: 'security-admin@example.test', code: '000000' })).status).toBe(403);
    await expect(issueSession(userId)).rejects.toMatchObject({ code: 'ADMIN_MFA_REQUIRED' });
  });
  it('denies old bare access tokens and old refresh sessions', async () => {
    const token = jwt.sign({ sub: String(userId), type: 'access' }, env.JWT_ACCESS_SECRET);
    expect((await platform(token)).status).toBe(401);
    const sid = new Types.ObjectId(), refresh = jwt.sign({ sub: String(userId), sid: String(sid), type: 'refresh' }, env.JWT_REFRESH_SECRET);
    await RefreshSession.create({ _id: sid, userId, tokenHash: hashCredential(refresh), expiresAt: new Date(Date.now() + 60000) });
    const result = await request(app).post(base + '/refresh').set(origin()).set('Cookie', env.REFRESH_COOKIE_NAME + '=' + refresh);
    expect(result.status).toBe(401);
  });
  it('denies partially completed flow tokens at privileged APIs', async () => {
    const first = await passwordLogin(); expect((await platform(first.body.data.flowToken)).status).toBe(401);
    await choose(first.body.data.flowToken, 'EMAIL'); expect((await platform(first.body.data.flowToken)).status).toBe(401);
  });
  it('denies unauthenticated platform access', async () => { expect((await request(app).get('/api/v1/platform-control/switches')).status).toBe(401); });
  it.each(['LANDLORD', 'PROPERTY_MANAGER', 'CARETAKER', 'CONTRACTOR', 'TENANT'])('denies %s platform APIs and step-up', async key => {
    await User.updateOne({ _id: userId }, { $set: { isPlatformAdmin: false } });
    const role = await Role.create({ name: key, key, system: true, organizationId: null, permissions: ['admin.platform'] });
    await OrganizationMembership.create({ organizationId: new Types.ObjectId(), userId, roleIds: [role._id], scope: { allProperties: true } });
    const token = jwt.sign({ sub: String(userId), type: 'access' }, env.JWT_ACCESS_SECRET);
    expect((await platform(token)).status).toBe(403);
    expect((await request(app).post(base + '/admin-mfa/step-up').set(origin()).auth(token, { type: 'bearer' }).send({ password })).status).toBe(403);
  });
  it('revokes access immediately on logout', async () => {
    const result = await fullLogin(), token = result.body.data.accessToken;
    const logout = await request(app).post(base + '/logout').set(origin()).set('Cookie', result.headers['set-cookie']);
    expect(logout.status).toBe(200); expect((await platform(token)).status).toBe(401);
    expect(await AuditLog.countDocuments({ action: 'auth.super_admin.logout' })).toBe(1);
  });
  it.each(['lastActivityAt', 'absoluteExpiresAt', 'expiresAt'])('enforces server-side %s expiry', async field => {
    const result = await fullLogin(); await RefreshSession.updateMany({}, { $set: { [field]: new Date(0) } }); expect((await platform(result.body.data.accessToken)).status).toBe(401);
    if (field === 'lastActivityAt') expect(await AuditLog.countDocuments({ action: 'auth.super_admin.session_expired' })).toBe(1);
  });
  it('denies changes to verified destinations mid-flow', async () => {
    const first = await login(); await User.updateOne({ _id: userId }, { $set: { phone: '+254700009802' } }); expect((await verify(first.body.data.flowToken, 'EMAIL')).status).toBe(401);
  });
  it('requires fresh MFA for service-switch security changes', async () => {
    const result = await fullLogin(); await RefreshSession.updateMany({}, { $set: { mfaVerifiedAt: new Date(Date.now() - 400000) } });
    const change = await request(app).patch('/api/v1/platform-control/switches/SMS_NOTIFICATIONS').auth(result.body.data.accessToken, { type: 'bearer' }).send({ mode: 'OFF', confirm: true, reason: 'Security test change' });
    expect(change.status).toBe(403); expect(change.body.error.code).toBe('FRESH_AUTH_REQUIRED');
  });
  it('completes sensitive step-up using both channels without extending absolute lifetime', async () => {
    const result = await fullLogin(), parent = await RefreshSession.findOne();
    const step = await request(app).post(base + '/admin-mfa/step-up').set(origin()).auth(result.body.data.accessToken, { type: 'bearer' }).send({ password });
    await verify(step.body.data.flowToken, 'EMAIL'); const complete = await verify(step.body.data.flowToken, 'SMS');
    expect(complete.status).toBe(200); expect((await platform(result.body.data.accessToken)).status).toBe(401);
    const current = await RefreshSession.findOne({ revokedAt: { $exists: false } }); expect(current?.absoluteExpiresAt).toEqual(parent?.absoluteExpiresAt);
    // Selected-channel login plus dual-channel step-up retain the real bcrypt work and session-expiry assertions.
  }, 15000);
  it('enforces origin and custom-header CSRF controls on privileged cookie operations', async () => {
    const result = await fullLogin();
    expect((await request(app).post(base + '/refresh').set('Cookie', result.headers['set-cookie'])).status).toBe(403);
    expect((await request(app).post(base + '/logout').set('Origin', 'https://foreign.example.test').set('X-PCC-Auth', '1').set('Cookie', result.headers['set-cookie'])).status).toBe(403);
  });
  it('rotates privileged tokens without extending lifetime or freshness', async () => {
    const result = await fullLogin(), parent = await RefreshSession.findOne();
    const next = await request(app).post(base + '/refresh').set(origin()).set('Cookie', result.headers['set-cookie']);
    expect(next.status).toBe(200); expect((await platform(result.body.data.accessToken)).status).toBe(401);
    const current = await RefreshSession.findOne({ revokedAt: { $exists: false } });
    expect(current?.absoluteExpiresAt).toEqual(parent?.absoluteExpiresAt); expect(current?.mfaVerifiedAt).toEqual(parent?.mfaVerifiedAt);
  });
  it('queues both security notifications and delivery jobs with no OTP or token content', async () => {
    const result = await fullLogin(), notices = await Notification.find().lean(), jobs = await Job.find({ type: 'notification.send' }).lean();
    expect(notices).toHaveLength(2); expect(jobs).toHaveLength(2);
    const retained = JSON.stringify({ notices, jobs, audit: await AuditLog.find().lean() });
    for (const secret of [password, ...Object.values(delivered), result.body.data.accessToken]) expect(retained).not.toContain(secret);
    expect(notices.every(n => n.body.includes('unverified'))).toBe(true);
  });
  it('rolls back session creation if the audit write fails', async () => {
    const first = await login();
    const record = AuditService.record.bind(AuditService);
    vi.spyOn(AuditService, 'record').mockImplementation((input, session) => input.action === 'auth.super_admin.login_completed' ? Promise.reject(new Error('Audit fixture unavailable')) : record(input, session));
    expect((await verify(first.body.data.flowToken, 'EMAIL')).status).toBe(500);
    expect(await RefreshSession.countDocuments()).toBe(0); expect(await Notification.countDocuments()).toBe(0);
  });
  it('binds codes to account and purpose; rejects identity overrides', async () => {
    const first = await login();
    expect((await call('/admin-mfa/verify', { flowToken: first.body.data.flowToken, channel: 'EMAIL', code: delivered.EMAIL, userId: String(new Types.ObjectId()) })).status).toBe(400);
    const challenge = await OtpChallenge.findOne(); expect(String(challenge?.userId)).toBe(String(userId)); expect(challenge?.purpose).toBe('ADMIN_LOGIN');
  });
  it('secure host enrollment grants no session and requires both channels', async () => {
    await User.updateOne({ _id: userId }, { $unset: { phoneVerifiedAt: 1, emailVerifiedAt: 1, mfaContactsHash: 1 } });
    const first = await startAdminMfa(userId, {}, { purpose: 'ENROLLMENT' });
    // CLI-only service, never a login-purpose proof.
    const { verifyAdminMfa } = await import('../../src/modules/auth/admin-mfa.service.js');
    await verifyAdminMfa(first.flowToken, 'EMAIL', delivered.EMAIL);
    const complete = await verifyAdminMfa(first.flowToken, 'SMS', delivered.SMS);
    if (!complete.complete) throw new Error('Fixture did not complete');
    await finishAdminEnrollment(complete.flowId, 'case-fixture-0001');
    expect(await RefreshSession.countDocuments()).toBe(0); expect((await fullLogin()).status).toBe(200);
    // Enrollment retains both production-strength OTP checks; normal login verifies its selected channel.
  }, 15000);
  it('revokes active privileged sessions on reuse of a rotated refresh token', async () => {
    const first = await fullLogin();
    const next = await request(app).post(base + '/refresh').set(origin()).set('Cookie', first.headers['set-cookie']);
    expect(next.status).toBe(200);
    expect((await request(app).post(base + '/refresh').set(origin()).set('Cookie', first.headers['set-cookie'])).status).toBe(401);
    expect((await platform(next.body.data.accessToken)).status).toBe(401);
  });
  it('does not allow another administrator to revoke a foreign session', async () => {
    const first = await fullLogin();
    const foreign = await RefreshSession.create({ userId: new Types.ObjectId(), tokenHash: randomBytes(32).toString('hex'), privileged: true, expiresAt: new Date(Date.now() + 60000) });
    const denied = await request(app).post(base + '/sessions/' + foreign._id + '/revoke').set(origin()).auth(first.body.data.accessToken, { type: 'bearer' }).send({});
    expect(denied.status).toBe(404); expect((await RefreshSession.findById(foreign._id))?.revokedAt).toBeUndefined();
  });
  it('revokes all own sessions and pending flows', async () => {
    const first = await fullLogin(); const pending = await login();
    const revoked = await request(app).post(base + '/logout-all').set(origin()).auth(first.body.data.accessToken, { type: 'bearer' }).send({});
    expect(revoked.status).toBe(200); expect((await platform(first.body.data.accessToken)).status).toBe(401);
    expect((await verify(pending.body.data.flowToken, 'EMAIL')).status).toBe(401);
  });
  it('allows only one concurrent verification to consume a challenge', async () => {
    const first = await login();
    const responses = await Promise.all([verify(first.body.data.flowToken, 'EMAIL'), verify(first.body.data.flowToken, 'EMAIL')]);
    expect(responses.filter(result => result.status === 200)).toHaveLength(1);
    expect(await OtpChallenge.countDocuments({ channel: 'SMS' })).toBe(0);
    expect(await RefreshSession.countDocuments()).toBe(1);
  });
  it('promotes future administrators only with fresh, audited authority and requires new enrollment', async () => {
    const first = await dualLogin();
    const target = await User.create({ email: 'future-admin@example.test', phone: '+254700009803', firstName: 'Future', lastName: 'Fixture', passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 10) });
    const promoted = await request(app).post(base + '/platform-admins').set(origin()).auth(first.body.data.accessToken, { type: 'bearer' }).send({ userId: String(target._id), confirm: true, reason: 'Approved security test account' });
    expect(promoted.status).toBe(201); expect((await User.findById(target._id))?.isPlatformAdmin).toBe(true);
    expect((await User.findById(target._id))?.emailVerifiedAt).toBeUndefined();
    expect(await AuditLog.countDocuments({ action: 'auth.super_admin.account_promoted' })).toBe(1);
  }, 15000);
  it('never exposes codes, flow credentials or passwords in authentication error logging', async () => {
    const { logger } = await import('../../src/core/logging/logger.js');
    const warnings = vi.spyOn(logger, 'warn');
    const first = await login();
    await verify(first.body.data.flowToken, 'SMS', '000000');
    const log = JSON.stringify(warnings.mock.calls);
    for (const secret of [password, first.body.data.flowToken, delivered.EMAIL]) expect(log.includes(secret)).toBe(false);
    expect(log).toContain('MFA_STAGE_INVALID');
  });

  it('requires password verification before choosing a channel', async () => {
    const denied = await choose(randomBytes(32).toString('base64url'), 'SMS');
    expect(denied.status).toBe(401); expect(await OtpChallenge.countDocuments()).toBe(0);
  });
  it('requires explicit choice before code verification or resend', async () => {
    const first = await passwordLogin();
    expect((await verify(first.body.data.flowToken, 'EMAIL', '000000')).status).toBe(409);
    expect((await call('/admin-mfa/resend', { flowToken: first.body.data.flowToken })).status).toBe(409);
    expect(await OtpChallenge.countDocuments()).toBe(0); expect(await RefreshSession.countDocuments()).toBe(0);
  });
  it('rejects unknown channels and destination/policy overrides', async () => {
    const first = await passwordLogin();
    for (const body of [
      { channel: 'WHATSAPP' }, { channel: 'EMAIL', email: 'other@example.test' },
      { channel: 'SMS', phone: '+254700009899' }, { channel: 'EMAIL', purpose: 'STEP_UP' }
    ]) expect((await call('/admin-mfa/channel', { flowToken: first.body.data.flowToken, ...body })).status).toBe(400);
    expect(await OtpChallenge.countDocuments()).toBe(0);
  });
  it('allows only one channel choice across concurrent requests', async () => {
    const first = await passwordLogin();
    const results = await Promise.all([choose(first.body.data.flowToken, 'EMAIL'), choose(first.body.data.flowToken, 'SMS')]);
    expect(results.filter(result => result.status === 200)).toHaveLength(1);
    expect(results.filter(result => result.status === 409)).toHaveLength(1);
    expect(await OtpChallenge.countDocuments()).toBe(1);
  });
  it('cannot change channel after issuance or completion', async () => {
    const first = await login('SMS');
    expect((await choose(first.body.data.flowToken, 'EMAIL')).status).toBe(409);
    expect((await verify(first.body.data.flowToken, 'SMS')).status).toBe(200);
    expect((await choose(first.body.data.flowToken, 'EMAIL')).status).toBe(401);
  });
  it.each(['EMAIL', 'SMS'] as const)('preserves %s assurance through refresh without fabricating the other proof', async channel => {
    const first = await fullLogin(channel);
    const next = await request(app).post(base + '/refresh').set(origin()).set('Cookie', first.headers['set-cookie']);
    expect(next.status).toBe(200); expect((await platform(next.body.data.accessToken)).status).toBe(200);
    const current = await RefreshSession.findOne({ revokedAt: { $exists: false } }).lean();
    expect(current?.mfaChannel).toBe(channel);
    expect(channel === 'EMAIL' ? current?.smsVerifiedAt : current?.emailVerifiedAt).toBeUndefined();
    const sensitive = await request(app).patch('/api/v1/platform-control/switches/SMS_NOTIFICATIONS').auth(next.body.data.accessToken, { type: 'bearer' }).send({ mode: 'OFF', confirm: true, reason: 'Security assurance regression' });
    expect(sensitive.body.error.code).toBe('FRESH_AUTH_REQUIRED');
  });
  it.each(['EMAIL', 'SMS'] as const)('denies access and refresh when selected %s proof is missing', async channel => {
    const first = await fullLogin(channel);
    await RefreshSession.updateMany({}, { $unset: { [channel === 'EMAIL' ? 'emailVerifiedAt' : 'smsVerifiedAt']: 1 } });
    expect((await platform(first.body.data.accessToken)).status).toBe(401);
    expect((await request(app).post(base + '/refresh').set(origin()).set('Cookie', first.headers['set-cookie'])).status).toBe(401);
  });
  it('cannot use channel choice to reduce sensitive step-up to one OTP', async () => {
    const first = await fullLogin('SMS');
    const step = await request(app).post(base + '/admin-mfa/step-up').set(origin()).auth(first.body.data.accessToken, { type: 'bearer' }).send({ password });
    expect((await choose(step.body.data.flowToken, 'SMS')).status).toBe(409);
    const email = await verify(step.body.data.flowToken, 'EMAIL'); expect(email.body.data.stage).toBe('SMS');
    expect(email.body.data.accessToken).toBeUndefined();
    const parent = await RefreshSession.findOne({ revokedAt: { $exists: false } }).lean();
    expect(parent?.mfaChannel).toBe('SMS');
    expect((await verify(step.body.data.flowToken, 'SMS')).status).toBe(200);
    const upgraded = await RefreshSession.findOne({ revokedAt: { $exists: false } }).lean(); expect(upgraded?.mfaChannel).toBe('DUAL');
  }, 15000);
  it('rejects unlabeled single-channel session evidence while preserving historical dual proof', async () => {
    const first = await fullLogin();
    await RefreshSession.updateMany({}, { $unset: { mfaChannel: 1 } });
    expect((await platform(first.body.data.accessToken)).status).toBe(401);
    expect((await request(app).post(base + '/refresh').set(origin()).set('Cookie', first.headers['set-cookie'])).status).toBe(401);
    const legacy = await dualLogin();
    await RefreshSession.updateMany({ revokedAt: { $exists: false } }, { $unset: { mfaChannel: 1 } });
    expect((await platform(legacy.body.data.accessToken)).status).toBe(200);
  }, 15000);
  it('records only the selected OTP as successful in security notifications', async () => {
    await fullLogin('SMS');
    const notices = await Notification.find().lean();
    expect(notices.every(item => item.body.includes('Password and SMS OTP verification succeeded'))).toBe(true);
    expect(notices.every(item => !item.body.includes('EMAIL OTP verification succeeded'))).toBe(true);
  });

});
