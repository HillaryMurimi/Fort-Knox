import mongoose, { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env.js';
import { LaunchReadiness } from '../../src/database/models/LaunchReadiness.js';
import { LaunchReadinessService } from '../../src/modules/platform-control/launch-readiness.service.js';
import { updateReadinessSchema } from '../../src/modules/platform-control/launch-readiness.schemas.js';
import { configurationStatus, readinessIssues } from '../../src/modules/platform-control/launch-readiness.catalog.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { updateLaunchReadiness } from '../../src/modules/platform-control/platform-control.controller.js';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const auth: AuthenticatedUser = { userId: new Types.ObjectId(), isPlatformAdmin: true, memberships: [] };
const input = { expectedRevision: 0, onboarding: 'APPROVED' as const, staging: 'PASSED' as const, responsibleOwner: 'Release owner', targetDate: null, nextAction: 'Monitor delivery', blocker: '', severity: 'NONE' as const, verificationNote: 'Staging delivery verified with test records' };
function transaction() {
  vi.spyOn(LaunchReadiness.collection, 'indexes').mockResolvedValue([{ name: 'environment_1_key_1', key: { environment: 1, key: 1 }, unique: true }] as never);
  const session = { withTransaction: vi.fn(async (callback: () => Promise<unknown>) => callback()), endSession: vi.fn() };
  vi.spyOn(mongoose, 'startSession').mockResolvedValue(session as never);
  const record = { _id: new Types.ObjectId(), revision: 0, onboarding: 'NOT_STARTED', staging: 'NOT_TESTED', severity: 'NONE', set: vi.fn(), save: vi.fn() };
  record.set.mockImplementation(values => Object.assign(record, values));
  vi.spyOn(LaunchReadiness, 'findOne').mockReturnValue({ session: async () => record } as never);
  vi.spyOn(LaunchReadinessService, 'list').mockResolvedValue({ environment: 'test', generatedAt: '', items: [], summary: { total: 0, ready: 0, blockers: 0, unassigned: 0 } });
  return { session, record };
}

describe('launch readiness input and status', () => {
  it('requires ownership and an evidenced review for a passed staging check', () => {
    expect(updateReadinessSchema.safeParse(input).success).toBe(true);
    expect(updateReadinessSchema.safeParse({ ...input, responsibleOwner: ' ' }).success).toBe(false);
    expect(updateReadinessSchema.safeParse({ ...input, verificationNote: 'ok' }).success).toBe(false);
    expect(updateReadinessSchema.safeParse({ ...input, targetDate: '2026-02-30' }).success).toBe(false);
  });
  it.each(['secret=example', 'mongodb://example.invalid/db', 'Bearer credential', 'sk_live_example', '-----BEGIN PRIVATE KEY-----'])('rejects credential-shaped notes: %s', verificationNote => {
    expect(updateReadinessSchema.safeParse({ ...input, verificationNote }).success).toBe(false);
  });
  it('rejects credential fields, mismatched blockers and derived statuses', () => {
    for (const change of [{ apiKey: 'example' }, { ready: true }, { blocker: 'Waiting for document' }, { severity: 'HIGH' }]) expect(updateReadinessSchema.safeParse({ ...input, ...change }).success).toBe(false);
    expect(updateReadinessSchema.safeParse({ ...input, blocker: 'Waiting for document', severity: 'HIGH' }).success).toBe(true);
  });
  it('counts missing and partial configuration without exposing the values', () => {
    const original = { CCTV_PROVIDER_BASE_URL: env.CCTV_PROVIDER_BASE_URL, CCTV_PROVIDER_API_KEY: env.CCTV_PROVIDER_API_KEY };
    try {
      Object.assign(env, { CCTV_PROVIDER_BASE_URL: undefined, CCTV_PROVIDER_API_KEY: undefined });
      expect(configurationStatus('CCTV')).toBe('MISSING');
      Object.assign(env, { CCTV_PROVIDER_BASE_URL: 'https://gateway.example.invalid' });
      expect(configurationStatus('CCTV')).toBe('PARTIAL');
      Object.assign(env, { CCTV_PROVIDER_API_KEY: 'private-test-value' });
      expect(configurationStatus('CCTV')).toBe('CONFIGURED');
      expect(JSON.stringify(configurationStatus('CCTV'))).not.toContain('private-test-value');
    } finally { Object.assign(env, original); }
  });
  it('does not treat configuration or a claimed pass without timestamp as readiness', () => {
    expect(readinessIssues({ ...input, verifiedAt: null }, 'CONFIGURED', true)).toContain('Staging not verified');
    expect(readinessIssues({ ...input, verifiedAt: new Date() }, 'PARTIAL', true)).toContain('Configuration incomplete');
    expect(readinessIssues({ ...input, verifiedAt: new Date() }, 'CONFIGURED', true)).toEqual([]);
  });
});

describe('launch readiness authorization and isolation', () => {
  it('denies organization users before database reads, session creation or invalid-body parsing', async () => {
    const find = vi.spyOn(LaunchReadiness, 'find');
    const start = vi.spyOn(mongoose, 'startSession');
    const denied = { ...auth, isPlatformAdmin: false };
    await expect(LaunchReadinessService.list(denied)).rejects.toMatchObject({ code: 'PLATFORM_ADMIN_REQUIRED' });
    await expect(LaunchReadinessService.update(denied, 'MPESA', input)).rejects.toMatchObject({ code: 'PLATFORM_ADMIN_REQUIRED' });
    await expect(updateLaunchReadiness({ auth: denied, params: {}, body: {} } as unknown as Request, {} as Response)).rejects.toMatchObject({ code: 'PLATFORM_ADMIN_REQUIRED' });
    expect(find).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled();
  });
  it('returns environment-scoped defaults without writing or exposing stored extras', async () => {
    const find = vi.spyOn(LaunchReadiness, 'find').mockReturnValue({ lean: async () => [{ key: 'MPESA', credential: 'never-return-this', revision: 2 }] } as never);
    const save = vi.spyOn(LaunchReadiness.prototype, 'save');
    const data = await LaunchReadinessService.list(auth);
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ environment: env.NODE_ENV }));
    expect(data.items).toHaveLength(12);
    expect(data.items.every(item => !item.ready)).toBe(true);
    expect(data.items.find(item => item.key === 'BUSINESS_REGISTRATION')?.staging).toBe('NOT_APPLICABLE');
    expect(JSON.stringify(data)).not.toContain('never-return-this');
    expect(save).not.toHaveBeenCalled();
  });
  it('rejects unknown items and inappropriate staging exemptions before a transaction', async () => {
    const start = vi.spyOn(mongoose, 'startSession');
    await expect(LaunchReadinessService.update(auth, 'UNKNOWN', input)).rejects.toMatchObject({ code: 'READINESS_ITEM_NOT_FOUND' });
    await expect(LaunchReadinessService.update(auth, 'MPESA', { ...input, staging: 'NOT_APPLICABLE' })).rejects.toMatchObject({ code: 'STAGING_REQUIRED' });
    await expect(LaunchReadinessService.update(auth, 'BUSINESS_REGISTRATION', input)).rejects.toMatchObject({ code: 'STAGING_NOT_APPLICABLE' });
    expect(start).not.toHaveBeenCalled();
  });
  it('saves and audits in one session while omitting free-text notes from audit', async () => {
    const { session, record } = transaction();
    const audit = vi.spyOn(AuditService, 'record').mockResolvedValue(undefined as never);
    await LaunchReadinessService.update(auth, 'MPESA', input);
    expect(LaunchReadiness.findOne).toHaveBeenCalledWith({ key: 'MPESA', environment: env.NODE_ENV });
    expect(record.save).toHaveBeenCalledWith({ session });
    expect(record.revision).toBe(1);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'platform.readiness.updated', actorUserId: auth.userId, metadata: { key: 'MPESA', environment: env.NODE_ENV, ownerAssigned: true } }), session);
    expect(JSON.stringify(audit.mock.calls)).not.toContain(input.verificationNote);
    expect(session.endSession).toHaveBeenCalledOnce();
  });
  it('rejects stale revisions without saving', async () => {
    const { session, record } = transaction();
    await expect(LaunchReadinessService.update(auth, 'MPESA', { ...input, expectedRevision: 3 })).rejects.toMatchObject({ code: 'READINESS_CONFLICT' });
    expect(record.save).not.toHaveBeenCalled(); expect(session.endSession).toHaveBeenCalledOnce();
  });
  it('propagates audit failure through the transaction and closes the session', async () => {
    const { session } = transaction();
    vi.spyOn(AuditService, 'record').mockRejectedValue(new Error('audit unavailable'));
    await expect(LaunchReadinessService.update(auth, 'MPESA', input)).rejects.toThrow('audit unavailable');
    expect(session.endSession).toHaveBeenCalledOnce();
    expect(LaunchReadinessService.list).not.toHaveBeenCalled();
  });
});


describe('deployment environment isolation', () => {
  it('keeps staging reviews separate even when the runtime uses production mode', async () => {
    const original = { LAUNCH_READINESS_ENV: env.LAUNCH_READINESS_ENV, NODE_ENV: env.NODE_ENV };
    try {
      Object.assign(env, { NODE_ENV: 'production', LAUNCH_READINESS_ENV: 'staging' });
      const find = vi.spyOn(LaunchReadiness, 'find').mockReturnValue({ lean: async () => [] } as never);
      expect((await LaunchReadinessService.list(auth)).environment).toBe('staging');
      expect(find).toHaveBeenCalledWith(expect.objectContaining({ environment: 'staging' }));
      Object.assign(env, { LAUNCH_READINESS_ENV: 'production' });
      expect((await LaunchReadinessService.list(auth)).environment).toBe('production');
      expect(find).toHaveBeenLastCalledWith(expect.objectContaining({ environment: 'production' }));
    } finally { Object.assign(env, original); }
  });
});

describe('readiness database prerequisites', () => {
  it.each([{ indexes: [] }, { indexes: [{ name: 'environment_1_key_1', key: { environment: 1, key: 1 } }] }, { indexes: [{ key: { environment: 1, key: 1 }, unique: true, sparse: true }] }])('refuses writes without a full unique environment/key index: %j', async ({ indexes }) => {
    vi.spyOn(LaunchReadiness.collection, 'indexes').mockResolvedValue(indexes as never);
    const start = vi.spyOn(mongoose, 'startSession');
    await expect(LaunchReadinessService.update(auth, 'MPESA', input)).rejects.toMatchObject({ code: 'READINESS_INDEX_REQUIRED' });
    expect(start).not.toHaveBeenCalled();
  });
});
