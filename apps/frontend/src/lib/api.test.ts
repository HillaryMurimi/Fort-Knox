import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveApiBaseUrl } from './api';
import { resolveDevAuthRole } from './auth/dev-auth';

describe('production client configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('requires an explicit API URL in production', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', undefined);
    expect(() => resolveApiBaseUrl(undefined, 'production')).toThrow(/NEXT_PUBLIC_API_URL/);
  });

  it('uses the configured production environment when arguments are omitted', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test/api/v1/');
    expect(resolveApiBaseUrl()).toBe('https://api.example.test/api/v1');

    vi.stubEnv('NEXT_PUBLIC_API_URL', undefined);
    expect(() => resolveApiBaseUrl()).toThrow(/NEXT_PUBLIC_API_URL/);
  });

  it('rejects insecure cross-origin API URLs in production', () => {
    expect(() => resolveApiBaseUrl('http://api.example.test/api/v1', 'production')).toThrow(/HTTPS/);
  });

  it('accepts HTTPS and same-origin production API URLs', () => {
    expect(resolveApiBaseUrl('https://api.example.test/api/v1/', 'production')).toBe('https://api.example.test/api/v1');
    expect(resolveApiBaseUrl('/api/v1', 'production')).toBe('/api/v1');
  });

  it('allows loopback HTTP for local production-build verification', () => {
    expect(resolveApiBaseUrl('http://localhost:9000/api/v1', 'production')).toBe('http://localhost:9000/api/v1');
  });

  it('never resolves a preview role in production', () => {
    expect(resolveDevAuthRole('TENANT', 'LANDLORD', 'production')).toBeNull();
  });
});
