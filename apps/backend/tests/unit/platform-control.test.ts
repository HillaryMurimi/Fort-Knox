import mongoose, { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformSwitch } from '../../src/database/models/PlatformSwitch.js';
import { PlatformControlService } from '../../src/modules/platform-control/platform-control.service.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { updateSwitchSchema } from '../../src/modules/platform-control/platform-control.schemas.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

afterEach(() => vi.restoreAllMocks());
const auth: AuthenticatedUser = { userId: new Types.ObjectId(), isPlatformAdmin: true, memberships: [] };
const input = { mode: 'ON' as const, reason: 'Readiness verified', confirm: true as const };
function fixture() {
  const session = { withTransaction: vi.fn(async (callback: () => Promise<unknown>) => callback()), endSession: vi.fn() };
  vi.spyOn(mongoose, 'startSession').mockResolvedValue(session as never);
  vi.spyOn(PlatformControlService, 'ensureCatalog').mockResolvedValue();
  const control = { _id: new Types.ObjectId(), key: 'NVR_GATEWAY', kind: 'SERVICE', mode: 'OFF', enabled: false, reason: 'Not ready', modifiedBy: undefined as Types.ObjectId | undefined, modifiedAt: undefined as Date | undefined, save: vi.fn(), toObject: vi.fn(() => ({ mode: control.mode })) };
  const query = vi.spyOn(PlatformSwitch, 'findOne').mockReturnValue({ session: async () => control } as never);
  return { session, control, query };
}

describe('platform switch mutation boundary', () => {
  it('requires explicit confirmation and a reason', () => {
    expect(() => updateSwitchSchema.parse({ ...input, confirm: false })).toThrow();
    expect(() => updateSwitchSchema.parse({ ...input, reason: '  ' })).toThrow();
    expect(updateSwitchSchema.parse(input).mode).toBe('ON');
  });
  it('denies non-platform callers before touching the catalog or database', async () => {
    const { session } = fixture();
    await expect(PlatformControlService.update({ ...auth, isPlatformAdmin: false }, 'NVR_GATEWAY', input)).rejects.toMatchObject({ code: 'PLATFORM_ADMIN_REQUIRED' });
    expect(PlatformControlService.ensureCatalog).not.toHaveBeenCalled();
    expect(session.withTransaction).not.toHaveBeenCalled();
  });
  it.each(['ON', 'OFF', 'MAINTENANCE'] as const)('writes %s and before/after audit in the same transaction', async (mode) => {
    const { session, control } = fixture();
    const audit = vi.spyOn(AuditService, 'record').mockResolvedValue(undefined as never);
    await PlatformControlService.update(auth, 'NVR_GATEWAY', { ...input, mode });
    expect(control.save).toHaveBeenCalledWith({ session });
    expect(control.enabled).toBe(mode === 'ON');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      before: { mode: 'OFF', enabled: false, reason: 'Not ready' },
      after: { mode, enabled: mode === 'ON', reason: input.reason },
      actorUserId: auth.userId, resourceId: control._id,
    }), session);
    expect(session.endSession).toHaveBeenCalledOnce();
  });
  it('propagates audit failure through the transaction and closes the session', async () => {
    const { session } = fixture();
    vi.spyOn(AuditService, 'record').mockRejectedValue(new Error('audit unavailable'));
    await expect(PlatformControlService.update(auth, 'NVR_GATEWAY', input)).rejects.toThrow('audit unavailable');
    expect(session.withTransaction).toHaveBeenCalledOnce();
    expect(session.endSession).toHaveBeenCalledOnce();
  });
  it('rejects an unknown switch without writing an audit and closes the session', async () => {
    const { session, query } = fixture();
    query.mockReturnValue({ session: async () => null } as never);
    const audit = vi.spyOn(AuditService, 'record');
    await expect(PlatformControlService.update(auth, 'MISSING', input)).rejects.toMatchObject({ code: 'PLATFORM_SWITCH_NOT_FOUND' });
    expect(audit).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledOnce();
  });
});
