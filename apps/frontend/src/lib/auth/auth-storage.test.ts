import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStoredAuthSession, getStoredAuthSession, setStoredAuthSession, updateStoredAccessToken } from './auth-storage';
import type { StoredAuthSession } from '@/types/auth';
const key = 'property-command-center.auth.session';
let values: Map<string, string>;
const session = (admin: boolean): StoredAuthSession => ({ accessToken: 'fixture-access', authenticatedAt: '2026-10-02T12:00:00Z',
  user: { _id: 'fixture-user', phone: '+254700009900', firstName: 'Fixture', lastName: 'User', status: 'ACTIVE', isPlatformAdmin: admin },
  roles: [admin ? 'SUPER_ADMIN' : 'LANDLORD'], memberships: [] });
beforeEach(() => { values = new Map(); vi.stubGlobal('window', { localStorage: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) } }); clearStoredAuthSession(); });
afterEach(() => { clearStoredAuthSession(); vi.unstubAllGlobals(); });
describe('privileged browser session handling', () => {
  it('keeps admin credentials in memory only', () => { setStoredAuthSession(session(true)); expect(values.has(key)).toBe(false); expect(getStoredAuthSession()?.user.isPlatformAdmin).toBe(true); });
  it('preserves ordinary-role persistence', () => { setStoredAuthSession(session(false)); expect(values.has(key)).toBe(true); expect(getStoredAuthSession()?.roles).toEqual(['LANDLORD']); });
  it('purges legacy admin credentials rather than restoring platform UI', () => { values.set(key, JSON.stringify(session(true))); expect(getStoredAuthSession()).toBeNull(); expect(values.has(key)).toBe(false); });
  it('rejects an injected platform role on an ordinary stored identity', () => { values.set(key, JSON.stringify({ ...session(false), roles: ['SUPER_ADMIN'] })); expect(getStoredAuthSession()).toBeNull(); });
  it('rotates admin access credentials in memory', () => { setStoredAuthSession(session(true)); updateStoredAccessToken('fixture-rotated'); expect(getStoredAuthSession()?.accessToken).toBe('fixture-rotated'); expect(values.has(key)).toBe(false); });
  it('clears privileged session state on logout', () => { setStoredAuthSession(session(true)); clearStoredAuthSession(); expect(getStoredAuthSession()).toBeNull(); });
});
