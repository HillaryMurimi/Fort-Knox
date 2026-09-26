'use client';

import { ThemeSwitcher } from '@/components/theme-switcher';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as I from './icons';
import { Button, SearchField, Select, Tooltip } from './ui';
import { LocalGreeting } from '@/components/local-greeting';
import { useAuth } from '@/hooks/use-auth';
import { useOrganization } from '@/hooks/use-organization';

interface TopbarProps {
  onMobileMenuToggle: () => void;
  mobileMenuOpen: boolean;
}

export function Topbar({ onMobileMenuToggle, mobileMenuOpen }: TopbarProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { organizations, activeOrganization, activeOrganizationId, setActiveOrganization, isLoading } = useOrganization();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function handleLogout() {
    logout();
    router.replace('/login');
  }

  const initials = user ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase() : 'U';

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-card/95 backdrop-blur-xl">
      <div className="flex min-h-16 items-center gap-2 px-3 sm:gap-3 sm:px-6">
        <Tooltip label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}>
          <Button type="button" variant="outline" size="icon" onClick={onMobileMenuToggle} aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileMenuOpen} className="lg:hidden">
            {mobileMenuOpen ? <I.X size={18} /> : <I.Menu size={18} />}
          </Button>
        </Tooltip>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--foreground)]"><LocalGreeting name={user?.firstName?.trim() || 'landlord'} /></div>
          <div className="hidden truncate text-xs text-[var(--muted-foreground)] sm:block">Portfolio operations and exceptions, in one view.</div>
        </div>

        <ThemeSwitcher/>
        <div className="hidden w-64 xl:block">
          <Select value={activeOrganizationId ?? ''} onChange={(event) => setActiveOrganization(event.target.value)} disabled={isLoading || organizations.length === 0} aria-label="Active organization">
            {organizations.length === 0 ? <option value="">No organization</option> : organizations.map((organization) => <option key={organization._id} value={organization._id}>{organization.name}</option>)}
          </Select>
        </div>

        <SearchField className="hidden w-64 md:block" placeholder="Search portfolio..." aria-label="Global search" />

        <Tooltip label="Notifications">
          <Button type="button" variant="outline" size="icon" aria-label="Notifications" className="relative">
            <I.Bell size={17} />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          </Button>
        </Tooltip>

        <div ref={accountRef} className="relative hidden sm:block">
          <Button type="button" variant="ghost" className="h-10 gap-2 px-1.5" onClick={() => setAccountOpen((value) => !value)} aria-label="Account menu" aria-expanded={accountOpen}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-semibold text-white">{initials}</span>
            <I.ChevronDown size={14} className={accountOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </Button>
          {accountOpen && (
            <div className="absolute right-0 top-12 z-50 w-64 rounded-md border border-[var(--border)] bg-card p-2 shadow-xl">
              <div className="border-b border-[var(--border)] px-2 py-2">
                <div className="truncate text-sm font-semibold">{user?.firstName} {user?.lastName}</div>
                <div className="truncate text-xs text-[var(--muted-foreground)]">{activeOrganization?.name ?? 'No organization selected'}</div>
              </div>
              <Button type="button" variant="ghost" className="mt-1 w-full justify-start text-[#b42318]" onClick={handleLogout}><I.LogOut size={15} /> Sign out</Button>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-[var(--border)] px-3 py-2 xl:hidden">
        <div className="flex items-center gap-2">
          <I.Building2 className="shrink-0 text-[var(--muted-foreground)]" size={15} />
          <Select className="h-9 min-h-9" value={activeOrganizationId ?? ''} onChange={(event) => setActiveOrganization(event.target.value)} disabled={isLoading || organizations.length === 0} aria-label="Active organization">
            {organizations.length === 0 ? <option value="">No organization</option> : organizations.map((organization) => <option key={organization._id} value={organization._id}>{organization.name}</option>)}
          </Select>
        </div>
      </div>
    </header>
  );
}

