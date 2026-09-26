'use client';
import { DEV_DEMO_MODE } from '@/lib/demo/demo-config';
import { demoUsers, demoUnits } from '@/lib/demo/demo-data';

import type {
  AuthMembership,
  AuthUser,
  StoredAuthSession,
  SystemRoleKey,
} from '@/types/auth';

import {
  clearStoredAuthSession,
  getStoredAuthSession,
  setStoredAuthSession,
} from './auth-storage';

const DEV_ORGANIZATION_ID =
  '000000000000000000000001';

const DEV_PROPERTY_ID =
  '000000000000000000000002';

const DEV_BUILDING_ID =
  '000000000000000000000003';

const DEV_FLOOR_ID =
  '000000000000000000000004';

const DEV_UNIT_ID =
  '000000000000000000000005';

const DEV_USER_ID =
  '000000000000000000000006';

/**
 * Development authentication storage key.
 *
 * This is the same client-side session storage used
 * by auth-storage.ts.
 */
const DEV_AUTH_STORAGE_KEY =
  'property-command-center.auth.session';

const DEV_PREVIEW_ROLE_STORAGE_KEY =
  'property-command-center.dev.preview-role';

export const DEV_PREVIEW_ROLE_CHANGED_EVENT =
  'property-command-center:dev-preview-role-changed';

/**
 * Development authentication configuration.
 *
 * Example:
 *
 * NEXT_PUBLIC_DEV_AUTH_BYPASS=true
 * NEXT_PUBLIC_DEV_AUTH_ROLE=LANDLORD
 */
const DEV_AUTH_ENABLED_ENV =
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true';

const DEV_ROLE_ENV =
  process.env.NEXT_PUBLIC_DEV_AUTH_ROLE;

/**
 * Supported development roles.
 *
 * IMPORTANT:
 * These roles are for local UI exploration only.
 * They do not replace backend authorization.
 */
export const DEV_AUTH_ROLES: SystemRoleKey[] = [
  'SUPER_ADMIN',
  'LANDLORD',
  'PROPERTY_MANAGER',
  'CARETAKER',
  'CONTRACTOR',
  'TENANT',
];

/**
 * Alias used by the development role switcher
 * component.
 */
export type DevAuthRole =
  SystemRoleKey;

function isSystemRoleKey(
  value:
    | string
    | null
    | undefined,
): value is SystemRoleKey {
  return (
    typeof value === 'string' &&
    DEV_AUTH_ROLES.includes(
      value as SystemRoleKey,
    )
  );
}

function createDevAuthUser(
  role: SystemRoleKey,
): AuthUser {
  return {
    _id:
      DEV_USER_ID,

    phone:
      '+254700000000',

    email:
      `${role.toLowerCase()}@dev.local`,

    firstName:
      role === 'SUPER_ADMIN'
        ? 'Super'
        : role
            .toLowerCase()
            .split('_')
            .map(
              (part) =>
                part
                  .charAt(0)
                  .toUpperCase() +
                part.slice(1),
            )
            .join(' '),

    lastName:
      'Demo',

    status:
      'ACTIVE',

    isPlatformAdmin:
      role === 'SUPER_ADMIN',
  };
}

function createDevMembership(
  role: SystemRoleKey,
): AuthMembership {
  return {
    organizationId:
      DEV_ORGANIZATION_ID,

    roles: [
      role,
    ],

    permissions: [],

    scope: {
      allProperties:
        role === 'SUPER_ADMIN' ||
        role === 'LANDLORD' ||
        role === 'PROPERTY_MANAGER',

      propertyIds: [
        DEV_PROPERTY_ID,
      ],

      buildingIds: [
        DEV_BUILDING_ID,
      ],

      unitIds: [
        DEV_UNIT_ID,
      ],
    },
  };
}

export function isDevelopmentPreviewRuntime(
  environment = process.env.NODE_ENV,
): boolean {
  return environment !== 'production';
}

export function resolveDevAuthRole(
  storedRole: string | null | undefined,
  configuredRole: string | null | undefined,
  environment = process.env.NODE_ENV,
): SystemRoleKey | null {
  if (!isDevelopmentPreviewRuntime(environment)) {
    return null;
  }

  if (isSystemRoleKey(storedRole)) {
    return storedRole;
  }

  return isSystemRoleKey(configuredRole)
    ? configuredRole
    : null;
}

function getStoredPreviewRole(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(
    DEV_PREVIEW_ROLE_STORAGE_KEY,
  );
}

function notifyPreviewRoleChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new Event(DEV_PREVIEW_ROLE_CHANGED_EVENT),
    );
  }
}

/**
 * Return the application landing page for
 * a specific development role.
 */
export function getDevRoleLanding(
  role: SystemRoleKey,
): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return '/admin';

    case 'LANDLORD':
      return '/dashboard';

    case 'PROPERTY_MANAGER':
      return '/manager';

    case 'CARETAKER':
      return '/caretaker';

    case 'CONTRACTOR':
      return '/contractor';

    case 'TENANT':
      return '/tenant';

    default:
      return '/login';
  }
}

/**
 * Return the configured development role.
 *
 * Example:
 *
 * NEXT_PUBLIC_DEV_AUTH_ROLE=LANDLORD
 */
export function getDevAuthRole():
  | SystemRoleKey
  | null {
  return resolveDevAuthRole(
    getStoredPreviewRole(),
    DEV_ROLE_ENV,
  );
}

/**
 * Determine whether the development authentication
 * bypass is enabled.
 */
export function isDevAuthBypassEnabled(): boolean {
  if (!isDevelopmentPreviewRuntime()) {
    return false;
  }

  const storedRole = getStoredPreviewRole();

  return Boolean(
    isSystemRoleKey(storedRole) ||
    (DEV_AUTH_ENABLED_ENV && getDevAuthRole()),
  );
}

/**
 * Create a local development session.
 *
 * IMPORTANT:
 *
 * There is deliberately NO refreshToken here.
 *
 * Production authentication uses:
 *
 * accessToken
 *   → frontend
 *
 * refreshToken
 *   → httpOnly Secure SameSite cookie
 *
 * The refresh token must never be placed into
 * StoredAuthSession or exposed to JavaScript.
 */
export function createDevAuthSession(
  role: SystemRoleKey,
): StoredAuthSession {
  return {
    accessToken:
      `dev-bypass-${role.toLowerCase()}`,

    user:
      DEV_DEMO_MODE ? { ...createDevAuthUser(role), ...demoUsers.find(user => user.role === role), isPlatformAdmin: role === 'SUPER_ADMIN' } : createDevAuthUser(role),

    roles: [
      role,
    ],

    memberships: [
      DEV_DEMO_MODE ? { ...createDevMembership(role), organizationId: 'demo-org-dapini', scope: { allProperties: ['LANDLORD','SUPER_ADMIN'].includes(role), propertyIds: ['demo-property-1'], buildingIds: ['demo-building-1','demo-building-2'], unitIds: role === 'TENANT' ? ['demo-unit-101'] : demoUnits.filter(unit => unit.propertyId === 'demo-property-1').map(unit => unit._id) } } : createDevMembership(role),
    ],

    authenticatedAt:
      new Date().toISOString(),
  };
}

/**
 * Enable a development authentication session
 * for a specific role.
 */
export function enableDevAuth(
  role: SystemRoleKey,
): StoredAuthSession {
  const session =
    createDevAuthSession(role);

  setStoredAuthSession(
    session,
  );

  return session;
}

/**
 * Enable the role-switcher-facing API.
 */
export function setDevAuthRole(
  role: DevAuthRole,
): StoredAuthSession {
  if (!isDevelopmentPreviewRuntime()) {
    throw new Error(
      'Development role preview is unavailable in production.',
    );
  }

  window.localStorage.setItem(
    DEV_PREVIEW_ROLE_STORAGE_KEY,
    role,
  );

  const session = enableDevAuth(role);
  notifyPreviewRoleChanged();
  return session;
}

export function resetDevAuthRole(): StoredAuthSession | null {
  if (!isDevelopmentPreviewRuntime()) {
    return null;
  }

  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(
      DEV_PREVIEW_ROLE_STORAGE_KEY,
    );
  }

  const configuredRole = resolveDevAuthRole(
    null,
    DEV_ROLE_ENV,
  );

  const session = configuredRole
    ? enableDevAuth(configuredRole)
    : null;

  if (!session) {
    clearStoredAuthSession();
  }

  notifyPreviewRoleChanged();
  return session;
}

/**
 * Enable the role configured through
 * NEXT_PUBLIC_DEV_AUTH_ROLE.
 */
export function enableConfiguredDevAuth():
  | StoredAuthSession
  | null {
  const role =
    getDevAuthRole();

  if (!role) {
    return null;
  }

  return enableDevAuth(
    role,
  );
}

/**
 * Disable the development authentication
 * session.
 */
export function disableDevAuth(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(
      DEV_PREVIEW_ROLE_STORAGE_KEY,
    );
  }

  clearStoredAuthSession();
}

/**
 * Determine whether the currently stored
 * session is a development-bypass session.
 */
export function hasDevAuthSession(): boolean {
  const session =
    getStoredAuthSession();

  return Boolean(
    session?.accessToken?.startsWith(
      'dev-bypass-',
    ),
  );
}

/**
 * Return the role stored in the current
 * development authentication session.
 */
export function getStoredDevAuthRole():
  | SystemRoleKey
  | null {
  const session =
    getStoredAuthSession();

  const role =
    session?.roles?.[0];

  return isSystemRoleKey(
    role,
  )
    ? role
    : null;
}

/**
 * Check whether a client-side development
 * authentication session exists.
 */
export function isDevAuthEnabled(): boolean {
  if (
    typeof window ===
    'undefined'
  ) {
    return false;
  }

  return (
    window.localStorage.getItem(
      DEV_AUTH_STORAGE_KEY,
    ) !== null
  );
}

/**
 * Validate a development role.
 */
export function isValidDevAuthRole(
  role: string,
): role is SystemRoleKey {
  return isSystemRoleKey(
    role,
  );
}

/**
 * Get the landing page for the configured
 * development role.
 */
export function getConfiguredDevRoleLanding(): string {
  const role =
    getDevAuthRole();

  if (!role) {
    return '/login';
  }

  return getDevRoleLanding(
    role,
  );
}
