'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Command, Eye, RotateCcw, ShieldCheck } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import {
  DEV_AUTH_ROLES,
  getDevAuthRole,
  resetDevAuthRole,
  setDevAuthRole,
} from '@/lib/auth/dev-auth';
import { ROLE_HOME, ROLE_NAVIGATION } from '@/lib/navigation';
import type { SystemRoleKey } from '@/types/auth';

const ROLE_DESCRIPTION: Record<SystemRoleKey, string> = {
  SUPER_ADMIN: 'Platform governance, organizations, access, billing, and system health.',
  LANDLORD: 'Portfolio command, finance, maintenance, security, and intelligence.',
  PROPERTY_MANAGER: 'Assigned portfolio operations, approvals, tenants, and reporting.',
  CARETAKER: 'On-site maintenance, inspections, buildings, and operational alerts.',
  CONTRACTOR: 'Assigned jobs, quotes, invoices, history, and performance.',
  TENANT: 'Home, rent, payments, maintenance, documents, and announcements.',
};

function formatRole(role: SystemRoleKey): string {
  return role.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function DevPreviewScreen() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<SystemRoleKey>('LANDLORD');

  useEffect(() => {
    setSelectedRole(getDevAuthRole() ?? 'LANDLORD');
  }, []);

  function open(role: SystemRoleKey, href: string): void {
    setDevAuthRole(role);
    setSelectedRole(role);
    router.push(href);
  }

  function reset(): void {
    const session = resetDevAuthRole();
    setSelectedRole(session?.roles[0] ?? 'LANDLORD');
  }

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase text-[var(--accent-strong)]">
              <Command size={15} /> Development preview
            </div>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Role workspace directory</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
              Switch presentation roles and open any workspace without changing backend authorization or simulating a production permission grant.
            </p>
          </div>
          <Button variant="outline" onClick={reset}><RotateCcw size={15} /> Reset preview role</Button>
        </header>

        <div className="mt-5 flex items-start gap-3 rounded-md border border-[#b2ddff] bg-[#eff8ff] p-4 text-sm text-[#1849a9]">
          <ShieldCheck className="mt-0.5 shrink-0" size={17} />
          <p><strong>UI preview only.</strong> API requests remain subject to backend RBAC, ABAC, organization scope, resource ownership, and feature entitlements.</p>
        </div>

        <div className="mt-7 grid gap-5 lg:grid-cols-2">
          {DEV_AUTH_ROLES.map((role) => (
            <section key={role} className="card overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] p-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{formatRole(role)}</h2>
                    {selectedRole === role && <Badge tone="orange">Selected</Badge>}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{ROLE_DESCRIPTION[role]}</p>
                </div>
                <Button size="sm" onClick={() => open(role, ROLE_HOME[role])}><Eye size={14} /> View workspace</Button>
              </div>

              <div className="divide-y divide-[var(--border)]">
                {ROLE_NAVIGATION[role].flatMap((section) => section.items).map((route) => (
                  <button
                    key={`${role}-${route.href}-${route.label}`}
                    type="button"
                    onClick={() => open(role, route.href)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left transition hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]"
                  >
                    <span className="min-w-0"><span className="block text-sm font-medium">{route.label}</span><span className="block truncate text-xs text-[var(--muted-foreground)]">{route.href}</span></span>
                    <ArrowUpRight className="shrink-0 text-[var(--muted-foreground)]" size={15} />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
