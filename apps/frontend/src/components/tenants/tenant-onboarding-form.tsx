'use client';
import { StatusBadge } from '@/components/ui';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { usePropertiesQuery } from '@/hooks/queries/use-property-queries';
import { useUnitsQuery } from '@/hooks/queries/use-hierarchy-queries';

export function TenantOnboardingForm({ organizationId, onCancel }: { organizationId: string; onCancel: () => void }) {
  const properties = usePropertiesQuery(organizationId);
  const units = useUnitsQuery(organizationId);
  const [propertyId, setPropertyId] = useState('');
  const [unitId, setUnitId] = useState('');
  const mutation = useMutation({ mutationFn: (input: { firstName: string; lastName: string; phone: string; email?: string; unitId: string }) =>
    api<{ status: string; expiresAt: string }>('/organizations/' + organizationId + '/tenant-onboarding', { method: 'POST', body: JSON.stringify(input) }) });
  const vacant = (units.data ?? []).filter(unit => unit.propertyId === propertyId && unit.status === 'VACANT');
  if (mutation.isSuccess) return <div className="space-y-4"><p role="status"><StatusBadge status={mutation.data.status} domain="onboarding" /> Tenant pre-registration saved. The selected unit is reserved until {new Date(mutation.data.expiresAt).toLocaleDateString()}. Phone verification is still required before onboarding is complete.</p><button className="btn-primary" onClick={onCancel}>Done</button></div>;
  return <form className="space-y-4" onSubmit={event => {
    event.preventDefault();
    if (mutation.isPending || !vacant.some(unit => unit._id === unitId)) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') ?? '').trim();
    mutation.mutate({ firstName: String(data.get('firstName')).trim(), lastName: String(data.get('lastName')).trim(), phone: String(data.get('phone')).trim(), unitId, ...(email ? { email } : {}) });
  }}>
    <p className="text-sm text-muted-foreground">Pre-register your tenant and assign a vacant unit. Their unit is fixed during phone verification.</p>
    <fieldset disabled={mutation.isPending} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><label className="block">First name<input name="firstName" autoComplete="given-name" required maxLength={80}/></label><label className="block">Last name<input name="lastName" autoComplete="family-name" required maxLength={80}/></label></div>
      <label className="block">Phone number<input name="phone" type="tel" required pattern="[+][1-9][0-9]{6,14}" placeholder="+254712345678" title="Use international format, for example +254712345678" autoComplete="tel"/></label>
      <label className="block">Email (optional)<input name="email" type="email" autoComplete="email"/></label>
      <label className="block">Property<select required value={propertyId} onChange={event => { setPropertyId(event.target.value); setUnitId(''); }}><option value="">Choose a property</option>{(properties.data ?? []).map(property => <option key={property._id} value={property._id}>{property.name}</option>)}</select></label>
      <label className="block">Vacant unit<select required value={unitId} onChange={event => setUnitId(event.target.value)} disabled={!propertyId}><option value="">Choose a vacant unit</option>{vacant.map(unit => <option key={unit._id} value={unit._id}>{unit.name} ({unit.code})</option>)}</select></label>
      {propertyId && !units.isLoading && !units.isError && vacant.length === 0 && <p role="status" className="text-sm">No vacant units in this property. Add a unit before pre-registering a tenant.</p>}
    </fieldset>
    {(properties.isLoading || units.isLoading) && <p role="status">Loading properties and units?</p>}
    {(properties.isError || units.isError) && <p role="alert">Unable to load available units. <button type="button" onClick={() => { void properties.refetch(); void units.refetch(); }}>Retry</button></p>}
    {mutation.error && <p role="alert" className="text-[var(--danger-text)]">{mutation.error.message}</p>}
    <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" disabled={mutation.isPending} onClick={onCancel}>Cancel</button><button className="btn-primary" disabled={mutation.isPending || !unitId || properties.isError || units.isError}>{mutation.isPending ? 'Saving?' : 'Pre-register tenant'}</button></div>
  </form>;
}
