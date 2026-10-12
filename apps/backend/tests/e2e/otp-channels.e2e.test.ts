import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { ipKeyGenerator } from 'express-rate-limit';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { env, envSchema } from '../../src/config/env.js';
import { authRateLimit, publicRateLimit } from '../../src/core/api/rate-limits.js';
import { Notification } from '../../src/database/models/Notification.js';
import { Unit } from '../../src/database/models/Unit.js';
import { TenantOnboarding } from '../../src/database/models/TenantOnboarding.js';
import { User } from '../../src/database/models/User.js';
import { Role } from '../../src/database/models/Role.js';
import { Organization } from '../../src/database/models/Organization.js';
import { OrganizationMembership } from '../../src/database/models/OrganizationMembership.js';
import { OtpChallenge } from '../../src/database/models/OtpChallenge.js';
import { RefreshSession } from '../../src/database/models/RefreshSession.js';
import { PlatformSwitch } from '../../src/database/models/PlatformSwitch.js';
import { AuditLog } from '../../src/database/models/AuditLog.js';
import { setAdminMfaTestDelivery } from '../../src/modules/auth/admin-mfa.service.js';
import { setOtpTestDelivery } from '../../src/modules/auth/otp-delivery.js';
import { completedAdminFixture } from '../helpers/admin-assurance.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { contactsHash } from '../../src/modules/auth/admin-security.js';

describe.skipIf(!process.env.RUN_E2E)('email/SMS OTP security, settings and email-only launch', () => {
  const app = createApp(), base = '/api/v1/auth';
  let mongo: MongoMemoryReplSet, userId: Types.ObjectId, orgId: Types.ObjectId, password: string, delivered: Record<string, string>, fail: boolean;
  const originalSms = env.SMS_ENABLED;
  const required = <T>(value: T | null | undefined): T => { if (value == null) throw new Error('Missing OTP fixture evidence'); return value; };
  const code = (channel = 'EMAIL') => required(delivered[channel]);
  const verify = (challenge: { challengeToken: string; challenge: { channel: string } }, value = code(challenge.challenge.channel)) =>
    request(app).post(base + '/account-otp/verify').send({ challengeToken: challenge.challengeToken, channel: challenge.challenge.channel, code: value });
  const start = (channel: 'EMAIL' | 'SMS' = 'EMAIL') => request(app).post(base + '/login').send({ method: 'email', email: 'owner-otp@example.test', password, channel });
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : {} });
    await mongoose.connect(mongo.getUri('pcc-otp-channels-test'), { autoIndex: false });
    for (const model of Object.values(mongoose.models)) await model.createCollection();
    for (const model of [User, Role, Organization, OrganizationMembership, OtpChallenge, RefreshSession, PlatformSwitch, TenantOnboarding, Unit]) await model.createIndexes();
  }, 180000);
  beforeEach(async () => {
    for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
    for (const ip of ['127.0.0.1', '::ffff:127.0.0.1', '::1']) { authRateLimit.resetKey(ipKeyGenerator(ip)); publicRateLimit.resetKey(ipKeyGenerator(ip)); }
    env.SMS_ENABLED = true; password = randomBytes(24).toString('base64url'); delivered = {}; fail = false;
    setOtpTestDelivery(async (channel, _destination, value) => { if (fail) throw new Error('Private provider failure'); delivered[channel] = value; });
    const user = await User.create({ phone: '+254700008001', email: 'owner-otp@example.test', firstName: 'Owner', lastName: 'Fixture', passwordHash: await bcrypt.hash(password, 10) }); userId = user._id;
    const org = await Organization.create({ name: 'OTP Fixture', slug: 'otp-fixture' }); orgId = org._id;
    const role = await Role.create({ key: 'LANDLORD', name: 'Owner', system: true, organizationId: null, permissions: ['property.view', 'onboarding.manage', 'onboarding.view'] });
    await OrganizationMembership.create({ userId, organizationId: orgId, roleIds: [role._id], status: 'ACTIVE', scope: { allProperties: true, propertyIds: [], buildingIds: [], unitIds: [] } });
    for (const key of ['EMAIL_OTP', 'SMS_OTP', 'EMAIL_NOTIFICATIONS', 'SMS_NOTIFICATIONS']) await PlatformSwitch.create({ key, kind: 'FEATURE', name: key, description: 'Private test configuration', enabled: true, mode: 'ON' });
  });
  afterEach(() => { env.SMS_ENABLED = originalSms; setOtpTestDelivery(); setAdminMfaTestDelivery(); vi.restoreAllMocks(); });
  afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
  it.each(['EMAIL', 'SMS'] as const)('requires password and selected %s receipt before owner session issuance', async channel => {
    const first = await start(channel);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.data.accountOtpRequired).toBe(true); expect(first.body.data.accessToken).toBeUndefined();
    expect(first.headers['set-cookie']).toBeUndefined(); expect(await RefreshSession.countDocuments()).toBe(0);
    const success = await verify(first.body.data);
    expect(success.status, JSON.stringify(success.body)).toBe(200); expect(success.body.data.roles).toContain('LANDLORD');
    expect(success.body.data.refreshToken).toBeUndefined(); expect(success.headers['set-cookie'][0]).toContain('HttpOnly');
    const user = await User.findById(userId); expect(channel === 'EMAIL' ? user?.emailVerifiedAt : user?.phoneVerifiedAt).toBeTruthy();
    expect(channel === 'EMAIL' ? user?.phoneVerifiedAt : user?.emailVerifiedAt).toBeUndefined();
    expect(await AuditLog.countDocuments({ action: 'auth.otp.verified' })).toBe(1);
  }, 15000);
  it('rejects wrong passwords before issuing any challenge', async () => {
    const result = await request(app).post(base + '/login').send({ method: 'email', email: 'owner-otp@example.test', password: 'wrong-password-value' });
    expect(result.status).toBe(401); expect(await OtpChallenge.countDocuments()).toBe(0);
  });
  it('rejects an incorrect code and counts the attempt', async () => {
    const first = await start(); const wrong = code() === '000000' ? '000001' : '000000';
    expect((await verify(first.body.data, wrong)).status).toBe(401);
    expect((await OtpChallenge.findOne())?.attempts).toBe(1); expect(await RefreshSession.countDocuments()).toBe(0);
  });
  it('rejects expired codes', async () => {
    const first = await start(); await OtpChallenge.updateMany({}, { $set: { expiresAt: new Date(0) } });
    expect((await verify(first.body.data)).status).not.toBe(200); expect(await RefreshSession.countDocuments()).toBe(0);
  });
  it('atomically consumes the code and rejects replay', async () => {
    const first = await start(); expect((await verify(first.body.data)).status).toBe(200);
    expect((await verify(first.body.data)).status).toBe(401); expect(await RefreshSession.countDocuments()).toBe(1);
  }, 15000);
  it('grants at most one session under concurrent verification', async () => {
    const first = await start(); const results = await Promise.all([verify(first.body.data), verify(first.body.data)]);
    expect(results.filter(result => result.status === 200)).toHaveLength(1); expect(await RefreshSession.countDocuments()).toBe(1);
  }, 15000);
  it('rejects the other channel and does not consume its proof', async () => {
    const first = await start();
    const result = await request(app).post(base + '/account-otp/verify').send({ challengeToken: first.body.data.challengeToken, channel: 'SMS', code: code() });
    expect(result.status).toBe(401); expect(await RefreshSession.countDocuments()).toBe(0);
  });
  it('throttles resend', async () => {
    const first = await start();
    expect((await request(app).post(base + '/account-otp/resend').send({ challengeToken: first.body.data.challengeToken })).status).toBe(429);
  });
  it('supports a channel switch while invalidating the previous generation', async () => {
    const first = await start(); const original = await OtpChallenge.findOne();
    await OtpChallenge.updateMany({}, { $set: { nextSendAt: new Date(0) } });
    const next = await request(app).post(base + '/account-otp/resend').send({ challengeToken: first.body.data.challengeToken, channel: 'SMS' });
    expect(next.status).toBe(200); expect((await OtpChallenge.findOne())?.generation).toBe((original?.generation ?? 0) + 1);
    expect((await verify(first.body.data)).status).toBe(401); expect((await verify(next.body.data)).status).toBe(200);
  }, 15000);
  it('throttles immediate repeated verification', async () => {
    const first = await start(), wrong = code() === '000000' ? '000001' : '000000';
    await verify(first.body.data, wrong); expect((await verify(first.body.data, wrong)).status).toBe(429);
  });
  it('locks out repeated bad codes across fresh challenges', async () => {
    const first = await start(), wrong = code() === '000000' ? '000001' : '000000';
    for (let index = 0; index < env.OTP_MAX_ATTEMPTS; index++) { await OtpChallenge.updateMany({}, { $set: { nextVerifyAt: new Date(0) } }); await verify(first.body.data, wrong); }
    expect(required((await User.findById(userId))?.authLockedUntil).getTime()).toBeGreaterThan(Date.now());
    expect((await start()).status).toBe(429); expect(await RefreshSession.countDocuments()).toBe(0);
  }, 15000);
  it('prevents tokenless legacy verification from consuming a password-bound challenge', async () => {
    await start();
    expect((await request(app).post(base + '/verify-step-up').send({ email: 'owner-otp@example.test', code: code() })).status).toBe(401);
    expect((await request(app).post(base + '/verify-otp').send({ phone: '+254700008001', code: code() })).status).toBe(401);
  });
  it('invalidates an old flow when credentials are resubmitted', async () => {
    const old = await start(); await start(); expect((await verify(old.body.data)).status).toBe(401);
  }, 15000);
  it('invalidates proof when a contact changes', async () => {
    const first = await start(); await User.updateOne({ _id: userId }, { $set: { email: 'changed@example.test' } });
    expect((await verify(first.body.data)).status).toBe(401);
  });
  it('fails closed on provider failure', async () => {
    fail = true; const first = await start(); expect(first.body.data.challenge.delivery).toBe('FAILED');
    expect((await verify(first.body.data, '000000')).status).toBe(503); expect(await RefreshSession.countDocuments()).toBe(0);
  });
  it('rolls back challenge consumption, verification and sessions if audit fails', async () => {
    const first = await start(); vi.spyOn(AuditService, 'record').mockRejectedValue(new Error('Audit fixture unavailable'));
    expect((await verify(first.body.data)).status).toBe(500);
    expect(await RefreshSession.countDocuments()).toBe(0); expect((await OtpChallenge.findOne())?.consumedAt).toBeUndefined();
    expect((await User.findById(userId))?.emailVerifiedAt).toBeUndefined();
  }, 15000);
  it('runs email authentication with SMS disabled and makes no SMS delivery', async () => {
    env.SMS_ENABLED = false; const availability = await request(app).get(base + '/otp/availability');
    expect(availability.body.data.channels).toEqual(['EMAIL']);
    const first = await start(); expect((await verify(first.body.data)).status).toBe(200); expect(Object.keys(delivered)).toEqual(['EMAIL']);
    expect((await start('SMS')).status).toBe(503);
  }, 15000);
  it('allows an enrolled SUPER_ADMIN to log in with email alone while disabled SMS cannot be selected or satisfy step-up', async () => {
    env.SMS_ENABLED = false;
    const account = await User.create({ firstName: 'Admin', lastName: 'Email only', phone: '+254700008002', email: 'admin-otp@example.test', isPlatformAdmin: true,
      passwordHash: await bcrypt.hash(password, 10), emailVerifiedAt: new Date(), phoneVerifiedAt: new Date(), mfaContactsHash: contactsHash('admin-otp@example.test', '+254700008002') });
    setAdminMfaTestDelivery(async (channel, _destination, value) => { delivered[channel] = value; });
    const first = await request(app).post(base + '/login').send({ method: 'email', email: 'admin-otp@example.test', password });
    expect(first.status).toBe(200); expect(first.body.data.channels.map((item: { channel: string }) => item.channel)).toEqual(['EMAIL']);
    const headers = { Origin: env.WEB_ORIGIN, 'X-PCC-Auth': '1' };
    expect((await request(app).post(base + '/admin-mfa/channel').set(headers).send({ flowToken: first.body.data.flowToken, channel: 'SMS' })).status).toBe(503);
    const selected = await request(app).post(base + '/admin-mfa/channel').set(headers).send({ flowToken: first.body.data.flowToken, channel: 'EMAIL' });
    expect(selected.status).toBe(200);
    const result = await request(app).post(base + '/admin-mfa/verify').set(headers).send({ flowToken: first.body.data.flowToken, channel: 'EMAIL', code: code() });
    expect(result.status, JSON.stringify(result.body)).toBe(200); expect(result.body.data.roles).toContain('SUPER_ADMIN');
    const proof = await RefreshSession.findOne({ userId: account._id }); expect(proof?.mfaChannel).toBe('EMAIL'); expect(proof?.smsVerifiedAt).toBeUndefined();
    expect(Object.keys(delivered)).toEqual(['EMAIL']);
    expect(await Notification.countDocuments({ recipientUserId: account._id, channel: 'SMS' })).toBe(0);
    expect(await Notification.countDocuments({ recipientUserId: account._id, channel: 'EMAIL' })).toBe(1);
    const protectedChange = await request(app).patch('/api/v1/platform-control/switches/SMS_OTP').auth(result.body.data.accessToken, { type: 'bearer' }).send({ mode: 'ON', confirm: true, reason: 'Email-only assurance must not authorize dual-channel changes' });
    expect(protectedChange.status).toBe(403); expect(protectedChange.body.error.code).toBe('FRESH_AUTH_REQUIRED');
  }, 15000);
  it.each(['TENANT', 'CARETAKER', 'PROPERTY_MANAGER', 'CONTRACTOR'])('verifies provisioned %s email without manufacturing phone ownership', async key => {
    const role = await Role.create({ key, name: key, system: true, organizationId: null, permissions: [] });
    await OrganizationMembership.updateOne({ userId }, { $set: { roleIds: [role._id], 'scope.allProperties': false } });
    const first = await request(app).post(base + '/login').send({ method: 'emailOtp', email: 'owner-otp@example.test' });
    expect(first.status).toBe(200); expect(first.body.data.challenge.destination).toBe('your registered email');
    const result = await verify(first.body.data); expect(result.status, JSON.stringify(result.body)).toBe(200); expect(result.body.data.roles).toEqual([key]);
    expect((await User.findById(userId))?.phoneVerifiedAt).toBeUndefined();
  }, 15000);
  it('returns a generic challenge for unknown or ineligible passwordless emails', async () => {
    const owner = await request(app).post(base + '/login').send({ method: 'emailOtp', email: 'owner-otp@example.test' });
    const unknown = await request(app).post(base + '/login').send({ method: 'emailOtp', email: 'unknown@example.test' });
    expect(owner.status).toBe(200); expect(unknown.status).toBe(200); expect(owner.body.data.challenge).toMatchObject({ destination: 'your registered email', delivery: 'SENT' });
    expect(unknown.body.data.challenge).toMatchObject({ destination: 'your registered email', delivery: 'SENT' }); expect(delivered).toEqual({});
  });
  it('never puts codes or challenge tokens in audit records', async () => {
    const first = await start(); await verify(first.body.data);
    const records = JSON.stringify(await AuditLog.find().lean()); expect(records).not.toContain(code()); expect(records).not.toContain(first.body.data.challengeToken);
    expect(JSON.stringify(first.body)).not.toContain(code());
  }, 15000);
  it('denies anonymous users and ordinary owners access to channel settings', async () => {
    expect((await request(app).get('/api/v1/platform-control/otp-authentication')).status).toBe(401);
    const first = await start(), owner = await verify(first.body.data);
    expect((await request(app).get('/api/v1/platform-control/otp-authentication').auth(owner.body.data.accessToken, { type: 'bearer' })).status).toBe(403);
  }, 15000);
  it('allows diagnostic receipt testing but creates no new session and cannot use it for login', async () => {
    const admin = await User.create({ firstName: 'Admin', lastName: 'Fixture', phone: '+254700008002', email: 'admin-otp@example.test', isPlatformAdmin: true,
      passwordHash: await bcrypt.hash(password, 10), emailVerifiedAt: new Date(), phoneVerifiedAt: new Date(), mfaContactsHash: contactsHash('admin-otp@example.test', '+254700008002') });
    const token = await completedAdminFixture(admin._id);
    const before = await RefreshSession.countDocuments();
    const test = await request(app).post('/api/v1/platform-control/otp-authentication/tests').auth(token, { type: 'bearer' }).send({ channel: 'SMS' });
    expect(test.status, JSON.stringify(test.body)).toBe(200);
    const result = await request(app).post('/api/v1/platform-control/otp-authentication/tests/verify').auth(token, { type: 'bearer' }).send({ testToken: test.body.data.testToken, code: code('SMS') });
    expect(result.status, JSON.stringify(result.body)).toBe(200); expect(await RefreshSession.countDocuments()).toBe(before);
    expect((await request(app).post(base + '/account-otp/verify').send({ challengeToken: test.body.data.testToken, channel: 'SMS', code: code('SMS') })).status).toBe(401);
    const status = await request(app).get('/api/v1/platform-control/otp-authentication').auth(token, { type: 'bearer' });
    expect(status.body.data.channels.find((item: { channel: string }) => item.channel === 'SMS').tested).toBe(true);
  }, 15000);
  async function preRegisterTenant() {
    const ownerLogin = await start(), owner = await verify(ownerLogin.body.data);
    const unit = await Unit.create({ organizationId: orgId, propertyId: new Types.ObjectId(), buildingId: new Types.ObjectId(), floorId: new Types.ObjectId(), name: 'Assigned unit', code: 'OTP-A1', unitType: 'ONE_BEDROOM', monthlyRent: 15000, createdBy: userId, updatedBy: userId });
    await Role.create({ key: 'TENANT', name: 'Tenant', system: true, organizationId: null, permissions: [] });
    const registered = await request(app).post('/api/v1/organizations/' + orgId + '/tenant-onboarding').auth(owner.body.data.accessToken, { type: 'bearer' })
      .send({ phone: '+254700008009', email: 'tenant-activation@example.test', firstName: 'Tenant', lastName: 'Fixture', unitId: String(unit._id) });
    expect(registered.status, JSON.stringify(registered.body)).toBe(201);
    return { registered: registered.body.data, unit, ownerToken: owner.body.data.accessToken as string };
  }
  it('pre-registers unverified contacts and verifies tenant email while preserving the assigned unit', async () => {
    env.SMS_ENABLED = false;
    const fixture = await preRegisterTenant();
    expect(await User.exists({ email: 'tenant-activation@example.test' })).toBeNull();
    const unknown = await request(app).post('/api/v1/tenant-onboarding/activate').send({ channel: 'EMAIL', identifier: 'unknown-activation@example.test' });
    expect(unknown.status).toBe(200);
    const activation = await request(app).post('/api/v1/tenant-onboarding/activate').send({ channel: 'EMAIL', identifier: 'tenant-activation@example.test' });
    expect(activation.status, JSON.stringify(activation.body)).toBe(200);
    expect(Object.keys(activation.body.data).sort()).toEqual(Object.keys(unknown.body.data).sort());
    expect(activation.body.data.destination).toBe(unknown.body.data.destination);
    const result = await request(app).post('/api/v1/tenant-onboarding/verify').send({ onboardingToken: activation.body.data.onboardingToken, channel: 'EMAIL', otp: code() });
    expect(result.status, JSON.stringify(result.body)).toBe(200); expect(result.body.data.unitId).toBe(String(fixture.unit._id));
    const tenant = await User.findOne({ email: 'tenant-activation@example.test' }); expect(tenant?.emailVerifiedAt).toBeTruthy(); expect(tenant?.phoneVerifiedAt).toBeUndefined();
    const membership = await OrganizationMembership.findOne({ userId: required(tenant)._id }); expect(membership?.scope?.unitIds.map(String)).toEqual([String(fixture.unit._id)]); expect(membership?.scope?.allProperties).toBe(false);
    const login = await request(app).post(base + '/login').send({ method: 'emailOtp', email: 'tenant-activation@example.test' });
    expect((await verify(login.body.data)).body.data.roles).toEqual(['TENANT']);
    expect((await request(app).post('/api/v1/tenant-onboarding/verify').send({ onboardingToken: activation.body.data.onboardingToken, channel: 'EMAIL', otp: code() })).status).toBe(401);
  }, 15000);
  it('does not allow tenant activation payloads to select or replace a unit', async () => {
    await preRegisterTenant();
    const activation = await request(app).post('/api/v1/tenant-onboarding/activate').send({ channel: 'EMAIL', identifier: 'tenant-activation@example.test' });
    const result = await request(app).post('/api/v1/tenant-onboarding/verify').send({ onboardingToken: activation.body.data.onboardingToken, channel: 'EMAIL', otp: code(), unitId: String(new Types.ObjectId()) });
    expect(result.status).toBe(400); expect(await User.exists({ email: 'tenant-activation@example.test' })).toBeNull();
  }, 15000);
  it('denies another organization access to a pre-registered tenant challenge', async () => {
    const fixture = await preRegisterTenant();
    const otherOrg = await Organization.create({ name: 'Other Org', slug: 'other-org' });
    await TenantOnboarding.updateOne({ _id: fixture.registered.onboardingId }, { $set: { organizationId: otherOrg._id } });
    const result = await request(app).post('/api/v1/tenant-onboarding/' + fixture.registered.onboardingId + '/send-otp').auth(fixture.ownerToken, { type: 'bearer' }).send({ channel: 'EMAIL' });
    expect(result.status).toBe(403);
  }, 15000);
  it('rejects incorrect and expired tenant activation codes without creating an account', async () => {
    await preRegisterTenant();
    const activation = await request(app).post('/api/v1/tenant-onboarding/activate').send({ channel: 'EMAIL', identifier: 'tenant-activation@example.test' });
    const wrong = code() === '000000' ? '000001' : '000000';
    expect((await request(app).post('/api/v1/tenant-onboarding/verify').send({ onboardingToken: activation.body.data.onboardingToken, channel: 'EMAIL', otp: wrong })).status).toBe(401);
    await TenantOnboarding.updateMany({}, { $set: { otpExpiresAt: new Date(0), otpNextVerifyAt: new Date(0) } });
    expect((await request(app).post('/api/v1/tenant-onboarding/verify').send({ onboardingToken: activation.body.data.onboardingToken, channel: 'EMAIL', otp: code() })).status).toBe(401);
    expect(await User.exists({ email: 'tenant-activation@example.test' })).toBeNull();
  }, 15000);
  it('throttles repeated public tenant activation requests', async () => {
    await preRegisterTenant();
    const input = { channel: 'EMAIL', identifier: 'tenant-activation@example.test' };
    expect((await request(app).post('/api/v1/tenant-onboarding/activate').send(input)).status).toBe(200);
    expect((await request(app).post('/api/v1/tenant-onboarding/activate').send(input)).status).toBe(429);
  }, 15000);
  it('blocks SMS activation without verified delivery evidence', async () => {
    const admin = await User.create({ firstName: 'Admin', lastName: 'Fixture', phone: '+254700008002', email: 'admin-otp@example.test', isPlatformAdmin: true });
    const token = await completedAdminFixture(admin._id);
    const result = await request(app).patch('/api/v1/platform-control/switches/SMS_OTP').auth(token, { type: 'bearer' }).send({ mode: 'ON', confirm: true, reason: 'Fixture premature activation' });
    expect(result.status).toBe(409); expect(result.body.error.code).toBe('OTP_DELIVERY_NOT_TESTED');
  });
  it('prevents disabling a channel that would strand an active account', async () => {
    await User.create({ firstName: 'SMS', lastName: 'Only', phone: '+254700008010' });
    const admin = await User.create({ firstName: 'Admin', lastName: 'Fixture', phone: '+254700008002', email: 'admin-otp@example.test', isPlatformAdmin: true });
    const token = await completedAdminFixture(admin._id);
    const result = await request(app).patch('/api/v1/platform-control/switches/SMS_OTP').auth(token, { type: 'bearer' }).send({ mode: 'OFF', confirm: true, reason: 'Fixture stranded account' });
    expect(result.status).toBe(409); expect(result.body.error.code).toBe('OTP_ACCOUNT_LOCKOUT_PREVENTED');
  });
  it('serializes concurrent channel-disable operations so at least one remains available', async () => {
    await User.updateOne({ _id: userId }, { $set: { emailVerifiedAt: new Date(), phoneVerifiedAt: new Date() } });
    const admin = await User.create({ firstName: 'Admin', lastName: 'Fixture', phone: '+254700008002', email: 'admin-otp@example.test', isPlatformAdmin: true });
    const token = await completedAdminFixture(admin._id);
    const change = (key: string) => request(app).patch('/api/v1/platform-control/switches/' + key).auth(token, { type: 'bearer' }).send({ mode: 'OFF', confirm: true, reason: 'Fixture concurrent changes' });
    const results = await Promise.all([change('EMAIL_OTP'), change('SMS_OTP')]);
    expect(results.filter(result => result.status === 200)).toHaveLength(1);
    expect((await request(app).get(base + '/otp/availability')).body.data.channels).toHaveLength(1);
  });
  it('rejects disabling the last available channel even with dual-channel privileged proof', async () => {
    env.SMS_ENABLED = false;
    const admin = await User.create({ firstName: 'Admin', lastName: 'Fixture', phone: '+254700008002', email: 'admin-otp@example.test', isPlatformAdmin: true });
    const token = await completedAdminFixture(admin._id);
    const result = await request(app).patch('/api/v1/platform-control/switches/EMAIL_OTP').auth(token, { type: 'bearer' }).send({ mode: 'OFF', confirm: true, reason: 'Fixture lockout attempt' });
    expect(result.status).toBe(409); expect(result.body.error.code).toBe('OTP_LOCKOUT_PREVENTED');
  });
});
describe('conditional production configuration', () => {
  const production = () => ({ NODE_ENV: 'production', WEB_ORIGIN: 'https://app.example.test', PUBLIC_API_URL: 'https://api.example.test',
    MONGODB_URI: 'mongodb+srv://cluster.example.test/pcc', JWT_ACCESS_SECRET: randomBytes(48).toString('hex'), JWT_REFRESH_SECRET: randomBytes(48).toString('hex'),
    REFRESH_COOKIE_SECURE: true, EMAIL_ENABLED: true, EMAIL_PROVIDER: 'RESEND', EMAIL_FROM: 'security@example.test', EMAIL_SENDING_DOMAIN: 'example.test',
    EMAIL_DOMAIN_VERIFIED: true, RESEND_API_KEY: randomBytes(24).toString('hex'), SMS_ENABLED: false,
    MPESA_ENABLED: false, PAYSTACK_ENABLED: false, CCTV_ENABLED: false, DOCUMENT_STORAGE_ENABLED: false });
  it('accepts an email-only production launch with no optional service credentials', () => { expect(envSchema.safeParse(production()).success).toBe(true); });
  it('requires SMS credentials only when SMS is runtime-enabled', () => { expect(envSchema.safeParse({ ...production(), SMS_ENABLED: true }).success).toBe(false); });
  it('requires actual email provider configuration', () => { expect(envSchema.safeParse({ ...production(), RESEND_API_KEY: undefined }).success).toBe(false); });
  it('requires verified sender-domain configuration', () => { expect(envSchema.safeParse({ ...production(), EMAIL_DOMAIN_VERIFIED: false }).success).toBe(false); });
  it('rejects a sender from a different domain', () => { expect(envSchema.safeParse({ ...production(), EMAIL_FROM: 'security@another.test' }).success).toBe(false); });
  it('rejects a deployment with both authentication providers disabled', () => { expect(envSchema.safeParse({ ...production(), EMAIL_ENABLED: false }).success).toBe(false); });
  it('still rejects insecure production cookies and weak secrets', () => { expect(envSchema.safeParse({ ...production(), REFRESH_COOKIE_SECURE: false, JWT_ACCESS_SECRET: 'short' }).success).toBe(false); });
});
