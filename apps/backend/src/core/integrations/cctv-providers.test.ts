import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformSwitch } from '../../database/models/PlatformSwitch.js';
import { integrationConfig } from './config.js';
import { GenericCctvProvider, NvrHttpProvider } from './cctv-providers.js';
import { requestJson } from './http.js';
vi.mock('./http.js', () => ({ requestJson: vi.fn(async () => ({ status: 'ONLINE' })) }));
const originalCctv = { ...integrationConfig.cctv };
const originalNvr = { ...integrationConfig.nvr };
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(integrationConfig.cctv, { baseUrl: 'https://cctv.example.test', apiKey: 'cctv-test-key' });
  Object.assign(integrationConfig.nvr, { baseUrl: 'https://nvr.example.test/', apiKey: 'nvr-test-key' });
});
afterEach(() => {
  vi.restoreAllMocks();
  Object.assign(integrationConfig.cctv, originalCctv);
  Object.assign(integrationConfig.nvr, originalNvr);
});
function switches(enabledKey: string) {
  return vi.spyOn(PlatformSwitch, 'findOne').mockImplementation((filter: unknown) => {
    const key = (filter as { key?: string })?.key;
    return { lean: async () => ({ enabled: key === enabledKey, mode: key === enabledKey ? 'ON' : 'OFF' }) } as never;
  });
}
describe('independent CCTV and NVR provider controls', () => {
  it.each(['live', 'playback'] as const)('allows NVR %s while CCTV is off, with NVR endpoint and credential', async (operation) => {
    const query = switches('NVR_GATEWAY');
    const provider = new NvrHttpProvider();
    if (operation === 'live') await provider.live('camera/1');
    else await provider.playback('camera/1', new Date('2026-01-01'), new Date('2026-01-02'));
    expect(query).toHaveBeenCalledWith({ key: 'NVR_GATEWAY' });
    expect(requestJson).toHaveBeenCalledWith(expect.stringContaining('https://nvr.example.test/cameras/camera%2F1/' + operation), { headers: { authorization: 'Bearer nvr-test-key' } });
  });
  it('blocks NVR while CCTV is enabled without contacting the gateway', async () => {
    switches('CCTV_GATEWAY');
    await expect(new NvrHttpProvider().live('camera')).rejects.toMatchObject({ code: 'SERVICE_DISABLED' });
    expect(requestJson).not.toHaveBeenCalled();
  });
  it('uses only CCTV configuration for the generic provider', async () => {
    switches('CCTV_GATEWAY');
    await new GenericCctvProvider().live('camera');
    expect(requestJson).toHaveBeenCalledWith('https://cctv.example.test/cameras/camera/live', { headers: { authorization: 'Bearer cctv-test-key' } });
  });
  it('never falls back to CCTV when NVR is unconfigured', async () => {
    switches('NVR_GATEWAY');
    integrationConfig.nvr.baseUrl = undefined;
    await expect(new NvrHttpProvider().live('camera')).rejects.toThrow('NVR_PROVIDER_NOT_CONFIGURED');
    expect(requestJson).not.toHaveBeenCalled();
  });
  it('keeps NVR health diagnostics callable while both streaming switches are off', async () => {
    const query = switches('NONE');
    await new NvrHttpProvider().health('camera');
    expect(query).not.toHaveBeenCalled();
    expect(requestJson).toHaveBeenCalledWith('https://nvr.example.test/cameras/camera/health', { headers: { authorization: 'Bearer nvr-test-key' } });
  });
});
