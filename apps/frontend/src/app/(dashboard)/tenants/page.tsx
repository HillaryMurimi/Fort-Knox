'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Plus, Search, Users, RefreshCw } from 'lucide-react';
import { StatusSelect,  StatusBadge, PageTitle, EmptyState, Dialog } from '@/components/ui';
import { useOrganization } from '@/hooks/use-organization';
import { useTenanciesQuery, useTenantsQuery } from '@/hooks/queries/use-tenant-queries';
import { useUnitsQuery } from '@/hooks/queries/use-hierarchy-queries';
import { TenantOnboardingForm } from '@/components/tenants/tenant-onboarding-form';
import { useSetupPermission } from '@/hooks/use-setup-permission';
import type { Tenant, Tenancy, Unit } from '@/lib/data/resource-types';

export default function TenantsPage() {
  const { activeOrganizationId } = useOrganization();
  const tenants = useTenantsQuery(activeOrganizationId);
  const canCreate = useSetupPermission(activeOrganizationId, 'onboarding.manage');
  const tenancies = useTenanciesQuery(activeOrganizationId);
  const units = useUnitsQuery(activeOrganizationId);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Tenant['status'] | 'ALL'>('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (tenants.data ?? []).filter((tenant) => {
      const matchesStatus = status === 'ALL' || tenant.status === status;
      const tenancy = (tenancies.data ?? []).find((item) => item.tenantId === tenant._id && ['ACTIVE', 'NOTICE', 'PENDING'].includes(item.status));
      const unit = tenancy ? (units.data ?? []).find((item) => item._id === tenancy.unitId) : undefined;
      const haystack = [tenant.userId, tenant._id, unit?.name, unit?.code, tenancy?.leaseNumber].filter(Boolean).join(' ').toLowerCase();
      return matchesStatus && (!q || haystack.includes(q));
    });
  }, [search, status, tenants.data, tenancies.data, units.data]);

  if (!activeOrganizationId) return <State title="Select an organization" text="Choose an organization to manage tenants." />;
  return <div>
    <PageTitle eyebrow="People" title="People & Tenancies" description="Tenant records, lease relationships and occupancy lifecycle." action={canCreate && <button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={15}/> Add tenant</button>} />
    <div className="card p-4 mb-5 flex flex-col sm:flex-row gap-3">
      <label className="relative flex-1"><Search size={15} className="absolute left-3 top-3 text-muted-foreground"/><input className="pl-9" placeholder="Search tenant, unit or lease…" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      <StatusSelect domain="entity" className="sm:w-44" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option value="ALL">All statuses</option><option value="PROSPECT">Prospect</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="BLACKLISTED">Blacklisted</option></StatusSelect>
    </div>
    {tenants.isLoading ? <div className="card p-10 text-sm text-muted-foreground">Loading tenant records…</div> : tenants.isError ? <State title="Unable to load tenants" text={tenants.error instanceof Error ? tenants.error.message : 'Please try again.'} retry={() => void tenants.refetch()} /> : rows.length ? <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{rows.map((tenant) => <TenantCard key={tenant._id} tenant={tenant} tenancy={(tenancies.data ?? []).find((item) => item.tenantId === tenant._id && ['ACTIVE', 'NOTICE', 'PENDING'].includes(item.status))} unitMap={units.data ?? []} />)}</div> : <EmptyState icon={Users} title="No tenants found" description="Create a tenant record or change the search and status filters." />}
    <Dialog open={showCreate} onOpenChange={setShowCreate} title="Add tenant">{showCreate && canCreate && <TenantOnboardingForm key={activeOrganizationId} organizationId={activeOrganizationId} onCancel={() => setShowCreate(false)} />}</Dialog>
  </div>;
}

function TenantCard({ tenant, tenancy, unitMap }: { tenant: Tenant; tenancy: Tenancy | undefined; unitMap: Unit[] }) {
  const unit = tenancy ? unitMap.find((item) => item._id === tenancy.unitId) : undefined;

  return <Link href={`/tenants/${tenant._id}`} className="card p-5 block hover:-translate-y-0.5 transition-transform"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold">Tenant {tenant._id.slice(-6)}</div><div className="text-xs text-muted-foreground mt-1">{unit ? `${unit.name} · ${unit.code}` : 'No current unit'}</div></div><StatusBadge status={tenant.status} domain="entity">{tenant.status}</StatusBadge></div><div className="grid grid-cols-2 gap-3 mt-5"><Mini label="Lease" value={tenancy?.leaseNumber ?? '—'} /><Mini label="Monthly rent" value={tenancy ? `KES ${tenancy.monthlyRent.toLocaleString()}` : '—'} /></div></Link>;
}
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-muted p-3"><div className="text-[11px] text-muted-foreground">{label}</div><div className="text-sm font-semibold mt-1 truncate">{value}</div></div>; }
function State({ title, text, retry }: { title: string; text: string; retry?: () => void }) { return <div className="card p-10 text-center"><div className="font-semibold">{title}</div><p className="text-sm text-muted-foreground mt-1">{text}</p>{retry && <button onClick={retry} className="btn-secondary mt-4"><RefreshCw size={14}/> Try again</button>}</div>; }