'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRoleContext } from '@/hooks/use-role-context';
import { canPresentRoute, ROLE_HOME } from '@/lib/navigation';
export function RoutePresentation({ children }: { children: React.ReactNode }) {
 const context = useRoleContext(); const path = usePathname();
 if (context.isLoading) return <p role="status">Loading workspace?</p>;
 if (!context.role || !canPresentRoute(context.role, path, context.permissions, context.isDevMode)) return <section className="card p-8"><h1 className="text-xl font-semibold">Workspace unavailable</h1><p className="mt-2 text-muted-foreground">Your current role does not have access to this workspace.</p><Link className="btn-secondary mt-4" href={context.role ? ROLE_HOME[context.role] : '/login'}>Return to my workspace</Link></section>;
 return <>{children}</>;
}
