import type { StoredAuthSession } from '../../types/auth';
const AUTH_STORAGE_KEY = 'property-command-center.auth.session';
const isBrowser = () => typeof window !== 'undefined';
export function getStoredAuthSession(): StoredAuthSession | null { if (!isBrowser()) return null; const raw = window.localStorage.getItem(AUTH_STORAGE_KEY); if (!raw) return null; try { const parsed = JSON.parse(raw) as StoredAuthSession; if (!parsed?.accessToken || !parsed.user || !Array.isArray(parsed.roles) || !Array.isArray(parsed.memberships)) throw new Error('invalid'); return parsed; } catch { window.localStorage.removeItem(AUTH_STORAGE_KEY); return null; } }
export function setStoredAuthSession(session: StoredAuthSession): void { if (isBrowser()) window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session)); }
export function updateStoredAccessToken(accessToken: string): StoredAuthSession | null { const current = getStoredAuthSession(); if (!current) return null; const next = { ...current, accessToken }; setStoredAuthSession(next); return next; }
export function clearStoredAuthSession(): void { if (isBrowser()) window.localStorage.removeItem(AUTH_STORAGE_KEY); }
