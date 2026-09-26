'use client';

import Link from 'next/link';
import { navigationFor } from '@/lib/navigation';
import { useRoleContext } from '@/hooks/use-role-context';

import {
  usePathname,
  useRouter,
} from 'next/navigation';

import {
  useEffect,
  useMemo,
} from 'react';

import {
  cn,
} from '@/lib/utils';

import * as I from './icons';

import {
  useAuth,
} from '@/hooks/use-auth';

import {
  useOrganization,
} from '@/hooks/use-organization';

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

type NavigationItem = readonly [
  string,
  string,
  React.ElementType,
];

export function Sidebar({
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const context = useRoleContext();
  const sections = context.role ? navigationFor(context.role, context.permissions, context.isDevMode).map(section => ({ label: section.label, items: section.items.map(item => [item.href, item.label, (I as Record<string, React.ElementType>)[item.icon] ?? I.LayoutDashboard] as NavigationItem) })) : [];
  const pathname =
    usePathname();

  const router =
    useRouter();

  const {
    user,
    logout,
  } = useAuth();

  const {
    activeOrganization,
  } = useOrganization();

  const isPlatformAdmin =
    Boolean(
      user?.isPlatformAdmin,
    );

  const initials =
    user
      ? `${user.firstName.charAt(
          0,
        )}${user.lastName.charAt(
          0,
        )}`.toUpperCase()
      : 'U';

  useEffect(() => {
    onMobileClose();
  }, [
    pathname,
    onMobileClose,
  ]);

  useEffect(() => {
    function handleResize() {
      if (
        window.innerWidth >= 1024
      ) {
        onMobileClose();
      }
    }

    window.addEventListener(
      'resize',
      handleResize,
    );

    return () =>
      window.removeEventListener(
        'resize',
        handleResize,
      );
  }, [onMobileClose]);

  const platformLink = useMemo(
    () =>
      isPlatformAdmin
        ? [
            '/platform',
            'Platform Control',
            I.Globe2,
          ] as const
        : null,
    [isPlatformAdmin],
  );

  function handleLogout() {
    logout();
    onMobileClose();
    router.replace(
      '/login',
    );
  }

  function renderItem(
    item: NavigationItem,
  ) {
    const [
      href,
      label,
      Icon,
    ] = item;

    const active =
      (!href.includes('#') && pathname === href) ||
      pathname.startsWith(
        `${href}/`,
      );

    return (
      <Link
        key={href + label}
        href={href}
        onClick={
          onMobileClose
        }
        className={cn(
          'group relative flex min-h-9 items-center gap-2.5 rounded-md px-2.5 text-[12px] font-medium transition-all duration-200',
          active
            ? 'bg-card/[0.12] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
            : 'text-white/55 hover:bg-card/[0.06] hover:text-white',
        )}
      >
        {active && (
          <span className="absolute bottom-2 left-0 top-2 w-0.5 rounded-full bg-[#d97745]" />
        )}

        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-all',
            active
              ? 'bg-[#d97745]/15 text-[#f2b08d]'
              : 'bg-card/[0.035] text-white/45 group-hover:bg-card/[0.08] group-hover:text-white',
          )}
        >
          <Icon size={15} />
        </span>

        <span className="min-w-0 flex-1 truncate">
          {label}
        </span>

        {label ===
          'Decision Intelligence' && (
          <span className="rounded-full bg-[#d97745]/15 px-1.5 py-0.5 text-[8px] font-bold tracking-wide text-[#f2b08d]">
            AI
          </span>
        )}
      </Link>
    );
  }

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={
            onMobileClose
          }
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[min(88vw,320px)] flex-col overflow-hidden border-r border-white/10 bg-[#17191c]/96 text-white shadow-[20px_0_60px_rgba(16,24,40,0.28)] backdrop-blur-2xl transition-transform duration-300 ease-out lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:w-[248px] lg:translate-x-0 lg:bg-[#17191c]',
          mobileOpen
            ? 'translate-x-0'
            : '-translate-x-full',
        )}
      >
        <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-white/10 px-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#d97745] shadow-lg shadow-orange-950/20">
            <I.Command size={18} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold tracking-tight">
              Command Center
            </div>

            <div className="text-[9px] uppercase tracking-[0.18em] text-white/35">
              Property OS
            </div>
          </div>

          <button
            type="button"
            onClick={
              onMobileClose
            }
            className="flex h-8 w-8 items-center justify-center rounded-md text-white/45 transition hover:bg-card/10 hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <I.X size={17} />
          </button>
        </div>

        <div className="shrink-0 px-3 py-3">
          <div className="rounded-md border border-white/10 bg-card/[0.055] p-3 shadow-inner">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#d97745]/15 text-[#f2b08d]">
                <I.Building2 size={14} />
              </div>

              <div className="min-w-0">
                <div className="text-[8px] font-semibold uppercase tracking-[0.15em] text-white/30">
                  Organization
                </div>

                <div className="truncate text-xs font-medium text-white/85">
                  {activeOrganization?.name ??
                    'No organization'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-2">
          <nav className="h-full overflow-y-auto overscroll-contain pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {platformLink && (
              <div className="mb-2">
                <div className="px-2.5 pb-1.5 pt-1 text-[8px] font-bold uppercase tracking-[0.18em] text-[#f2b08d]/70">
                  Administration
                </div>

                {renderItem(
                  platformLink,
                )}
              </div>
            )}

            {sections.map(
              (section) => (
                <div
                  key={
                    section.label
                  }
                  className="mb-2"
                >
                  <div className="px-2.5 pb-1 pt-1 text-[8px] font-bold uppercase tracking-[0.18em] text-white/25">
                    {section.label}
                  </div>

                  <div className="space-y-0.5">
                    {section.items.map(
                      renderItem,
                    )}
                  </div>
                </div>
              ),
            )}
          </nav>
        </div>

        <div className="shrink-0 border-t border-white/10 p-2">
          <Link
            href="/settings"
            onClick={
              onMobileClose
            }
            className="mb-1 flex min-h-9 items-center gap-2.5 rounded-md px-2.5 text-[12px] font-medium text-white/50 transition hover:bg-card/[0.06] hover:text-white"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-card/[0.035]">
              <I.Settings size={15} />
            </span>

            Settings
          </Link>

          <div className="flex items-center gap-2 rounded-md border border-white/10 bg-card/[0.055] p-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#344054] text-[10px] font-semibold">
              {initials}
            </div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-medium text-white/85">
                {user
                  ? `${user.firstName} ${user.lastName}`
                  : 'User'}
              </div>

              <div className="truncate text-[9px] text-white/35">
                {user?.isPlatformAdmin
                  ? 'Platform Administrator'
                  : 'Authenticated User'}
              </div>
            </div>

            <button
              type="button"
              onClick={
                handleLogout
              }
              aria-label="Sign out"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/30 transition hover:bg-red-500/10 hover:text-red-300"
            >
              <I.LogOut
                size={14}
              />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
