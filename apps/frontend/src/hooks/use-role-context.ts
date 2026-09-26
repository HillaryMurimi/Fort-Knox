'use client';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useOrganization } from '@/hooks/use-organization';
import { roleForPath } from '@/lib/navigation';
export function useRoleContext() {
 const auth = useAuth(); const organization = useOrganization(); const path = usePathname();
 const membership = auth.memberships.find(value => value.organizationId === organization.activeOrganizationId);
 const availableRoles = auth.user?.isPlatformAdmin ? ['SUPER_ADMIN' as const, ...auth.roles] : auth.isDevMode ? auth.roles : membership?.roles ?? [];
 const role = roleForPath(availableRoles, path);
 return { ...auth, ...organization, membership, role, permissions: membership?.permissions ?? [], can: (permission: string) => Boolean(auth.user?.isPlatformAdmin || membership?.permissions.includes('*') || membership?.permissions.includes(permission)) };
}
