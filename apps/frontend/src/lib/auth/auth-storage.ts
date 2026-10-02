import type { StoredAuthSession } from '../../types/auth';
const AUTH_STORAGE_KEY = 'property-command-center.auth.session';
const isBrowser = () => typeof window !== 'undefined';
let privilegedSession: StoredAuthSession | null = null;

export function getStoredAuthSession(): StoredAuthSession | null {
  if (!isBrowser()) return null;
  if (privilegedSession) return privilegedSession;
  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredAuthSession;
    if (!parsed?.accessToken || !parsed.user || !Array.isArray(parsed.roles) || !Array.isArray(parsed.memberships)) throw new Error('invalid');
    // Older persisted admin tokens cannot restore privileged UI state.
    if (parsed.user.isPlatformAdmin || parsed.roles.includes('SUPER_ADMIN')) throw new Error('privileged');
    return parsed;
  } catch { window.localStorage.removeItem(AUTH_STORAGE_KEY); return null; }
}
export function setStoredAuthSession(session: StoredAuthSession): void {
  if (!isBrowser()) return;
  if (session.user.isPlatformAdmin || session.roles.includes('SUPER_ADMIN')) {
    privilegedSession = session;
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } else { privilegedSession = null; window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session)); }
}
export function updateStoredAccessToken(accessToken: string): StoredAuthSession | null {
  const current = getStoredAuthSession(); if (!current) return null;
  const next = { ...current, accessToken }; setStoredAuthSession(next); return next;
}
export function clearStoredAuthSession(): void { privilegedSession = null; if (isBrowser()) window.localStorage.removeItem(AUTH_STORAGE_KEY); }
