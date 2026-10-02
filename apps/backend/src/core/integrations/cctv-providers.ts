import { assertSwitchEnabled } from '../../modules/platform-control/platform-control.guard.js';
import { integrationConfig } from './config.js';
import { requestJson } from './http.js';
import type { CctvProvider, CctvStreamResult, ProviderKey } from './provider.types.js';

export class GenericCctvProvider implements CctvProvider {
  readonly key: ProviderKey = 'GENERIC_CCTV';
  protected get config() { return integrationConfig.cctv; }
  private url(ref: string, operation: string) {
    const { baseUrl } = this.config;
    if (!baseUrl) throw new Error(this.key === 'NVR_HTTP' ? 'NVR_PROVIDER_NOT_CONFIGURED' : 'CCTV_PROVIDER_NOT_CONFIGURED');
    return `${baseUrl.replace(/\/$/, '')}/cameras/${encodeURIComponent(ref)}/${operation}`;
  }
  private options() {
    return { headers: this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : undefined };
  }
  async live(ref: string) {
    await assertSwitchEnabled(this.key === 'NVR_HTTP' ? 'NVR_GATEWAY' : 'CCTV_GATEWAY');
    return requestJson<CctvStreamResult>(this.url(ref, 'live'), this.options());
  }
  async playback(ref: string, from: Date, to: Date) {
    await assertSwitchEnabled(this.key === 'NVR_HTTP' ? 'NVR_GATEWAY' : 'CCTV_GATEWAY');
    const query = `?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
    return requestJson<CctvStreamResult>(this.url(ref, 'playback') + query, this.options());
  }
  async health(ref: string) {
    return requestJson<{ status: 'ONLINE' | 'OFFLINE' | 'DEGRADED'; lastSeenAt?: Date }>(this.url(ref, 'health'), this.options());
  }
}
export class NvrHttpProvider extends GenericCctvProvider {
  readonly key: ProviderKey = 'NVR_HTTP';
  protected get config() { return integrationConfig.nvr; }
}
