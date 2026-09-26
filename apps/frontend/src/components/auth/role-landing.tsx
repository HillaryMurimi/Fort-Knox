'use client';

import type { SystemRoleKey } from '@/types/auth';
import { useAuth } from '@/hooks/use-auth';

interface RoleLandingProps {
  role: SystemRoleKey;
  title: string;
  description?: string;
}

function formatRole(
  role: SystemRoleKey,
): string {
  return role
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );
}

export function RoleLanding({
  role,
  title,
  description = 'Backend authorization remains authoritative for every resource.',
}: RoleLandingProps) {
  const {
    user,
    roles,
    memberships,
    isAuthenticated,
    isDevMode,
  } = useAuth();

  const hasRequiredRole =
    roles.includes(role);

  // if (
  //   !isAuthenticated ||
  //   !hasRequiredRole
  // ) {
  //   return (
  //     <div className="space-y-6">
  //       <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
  //         <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
  //           Authenticated workspace
  //         </p>

  //         <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
  //           {title}
  //         </h1>

  //         <p className="mt-2 text-sm leading-6 text-muted-foreground">
  //           Welcome,{' '}
  //           {user?.firstName ?? ''}.{' '}
  //           {description}
  //         </p>
  //       </section>

  //       <section className="rounded-2xl border border-rose-200 bg-[var(--danger-soft)] p-6">
  //         <p className="text-sm font-semibold text-[var(--danger-text)]">
  //           This account does not hold
  //           the required role for this
  //           workspace.
  //         </p>

  //         <div className="mt-5 grid gap-4 sm:grid-cols-2">
  //           <div className="rounded-xl border border-rose-200 bg-card/80 p-4">
  //             <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
  //               Roles
  //             </p>

  //             <p className="mt-2 font-semibold text-foreground">
  //               {roles.length > 0
  //                 ? roles
  //                     .map(formatRole)
  //                     .join(', ')
  //                 : 'None'}
  //             </p>
  //           </div>

  //           <div className="rounded-xl border border-rose-200 bg-card/80 p-4">
  //             <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
  //               Organizations
  //             </p>

  //             <p className="mt-2 font-semibold text-foreground">
  //               {memberships.length}
  //             </p>
  //           </div>
  //         </div>

  //         <div className="mt-4 rounded-xl border border-rose-200 bg-card/70 p-4">
  //           <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
  //             Access model
  //           </p>

  //           <p className="mt-2 font-semibold text-foreground">
  //             RBAC + ABAC
  //           </p>
  //         </div>
  //       </section>
  //     </div>
  //   );
  // }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Authenticated workspace
              </p>

              {isDevMode && (
                <span className="inline-flex items-center rounded-full border border-orange-200 bg-[var(--warning-soft)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--warning-text)]">
                  Development Mode
                </span>
              )}
            </div>

            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Welcome,{' '}
              {user?.firstName ?? ''}.{' '}
              {description}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-muted px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Active role
            </p>

            <p className="mt-1 text-sm font-semibold text-foreground">
              {formatRole(role)}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Role
          </p>

          <p className="mt-2 font-semibold text-foreground">
            {formatRole(role)}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Organizations
          </p>

          <p className="mt-2 font-semibold text-foreground">
            {memberships.length}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Access
          </p>

          <p className="mt-2 font-semibold text-[var(--success-text)]">
            Authorized
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Security
          </p>

          <p className="mt-2 font-semibold text-foreground">
            RBAC + ABAC
          </p>
        </div>
      </section>
    </div>
  );
}