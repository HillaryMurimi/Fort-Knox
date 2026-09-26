export const DEV_DEMO_MODE = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEV_DEMO_MODE === 'true';

export const DEMO_ORGANIZATION_ID = 'demo-org-dapini';

export const DEMO_ROLE_STORAGE_KEY = 'property-command-center.dev-auth-role';

export const DEMO_ROLES = [
  'SUPER_ADMIN',
  'LANDLORD',
  'PROPERTY_MANAGER',
  'CARETAKER',
  'CONTRACTOR',
  'TENANT',
] as const;

export type DemoRole = (typeof DEMO_ROLES)[number];

export function getDemoRole(): DemoRole {
  if (typeof window === 'undefined') return 'LANDLORD';

  const value = window.localStorage.getItem(DEMO_ROLE_STORAGE_KEY);
  return DEMO_ROLES.includes(value as DemoRole) ? (value as DemoRole) : 'LANDLORD';
}
