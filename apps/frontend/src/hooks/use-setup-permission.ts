'use client';
import { useAuth } from '@/hooks/use-auth';

// Visibility is UX; the API independently enforces permission and resource scope.
export function useSetupPermission(organizationId: string | null, permission: string) {
  const { user, memberships, isDevMode, roles } = useAuth();
  return Boolean(organizationId && (user?.isPlatformAdmin || (isDevMode && roles.includes('LANDLORD')) || memberships.some(
    membership => membership.organizationId === organizationId &&
      (membership.permissions.includes(permission) || membership.permissions.includes('*')),
  )));
}
