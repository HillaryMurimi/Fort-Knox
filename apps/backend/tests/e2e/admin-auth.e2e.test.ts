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

describe.skipIf(!process.env.RUN_E2E)('SUPER_ADMIN dual-channel authentication HTTP / Mongo E2E', () => {
  let mongo: MongoMemoryReplSet, userId: Types.ObjectId, password: string;
  let delivered: Record<string, string>, deliveryFails: string | undefined;
  const required = <T>(value: T | null | undefined): T => { if (value == null) throw new Error('Missing test evidence'); return value; };
  const app = createApp(), base = '/api/v1/auth', origin = () => ({ Origin: env.WEB_ORIGIN, 'X-PCC-Auth': '1' });
  const call = (path: string, body: unknown) => request(app).post(base + path).set(origin()).send(body);
  const login = () => call('/login', { method: 'email', email: 'security-admin@example.test', password });
  const verify = (flowToken: string, channel: 'EMAIL' | 'SMS', code = delivered[channel]) => call('/admin-mfa/verify', { flowToken, channel, code });
  async function fullLogin() {
    const first = await login(); expect(first.status).toBe(200);
    const email = await verify(first.body.data.flowToken, 'EMAIL'); expect(email.status).toBe(200);
    const sms = await verify(first.body.data.flowToken, 'SMS'); expect(sms.status, JSON.stringify(sms.body)).toBe(200); return Object.assign(sms, { flowToken: first.body.data.flowToken as string });
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
  it('establishes a session only after password, independent email and SMS challenges', async () => {
    const first = await login(), flowToken = first.body.data.flowToken;
    expect(first.body.data).toMatchObject({ mfaRequired: true, stage: 'EMAIL', challenge: { destination: 's***@example.test', delivery: 'SENT' } });
    expect(first.body.data.user).toBeUndefined(); expect(first.headers['set-cookie']).toBeUndefined();
    expect(await RefreshSession.countDocuments()).toBe(0);
    expect(delivered.SMS).toBeUndefined();
    const email = await verify(flowToken, 'EMAIL');
    expect(email.body.data).toMatchObject({ stage: 'SMS', challenge: { channel: 'SMS' } });
    expect(email.body.data.accessToken).toBeUndefined(); expect(await RefreshSession.countDocuments()).toBe(0);
    const sms = await verify(flowToken, 'SMS');
    expect(sms.body.data.roles).toContain('SUPER_ADMIN'); expect(sms.body.data.refreshToken).toBeUndefined();
    expect(sms.headers['set-cookie'][0]).toMatch(/HttpOnly/); expect(sms.headers['set-cookie'][0]).toMatch(/SameSite=Strict/);
    expect((await platform(sms.body.data.accessToken)).status).toBe(200);
    const entries = await OtpChallenge.find().lean();
    expect(entries).toHaveLength(2); expect(entries.every(entry => !!entry.consumedAt)).toBe(true);
    expect(entries.map(entry => entry.channel).sort()).toEqual(['EMAIL', 'SMS']);
    for (const entry of entries) { expect(entry.codeHash).not.toBe(delivered[required(entry.channel)]); expect(await bcrypt.compare(adminOtpDigest(String(entry.flowId), required(entry.channel), delivered[required(entry.channel)]), entry.codeHash)).toBe(true); }
  });
  it('rejects an incorrect password without issuing an OTP', async () => {
    password = randomBytes(12).toString('hex'); expect((await login()).status).toBe(401);
    expect(await OtpChallenge.countDocuments()).toBe(0); expect(await AuditLog.countDocuments({ action: 'auth.super_admin.password_failed' })).toBe(1);
  });
  it.each(['EMAIL', 'SMS'] as const)('rejects an incorrect %s OTP', async channel => {
    const first = await login(); if (channel === 'SMS') await verify(first.body.data.flowToken, 'EMAIL');
    const wrong = delivered[channel] === '000000' ? '000001' : '000000';
    expect((await verify(first.body.data.flowToken, channel, wrong)).status).toBe(401);
    expect(await RefreshSession.countDocuments()).toBe(0);
  });
  it('cannot skip the email stage', async () => { const first = await login(); expect((await verify(first.body.data.flowToken, 'SMS', '000000')).status).toBe(409); });
  it('cannot replay the email code after reaching SMS', async () => { const first = await login(); await verify(first.body.data.flowToken, 'EMAIL'); expect((await verify(first.body.data.flowToken, 'EMAIL')).status).toBe(409); });
  it('cannot replay a completed authentication', async () => { const result = await fullLogin(); const flow = await AdminAuthFlow.findOne(); expect(flow?.stage).toBe('COMPLETED'); expect(await RefreshSession.countDocuments()).toBe(1); expect(result.body.data.accessToken).toBeTruthy(); expect((await verify(result.flowToken, 'SMS')).status).toBe(401); });
  it('invalidates an older flow when password login is repeated', async () => { const first = await login(); await login(); expect((await verify(first.body.data.flowToken, 'EMAIL')).status).toBe(401); });
  it('expires flows', async () => { const first = await login(); await AdminAuthFlow.updateMany({}, { $set: { expiresAt: new Date(0) } }); expect((await verify(first.body.data.flowToken, 'EMAIL')).status).toBe(401); });
  it.each(['EMAIL', 'SMS'] as const)('expires %s codes without granting a session', async channel => {
    const first = await login(); if (channel === 'SMS') await verify(first.body.data.flowToken, 'EMAIL');
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
    deliveryFails = channel; const first = await login();
    const result = channel === 'EMAIL' ? first : await verify(first.body.data.flowToken, 'EMAIL');
    expect(result.body.data.challenge.delivery).toBe('FAILED');
    expect((await verify(first.body.data.flowToken, channel, '000000')).status).not.toBe(200);
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
    const first = await login(); expect((await platform(first.body.data.flowToken)).status).toBe(401);
    await verify(first.body.data.flowToken, 'EMAIL'); expect((await platform(first.body.data.flowToken)).status).toBe(401);
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
  });
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
    for (const secret of [password, delivered.EMAIL, delivered.SMS, result.body.data.accessToken]) expect(retained).not.toContain(secret);
    expect(notices.every(n => n.body.includes('unverified'))).toBe(true);
  });
  it('rolls back session creation if the audit write fails', async () => {
    const first = await login(); await verify(first.body.data.flowToken, 'EMAIL');
    const record = AuditService.record.bind(AuditService);
    vi.spyOn(AuditService, 'record').mockImplementation((input, session) => input.action === 'auth.super_admin.login_completed' ? Promise.reject(new Error('Audit fixture unavailable')) : record(input, session));
    expect((await verify(first.body.data.flowToken, 'SMS')).status).toBe(500);
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
  });
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
    expect(await OtpChallenge.countDocuments({ channel: 'SMS' })).toBe(1);
  });
  it('promotes future administrators only with fresh, audited authority and requires new enrollment', async () => {
    const first = await fullLogin();
    const target = await User.create({ email: 'future-admin@example.test', phone: '+254700009803', firstName: 'Future', lastName: 'Fixture', passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 10) });
    const promoted = await request(app).post(base + '/platform-admins').set(origin()).auth(first.body.data.accessToken, { type: 'bearer' }).send({ userId: String(target._id), confirm: true, reason: 'Approved security test account' });
    expect(promoted.status).toBe(201); expect((await User.findById(target._id))?.isPlatformAdmin).toBe(true);
    expect((await User.findById(target._id))?.emailVerifiedAt).toBeUndefined();
    expect(await AuditLog.countDocuments({ action: 'auth.super_admin.account_promoted' })).toBe(1);
  });
  it('never exposes codes, flow credentials or passwords in authentication error logging', async () => {
    const { logger } = await import('../../src/core/logging/logger.js');
    const warnings = vi.spyOn(logger, 'warn');
    const first = await login();
    await verify(first.body.data.flowToken, 'SMS', '000000');
    const log = JSON.stringify(warnings.mock.calls);
    for (const secret of [password, first.body.data.flowToken, delivered.EMAIL]) expect(log.includes(secret)).toBe(false);
    expect(log).toContain('MFA_STAGE_INVALID');
  });

});
