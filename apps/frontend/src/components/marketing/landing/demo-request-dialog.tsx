'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button, Dialog, Input, Label, Select, Textarea } from '@/components/ui';
import { trackMarketingEvent } from '@/lib/marketing/analytics';
import { demoRequestService, type DemoRequest } from '@/lib/marketing/demo-request';

const initialRequest: DemoRequest = { name: '', phone: '', email: '', properties: '1', units: '1-20', challenge: '' };

export function DemoRequestDialog({ open, onOpenChange, source }: { open: boolean; onOpenChange: (open: boolean) => void; source: string }) {
  const [form,setForm]=useState<DemoRequest>(initialRequest);
  const [reference,setReference]=useState<string>();
  const [error,setError]=useState<string>();
  const [submitting,setSubmitting]=useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(undefined); setSubmitting(true);
    try { const result=await demoRequestService.submit(form); setReference(result.reference); trackMarketingEvent('demo_request_prepared',{source}); }
    catch (reason) { setError(reason instanceof Error?reason.message:'We could not prepare your request.'); }
    finally { setSubmitting(false); }
  }

  return <Dialog open={open} onOpenChange={onOpenChange} title="Request a private demo" description="Tell us what you manage. This preview prepares the request; CRM delivery is connected separately." className="max-w-[720px]">
    {reference?<div className="py-8 text-center"><CheckCircle2 className="mx-auto text-[#067647]" size={38}/><h3 className="mt-4 text-xl font-semibold">Your request is prepared.</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Reference {reference}. No contact data has left this browser because the production lead API is not connected yet.</p><Button className="mt-6" onClick={()=>{setReference(undefined);setForm(initialRequest);onOpenChange(false);}}>Done</Button></div>:
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div><Label htmlFor="demo-name">Name</Label><Input id="demo-name" autoComplete="name" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div>
      <div><Label htmlFor="demo-phone">Phone</Label><Input id="demo-phone" type="tel" autoComplete="tel" required placeholder="+254 7XX XXX XXX" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></div>
      <div className="sm:col-span-2"><Label htmlFor="demo-email">Email</Label><Input id="demo-email" type="email" autoComplete="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></div>
      <div><Label htmlFor="demo-properties">Number of properties</Label><Input id="demo-properties" inputMode="numeric" required value={form.properties} onChange={e=>setForm({...form,properties:e.target.value})}/></div>
      <div><Label htmlFor="demo-units">Approximate units</Label><Select id="demo-units" value={form.units} onChange={e=>setForm({...form,units:e.target.value})}><option>1-20</option><option>21-50</option><option>51-100</option><option>101-250</option><option>250+</option></Select></div>
      <div className="sm:col-span-2"><Label htmlFor="demo-challenge">Primary management challenge</Label><Textarea id="demo-challenge" required placeholder="For example: verifying maintenance expenses across three buildings" value={form.challenge} onChange={e=>setForm({...form,challenge:e.target.value})}/></div>
      {error&&<p role="alert" className="text-sm text-[#b42318] sm:col-span-2">{error}</p>}
      <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={submitting}>Prepare request <ArrowRight size={15}/></Button></div>
    </form>}
  </Dialog>;
}
