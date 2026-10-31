import { describe, it, expect, vi, afterEach } from 'vitest';
import { BraveSalesResearchProvider, publicResearchUrl } from '../../src/integrations/research/sales-research.provider.js';
describe('Permitted research connector', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('uses only the fixed authenticated provider and returns bounded attributed references', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ web: { results: [{ title: '<b>Example Rentals</b>', url: 'https://example.com/rentals', description: 'Public business description' }, { title: 'Duplicate', url: 'https://example.com/rentals' }, { title: 'Local injection', url: 'https://127.0.0.1/secret' }] } }) });
    vi.stubGlobal('fetch', fetch);
    const sources = await new BraveSalesResearchProvider('isolated-test-key').search('rental property companies Kenya');
    expect(sources).toHaveLength(1); expect(sources[0]).toMatchObject({ title: 'Example Rentals', provider: 'BRAVE', url: 'https://example.com/rentals' });
    const call = fetch.mock.calls.at(0); if (!call) throw new Error('Provider request missing');
    const [url, options] = call;
    expect(String(url)).toContain('https://api.search.brave.com/res/v1/web/search?'); expect(options.redirect).toBe('error'); expect(options.headers['X-Subscription-Token']).toBe('isolated-test-key');
    expect(String(url)).not.toContain('isolated-test-key');
  });
  it('reports missing configuration and invalid/provider failures without raw secrets or invented sources', async () => {
    await expect(new BraveSalesResearchProvider('').search('valid research query')).rejects.toMatchObject({ code: 'RESEARCH_NOT_CONFIGURED' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('secret provider diagnostic')));
    await expect(new BraveSalesResearchProvider('key').search('valid research query')).rejects.toMatchObject({ code: 'RESEARCH_PROVIDER_UNAVAILABLE', message: 'Research provider returned unavailable or invalid evidence' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ web: { results: 'invalid' } }) }));
    await expect(new BraveSalesResearchProvider('key').search('valid research query')).rejects.toMatchObject({ code: 'RESEARCH_PROVIDER_UNAVAILABLE' });
  });
  it.each(['http://example.com', 'https://user:password@example.com', 'https://127.0.0.1', 'https://[::1]', 'https://service.internal', 'javascript:alert(1)'])('rejects unsafe source reference %s', value => { expect(publicResearchUrl(value)).toBeNull(); });
});
