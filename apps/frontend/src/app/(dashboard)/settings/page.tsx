'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Bell, Building2, CreditCard, Globe2, LockKeyhole, PlugZap, Save, Shield } from 'lucide-react';
import { Alert, Button, Label, PageTitle, Select } from '@/components/ui';
import { useOrganization } from '@/hooks/use-organization';
import { useSetupPermission } from '@/hooks/use-setup-permission';
import { useAuth } from '@/hooks/use-auth';
import { useUpdateOrganizationMutation } from '@/hooks/queries/use-organization-queries';
import { currency } from '@/lib/presentation';
import { canPresentRoute } from '@/lib/navigation';

const destinations = [
  { label: 'Access', href: '/admin', icon: Shield },
  { label: 'Billing', href: '/billing', icon: CreditCard },
  { label: 'Notifications', href: '/notifications', icon: Bell },
  { label: 'Integrations', href: '/integrations', icon: PlugZap },
  { label: 'Security', href: '/security', icon: LockKeyhole },
] as const;

function RegionalSettings({ organizationId }: { organizationId: string }) {
  const { activeOrganization, refreshOrganizations } = useOrganization();
  const { isDevMode } = useAuth();
  const allowed = useSetupPermission(organizationId, 'organization.settings.manage') && !isDevMode;
  const update = useUpdateOrganizationMutation(organizationId);
  const profile = activeOrganization?.regionalProfile;
  const [locale, setLocale] = useState(profile?.locale ?? 'en-KE');
  const [timeZone, setTimeZone] = useState(profile?.timeZone ?? 'Africa/Nairobi');
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    try {
      await update.mutateAsync({ regionalProfile: { locale, timeZone } });
      await refreshOrganizations();
      setSaved(true);
    } catch {
      // The mutation error is shown below the form.
    }
  }

  return <section id="regional-settings" className="border-t border-border pt-8" aria-labelledby="regional-title">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="flex items-center gap-2"><Globe2 size={18} className="text-muted-foreground" /><h2 id="regional-title" className="text-lg font-semibold">Regional profile</h2></div><p className="mt-1 text-sm text-muted-foreground">{activeOrganization?.name ?? 'Organization'}</p></div>
      <span className="rounded border border-border bg-muted px-2 py-1 text-xs font-medium">{profile?.countryCode ?? 'KE'} · {profile?.baseCurrency ?? 'KES'}</span>
    </div>
    <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
      <div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><div className="text-xs text-muted-foreground">Country</div><div className="mt-1 text-sm font-medium">{profile?.countryCode ?? 'KE'}</div></div>
          <div><div className="text-xs text-muted-foreground">Base currency</div><div className="mt-1 text-sm font-medium">{profile?.baseCurrency ?? 'KES'}</div></div>
        </div>
        <p className="mt-4 max-w-xl text-xs leading-5 text-muted-foreground">Country and currency are locked while rent, charges and historical finance records still use the Kenya ledger. Changing display settings does not convert historical amounts.</p>
        {allowed ? <form onSubmit={(event) => void submit(event)} className="mt-6 grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="regional-locale">Display locale</Label><Select id="regional-locale" value={locale} onChange={(event) => { setLocale(event.target.value); setSaved(false); }}><option value="en-KE">English (Kenya)</option><option value="sw-KE">Kiswahili (Kenya)</option><option value="en-GB">English (UK)</option><option value="en-US">English (US)</option></Select></div>
          <div><Label htmlFor="regional-timezone">Time zone</Label><Select id="regional-timezone" value={timeZone} onChange={(event) => { setTimeZone(event.target.value); setSaved(false); }}><option value="Africa/Nairobi">Nairobi (EAT)</option><option value="Etc/UTC">UTC</option><option value="Europe/London">London</option><option value="America/New_York">New York</option></Select></div>
          <div className="sm:col-span-2"><Button type="submit" size="sm" loading={update.isPending}><Save size={15} />Save display settings</Button></div>
        </form> : <p className="mt-6 text-sm text-muted-foreground">Only authorized organization managers can change display settings.</p>}
        {update.error && <Alert className="mt-4" tone="destructive">{update.error.message}</Alert>}
        {saved && <Alert className="mt-4" tone="success">Display settings saved.</Alert>}
      </div>
      <div className="border-l border-border pl-5 sm:pl-6">
        <div className="text-xs font-semibold uppercase text-muted-foreground">Preview</div>
        <div className="mt-3 text-2xl font-semibold tabular-nums">{currency(18500, profile?.baseCurrency ?? 'KES', locale)}</div>
        <div className="mt-2 text-sm text-muted-foreground">{new Intl.DateTimeFormat(locale, { timeZone, year: 'numeric', month: 'long', day: 'numeric' }).format(new Date('2026-09-28T12:00:00Z'))}</div>
      </div>
    </div>
  </section>;
}

export default function Settings() {
  const { activeOrganizationId } = useOrganization();
  const { roles, memberships, isDevMode } = useAuth();
  const permissions = memberships.find((membership) => membership.organizationId === activeOrganizationId)?.permissions ?? [];
  const visibleDestinations = destinations.filter(({ href }) => roles.some((role) => canPresentRoute(role, href, permissions, isDevMode)));
  return <div className="space-y-9">
    <PageTitle eyebrow="Administration" title="Settings" description="Organization controls and connected operations." />
    {activeOrganizationId ? <RegionalSettings key={activeOrganizationId} organizationId={activeOrganizationId} /> : <Alert tone="warning">Select an organization to view its regional profile.</Alert>}
    {visibleDestinations.length > 0 && <nav aria-label="Other settings" className="border-t border-border pt-7">
      <div className="mb-4 flex items-center gap-2"><Building2 size={17} className="text-muted-foreground" /><h2 className="text-sm font-semibold">Other controls</h2></div>
      <div className="grid gap-x-8 sm:grid-cols-2">{visibleDestinations.map(({ label, href, icon: Icon }) => <Link key={label} href={href} className="flex min-h-12 items-center justify-between border-b border-border text-sm font-medium transition-colors hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"><span className="flex items-center gap-3"><Icon size={16} className="text-muted-foreground" />{label}</span><span aria-hidden="true">→</span></Link>)}</div>
    </nav>}
  </div>;
}
