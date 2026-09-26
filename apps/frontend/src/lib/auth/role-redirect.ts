import type { SystemRoleKey } from '../../types/auth';

export function getRoleRedirect(
  roles?: SystemRoleKey[] | null,
): string {
  if (!Array.isArray(roles)) {
    return '/login';
  }

  if (roles.includes('SUPER_ADMIN')) {
    return '/admin';
  }

  if (roles.includes('LANDLORD')) {
    return '/dashboard';
  }

  if (roles.includes('PROPERTY_MANAGER')) {
    return '/manager';
  }

  if (roles.includes('CARETAKER')) {
    return '/caretaker';
  }

  if (roles.includes('CONTRACTOR')) {
    return '/contractor';
  }

  if (roles.includes('TENANT')) {
    return '/tenant';
  }

  return '/login';
}