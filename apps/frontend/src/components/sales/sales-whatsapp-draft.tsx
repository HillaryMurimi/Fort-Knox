"use client";
import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Alert, Button } from '@/components/ui';
type Template = { id: string; name: string; language: string; body: string; header: string; footer: string; parameters: number; hash: string };
type Catalogue = { sender: { name: string; phone: string }; items: Template[]; truncated: boolean };
const input = 'mt-1 min-w-0 w-full rounded-lg border border-border bg-background p-2 text-sm';
export function SalesWhatsAppDraft({ pending, prepare, scope }: { pending: boolean; prepare: (body: unknown) => Promise<void>; scope: string }) {
  const [open, setOpen] = useState(false), [selected, select] = useState('');
  const catalogue = useQuery({ queryKey: ['sales-success', scope, 'whatsapp-templates'], queryFn: () => api<Catalogue>('/sales/success/outreach/whatsapp/templates'), enabled: open, staleTime: 0 });
  const template = catalogue.data?.items.find(t => t.id + ':' + t.language === selected);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!template) return;
    const values = new FormData(event.currentTarget);
    await prepare({ campaignId: values.get('campaignId'), commandId: crypto.randomUUID(), whatsappTemplate: { id: template.id, name: template.name, language: template.language, bindings: Array.from({ length: template.parameters }, (_, n) => values.get('binding' + n)) } });
  }
  return <details onToggle={event => setOpen(event.currentTarget.open)}><summary className="cursor-pointer font-medium">Prepare approved WhatsApp template</summary>
    <p className="mt-2 text-sm">Requires a WhatsApp campaign and explicit WhatsApp consent. Only approved marketing templates from the authorized business account are available. Source and sender are checked again before approval and delivery.</p>
    {catalogue.isLoading && <p role="status">Loading business sender and approved templates...</p>}
    {catalogue.error && <Alert>{catalogue.error.message}<Button variant="link" onClick={() => void catalogue.refetch()}>Retry template lookup</Button></Alert>}
    {catalogue.data && <p className="mt-2 text-sm">Sender: {catalogue.data.sender.name} ({catalogue.data.sender.phone})</p>}
    {catalogue.data?.items.length === 0 && <p>No supported approved marketing templates. Templates need Dapinni branding, a STOP instruction and supported text fields.</p>}
    {catalogue.data?.truncated && <Alert>The bounded template catalogue is incomplete. Ask an administrator to review the business catalogue before selecting a missing template.</Alert>}
    <form className="mt-3 grid min-w-0 gap-3" onSubmit={event => void submit(event)}>
      <label>WhatsApp campaign ID<input name="campaignId" required pattern="[a-fA-F0-9]{24}" className={input}/></label>
      <label>Approved template<select aria-label="Approved WhatsApp template" value={selected} onChange={event => select(event.target.value)} required className={input}><option value="">Select a template</option>{catalogue.data?.items.map(t => <option key={t.id + ':' + t.language} value={t.id + ':' + t.language}>{t.name} ({t.language})</option>)}</select></label>
      {template && <><pre className="whitespace-pre-wrap break-words font-sans text-sm">{[template.header, template.body, template.footer].filter(Boolean).join('\n\n')}</pre>
        {Array.from({ length: template.parameters }, (_, n) => <label key={n}>Value for placeholder {n + 1}<select name={'binding' + n} aria-label={'WhatsApp placeholder ' + (n + 1)} className={input}><option value="CUSTOMER_NAME">Customer name</option><option value="PLANS_URL">Published plans link</option><option value="DEMO_URL">Demo request link</option></select></label>)}
        <p className="break-all text-xs">Source hash: {template.hash}</p></>}
      <Button disabled={pending || !template || catalogue.isFetching}>Prepare WhatsApp draft</Button>
    </form>
  </details>;
}
