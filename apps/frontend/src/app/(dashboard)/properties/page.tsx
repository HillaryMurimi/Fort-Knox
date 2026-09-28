'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Building2, Plus } from 'lucide-react';
import { Dialog, EmptyState, PageTitle } from '@/components/ui';
import { PropertyCard } from '@/components/properties/property-card';
import { PropertyForm } from '@/components/properties/property-form';
import { useOrganization } from '@/hooks/use-organization';
import { usePropertiesQuery } from '@/hooks/queries/use-property-queries';
import { useSetupPermission } from '@/hooks/use-setup-permission';

export default function PropertiesPage() {
  const { activeOrganizationId } = useOrganization();
  const properties = usePropertiesQuery(activeOrganizationId);
  const canCreate = useSetupPermission(activeOrganizationId, 'property.create');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [saved, setSaved] = useState(false);
  const rows = (properties.data ?? []).filter(property => [property.name, property.code, property.address.city].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="space-y-5">
    <PageTitle eyebrow="Portfolio" title="Properties" description="Manage your properties, buildings and units." action={canCreate && <Link className="btn-primary" href="/properties/setup"><Plus size={16}/> Set up property</Link>}/>
    {!activeOrganizationId ? <EmptyState icon={Building2} title="Select an organization" description="Choose an organization to manage its portfolio."/> : <>
      {saved && <p role="status" className="text-sm text-[var(--success-text)]">Property created successfully.</p>}
      <input aria-label="Search properties" placeholder="Search properties, codes or cities?" value={search} onChange={event => setSearch(event.target.value)}/>
      {properties.isLoading ? <p role="status">Loading properties?</p> : properties.isError ? <div role="alert">{properties.error.message} <button className="btn-secondary" onClick={() => void properties.refetch()}>Retry</button></div> : rows.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.map(property => <PropertyCard key={property._id} property={property}/>)}</div> : <EmptyState icon={Building2} title={search ? 'No matching properties' : 'Add your first property'} description={search ? 'Try another search.' : 'Create a property to start setting up your portfolio.'}/>}
      <Dialog open={open} onOpenChange={setOpen} title="Add property">{open && canCreate && <PropertyForm key={activeOrganizationId} organizationId={activeOrganizationId} onDone={() => { setOpen(false); setSaved(true); }} onCancel={() => setOpen(false)}/>}</Dialog>
    </>}
  </div>;
}
