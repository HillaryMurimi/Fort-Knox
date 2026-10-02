import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformSwitch } from '../../src/database/models/PlatformSwitch.js';
import { assertSwitchEnabled, platformSwitchGuard } from '../../src/modules/platform-control/platform-control.guard.js';

afterEach(() => vi.restoreAllMocks());
describe('platform switch fail-closed guard', () => {
  it.each([null, { enabled: false, mode: 'OFF' }, { enabled: true, mode: 'MAINTENANCE' }, { enabled: false, mode: 'ON' }])('denies missing, disabled or inconsistent state %j', async (control) => {
    vi.spyOn(PlatformSwitch, 'findOne').mockReturnValue({ lean: async () => control } as never);
    await expect(assertSwitchEnabled('NVR_GATEWAY')).rejects.toMatchObject({ statusCode: 503, code: 'SERVICE_DISABLED' });
  });
  it('permits only enabled ON state', async () => {
    vi.spyOn(PlatformSwitch, 'findOne').mockReturnValue({ lean: async () => ({ enabled: true, mode: 'ON' }) } as never);
    await expect(assertSwitchEnabled('NVR_GATEWAY')).resolves.toBeUndefined();
  });
  it.each([
    ['POST', '/integrations/webhooks/PAYSTACK'],
    ['POST', '/integrations/payments/id/provider-reconcile'],
    ['POST', '/auth/refresh'],
    ['PATCH', '/platform-control/switches/CCTV_GATEWAY'],
    ['GET', '/health/ready'],
    ['GET', '/cctv/cameras/id/live'],
    ['GET', '/cctv/cameras/id/playback'],
  ])('leaves recovery, controls and provider-resolved routes ungated: %s %s', (method, path) => {
    const query = vi.spyOn(PlatformSwitch, 'findOne');
    const next = vi.fn();
    platformSwitchGuard({ method, path } as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
    expect(query).not.toHaveBeenCalled();
  });
  it('returns maintenance errors for a disabled payment initiation', async () => {
    vi.spyOn(PlatformSwitch, 'findOne').mockReturnValue({ lean: async () => null } as never);
    const next = vi.fn();
    platformSwitchGuard({ method: 'POST', path: '/integrations/payments/id/provider-initiate', body: { provider: 'PAYSTACK' } } as Request, {} as Response, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'SERVICE_DISABLED' })));
  });
});

describe('platform-control API documentation', () => {
  it('publishes operator confirmation, atomic audit and gateway maintenance responses', async () => {
    const { buildOpenApiDocument } = await import('../../src/core/api/openapi.js');
    const paths = buildOpenApiDocument().paths;
    expect(paths['/platform-control/switches/{key}'].patch.description).toContain('one MongoDB transaction');
    expect(paths['/platform-control/switches/{key}'].patch.requestBody.content['application/json'].schema.properties.confirm).toEqual({ const: true });
    expect(paths['/cctv/cameras/{cameraId}/live'].get.responses['503']).toBeDefined();
    expect(paths['/cctv/cameras/{cameraId}/playback'].get.responses['503']).toBeDefined();
  });
});
