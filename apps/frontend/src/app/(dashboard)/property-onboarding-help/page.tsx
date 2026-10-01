'use client';

import { useState, type FormEvent } from 'react';
import { Plus, Trash2, Wrench, CheckCircle2 } from 'lucide-react';
import { Alert, Button, Input, Label, Textarea } from '@/components/ui';
import { useOrganization } from '@/hooks/use-organization';
import { salesClient, type PropertyOnboardingItem } from '@/lib/data/sales';

const emptyProperty = (): PropertyOnboardingItem => ({ name: '', location: '', buildings: 1, units: 1 });

export default function PropertyOnboardingHelpPage() {
  const { activeOrganizationId } = useOrganization();
  const [properties, setProperties] = useState<PropertyOnboardingItem[]>([emptyProperty()]);
  const [preferredDate, setPreferredDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  function update(index: number, patch: Partial<PropertyOnboardingItem>) {
    setProperties((current) => current.map((property, propertyIndex) => propertyIndex === index ? { ...property, ...patch } : property));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeOrganizationId) return;
    setError(undefined);
    setSubmitting(true);
    try {
      await salesClient.requestPropertyOnboarding(activeOrganizationId, { properties, ...(preferredDate ? { preferredDate } : {}), ...(notes ? { notes } : {}) });
      setSubmitted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not submit your setup request.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) return <main className="min-h-screen bg-muted p-6"><div className="mx-auto mt-20 max-w-xl rounded-2xl border border-border bg-card p-8 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={40} /><h1 className="mt-4 text-2xl font-semibold">Setup help requested</h1><p className="mt-3 text-sm text-muted-foreground">Our onboarding team will confirm the session and help you map your properties, buildings, floors and units into the Command Center.</p><Button className="mt-6" onClick={() => window.location.assign('/properties')}>Return to properties</Button></div></main>;
  if (!activeOrganizationId) return <main className="p-6"><Alert tone="destructive">Sign in with an active landlord organization to request onboarding help.</Alert></main>;

  return <main className="min-h-screen bg-muted p-6"><div className="mx-auto max-w-4xl">
    <div className="mb-8"><p className="text-xs font-bold uppercase tracking-[.18em] text-accent-foreground">Customer onboarding</p><h1 className="mt-2 text-3xl font-semibold">Request property setup help</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Share your portfolio outline and our team will help you create the property, building, floor and unit structure.</p></div>
    <form onSubmit={submit} className="space-y-6">
      {properties.map((property, index) => <section key={index} className="rounded-2xl border border-border bg-card p-5"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2 font-semibold"><Wrench size={17} /> Property {index + 1}</div>{properties.length > 1 && <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setProperties((current) => current.filter((_, propertyIndex) => propertyIndex !== index))} aria-label="Remove property"><Trash2 size={17} /></button>}</div><div className="grid gap-4 sm:grid-cols-2"><label><Label htmlFor={`property-name-${index}`}>Property name</Label><Input id={`property-name-${index}`} required value={property.name} onChange={(event) => update(index, { name: event.target.value })} placeholder="Riverside Apartments" /></label><label><Label htmlFor={`property-location-${index}`}>Location</Label><Input id={`property-location-${index}`} value={property.location} onChange={(event) => update(index, { location: event.target.value })} placeholder="Nairobi, Kenya" /></label><label><Label htmlFor={`property-buildings-${index}`}>Buildings</Label><Input id={`property-buildings-${index}`} type="number" min={1} required value={property.buildings} onChange={(event) => update(index, { buildings: Number(event.target.value) })} /></label><label><Label htmlFor={`property-units-${index}`}>Total units</Label><Input id={`property-units-${index}`} type="number" min={1} required value={property.units} onChange={(event) => update(index, { units: Number(event.target.value) })} /></label></div></section>)}
      <Button type="button" variant="secondary" onClick={() => setProperties((current) => [...current, emptyProperty()])}><Plus size={16} /> Add another property</Button>
      <section className="rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold">Schedule and notes</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label><Label htmlFor="preferred-date">Preferred setup date</Label><Input id="preferred-date" type="date" value={preferredDate} onChange={(event) => setPreferredDate(event.target.value)} /></label><label className="sm:col-span-2"><Label htmlFor="setup-notes">Anything our team should prepare?</Label><Textarea id="setup-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Existing spreadsheet, unit list, caretaker details, or special setup needs" /></label></div></section>
      {error && <Alert tone="destructive">{error}</Alert>}
      <div className="flex justify-end"><Button type="submit" loading={submitting}>Request onboarding session <Wrench size={16} /></Button></div>
    </form>
  </div></main>;
}