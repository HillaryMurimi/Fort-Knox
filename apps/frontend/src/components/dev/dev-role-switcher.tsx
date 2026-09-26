'use client';

import {
  useEffect,
  useState,
} from 'react';

import {
  usePathname,
  useRouter,
} from 'next/navigation';

import {
  Eye,
  LayoutGrid,
  RotateCcw,
} from 'lucide-react';

import {
  DEV_AUTH_ROLES,
  getDevAuthRole,
  getDevRoleLanding,
  isDevAuthBypassEnabled,
  resetDevAuthRole,
  setDevAuthRole,
  type DevAuthRole,
} from '@/lib/auth/dev-auth';

export function DevRoleSwitcher() {
  const router =
    useRouter();

  const pathname =
    usePathname();

  const [
    currentRole,
    setCurrentRole,
  ] =
    useState<DevAuthRole>(
      'LANDLORD',
    );

  const [
    mounted,
    setMounted,
  ] =
    useState(false);

  useEffect(() => {
    setMounted(true);

    const configuredRole =
      getDevAuthRole();

    if (
      isDevAuthBypassEnabled() &&
      configuredRole
    ) {
      setCurrentRole(configuredRole);
    }
  }, []);

  if (
    !isDevAuthBypassEnabled()
  ) {
    return null;
  }

  if (!mounted) {
    return null;
  }

  function handleRoleChange(
    role: DevAuthRole,
  ): void {
    setDevAuthRole(role);

    setCurrentRole(role);

    const landingPage =
      getDevRoleLanding(role);

    if (
      pathname !== landingPage
    ) {
      router.replace(
        landingPage,
      );
    } else {
      router.refresh();
    }
  }

  function resetPreviewRole(): void {
    const session = resetDevAuthRole();
    const role = session?.roles[0] ?? 'LANDLORD';

    setCurrentRole(role);
    router.replace(getDevRoleLanding(role));
    router.refresh();
  }

  return (
    <aside
      aria-label="Development authentication controls"
      className="fixed bottom-4 right-4 z-[9999] w-72 rounded-2xl border border-amber-500/30 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-md"
    >
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-400" />

          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400">
            Development Bypass
          </p>
        </div>

        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Frontend authentication is temporarily
          bypassed for navigation and page testing.
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="development-role"
          className="block text-xs font-medium text-slate-300"
        >
          Simulate role
        </label>

        <select
          id="development-role"
          value={currentRole}
          onChange={(event) =>
            handleRoleChange(
              event.target
                .value as DevAuthRole,
            )
          }
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
        >
          {DEV_AUTH_ROLES.map(
            (role) => (
              <option
                key={role}
                value={role}
              >
                {role}
              </option>
            ),
          )}
        </select>
      </div>

      <div className="mt-4 grid gap-2">
        <button
          type="button"
          onClick={() => router.push(getDevRoleLanding(currentRole))}
          className="flex min-h-9 items-center justify-center gap-2 rounded-md bg-amber-400 px-3 text-xs font-semibold text-slate-950 transition hover:bg-amber-300"
        >
          <Eye size={14} />
          View workspace
        </button>

        <button
          type="button"
          onClick={() => router.push('/dev/preview')}
          className="flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-700 px-3 text-xs font-semibold text-white transition hover:bg-slate-800"
        >
          <LayoutGrid size={14} />
          Preview all screens
        </button>

        <button
          type="button"
          onClick={resetPreviewRole}
          className="flex min-h-9 items-center justify-center gap-2 rounded-md px-3 text-xs font-semibold text-slate-400 transition hover:bg-slate-900 hover:text-white"
        >
          <RotateCcw size={14} />
          Reset preview role
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Current route
        </p>

        <p className="mt-1 truncate text-xs text-slate-300">
          {pathname}
        </p>
      </div>

      <div className="mt-3 rounded-xl border border-amber-900/40 bg-amber-950/20 p-3">
        <p className="text-[10px] leading-4 text-amber-500/80">
          Development only. Backend authentication,
          RBAC, ABAC, organization scoping and
          resource authorization remain unchanged.
        </p>
      </div>
    </aside>
  );
}
