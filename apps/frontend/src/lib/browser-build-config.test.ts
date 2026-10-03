import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe('isolated browser verification output', () => {
  it.each(['sales', 'platform'])('isolates the %s fixture from the normal dev server', async (fixture) => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('PCC_BROWSER_TEST_BUILD', fixture);
    const { default: config } = await import('../../next.config');
    expect(config.distDir).toBe(`.next/browser-${fixture}`);
    expect(config.reactStrictMode).toBe(true);
  });
  it.each(['production', 'test'])('keeps the standard build in %s', async (environment) => {
    vi.stubEnv('NODE_ENV', environment);
    vi.stubEnv('PCC_BROWSER_TEST_BUILD', 'sales');
    const { default: config } = await import('../../next.config');
    expect(config.distDir).toBe('.next');
  });
  it('rejects arbitrary fixture paths', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('PCC_BROWSER_TEST_BUILD', '../../elsewhere');
    const { default: config } = await import('../../next.config');
    expect(config.distDir).toBe('.next');
  });
});
