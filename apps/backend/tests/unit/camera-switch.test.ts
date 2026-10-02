import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SecurityCamera } from '../../src/database/models/SecurityCamera.js';
import { PlatformSwitch } from '../../src/database/models/PlatformSwitch.js';
import { SecurityService } from '../../src/modules/security/security.service.js';
import { BillingService } from '../../src/modules/billing/billing.service.js';
import { ResourceScopeService } from '../../src/core/authorization/resource-scope.service.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';
afterEach(() => vi.restoreAllMocks());
const auth: AuthenticatedUser = { userId: new Types.ObjectId(), isPlatformAdmin: true, memberships: [] };
function camera(provider: string) {
  const record = { _id: new Types.ObjectId(), organizationId: new Types.ObjectId(), propertyId: new Types.ObjectId(), provider, streamRef: 'camera-live', playbackRef: 'camera-playback' };
  vi.spyOn(SecurityCamera, 'findById').mockReturnValue({ lean: async () => record } as never);
  vi.spyOn(BillingService, 'assertFeature').mockResolvedValue();
  return record;
}
describe('camera API service switch scope', () => {
  it.each(['getLiveStream', 'getPlayback'] as const)('allows NVR %s when only NVR is enabled', async (method) => {
    const record = camera('NVR');
    const query = vi.spyOn(PlatformSwitch, 'findOne').mockImplementation((filter) => ({ lean: async () => ({ enabled: filter?.key === 'NVR_GATEWAY', mode: filter?.key === 'NVR_GATEWAY' ? 'ON' : 'OFF' }) }) as never);
    await expect(SecurityService[method](auth, String(record._id))).resolves.toMatchObject({ cameraId: record._id, provider: 'NVR' });
    expect(query).toHaveBeenCalledExactlyOnceWith({ key: 'NVR_GATEWAY' });
  });
  it.each(['getLiveStream', 'getPlayback'] as const)('blocks disabled generic CCTV %s even if NVR is enabled', async (method) => {
    const record = camera('GENERIC');
    const query = vi.spyOn(PlatformSwitch, 'findOne').mockImplementation((filter) => ({ lean: async () => ({ enabled: filter?.key === 'NVR_GATEWAY', mode: filter?.key === 'NVR_GATEWAY' ? 'ON' : 'OFF' }) }) as never);
    await expect(SecurityService[method](auth, String(record._id))).rejects.toMatchObject({ code: 'SERVICE_DISABLED' });
    expect(query).toHaveBeenCalledExactlyOnceWith({ key: 'CCTV_GATEWAY' });
  });
  it('authorizes the camera before reading switch state', async () => {
    const record = camera('NVR');
    vi.spyOn(ResourceScopeService, 'assertProperty').mockRejectedValue(new Error('scope denied'));
    const query = vi.spyOn(PlatformSwitch, 'findOne');
    await expect(SecurityService.getLiveStream(auth, String(record._id))).rejects.toThrow('scope denied');
    expect(query).not.toHaveBeenCalled();
  });
  it('retains entitlement checks independently of enabled switches', async () => {
    const record = camera('NVR');
    vi.spyOn(BillingService, 'assertFeature').mockRejectedValue(new Error('not entitled'));
    const query = vi.spyOn(PlatformSwitch, 'findOne');
    await expect(SecurityService.getPlayback(auth, String(record._id))).rejects.toThrow('not entitled');
    expect(query).not.toHaveBeenCalled();
  });
});
