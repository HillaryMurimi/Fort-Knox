'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { Alert, Button, StatusBadge } from '@/components/ui';
import { campaignClient as client, type SalesCampaign } from '@/lib/data/sales-campaigns';
const field = 'mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm';
const localTime = (s?: string) => s ? new Date(new Date(s).getTime() - new Date(s).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
const text = (f: FormData, key: string) => String(f.get(key) ?? '').trim();
export function SalesCampaigns() {
  const auth = useAuth(), cache = useQueryClient();
  const admin = auth.roles.includes('SUPER_ADMIN') && !auth.isDevMode;
  const [editing, setEditing] = useState<SalesCampaign | null>(null);
  const [page, setPage] = useState(1), [selected, setSelected] = useState<SalesCampaign | null>(null), [linkPage, setLinkPage] = useState(1);
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(''), [href, setHref] = useState('');
  const campaigns = useQuery({ queryKey: ['sales-campaigns', auth.user?._id, page], queryFn: () => client.list(page), enabled: admin });
  const links = useQuery({ queryKey: ['sales-campaign-links', auth.user?._id, selected?._id, linkPage], queryFn: () => client.links(selected!._id, linkPage), enabled: admin && !!selected });
  async function act(work: () => Promise<unknown>) {
    setBusy(true); setFeedback('');
    try { await work(); await Promise.all([cache.invalidateQueries({ queryKey: ['sales-campaigns'] }), cache.invalidateQueries({ queryKey: ['sales-campaign-links'] })]); setFeedback('Saved and audited.'); }
    catch (e) { setFeedback(e instanceof Error ? e.message : 'Unable to save campaign'); }
    finally { setBusy(false); }
  }
  if (!admin) return <Alert>Campaign governance requires SUPER_ADMIN access.</Alert>;
  return <div className="grid items-start gap-6 lg:grid-cols-2">
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-xl font-semibold">{editing ? 'Edit draft campaign' : 'Campaign preparation'}</h2>{editing && <Button variant="outline" onClick={() => setEditing(null)}>Cancel editing</Button>}
      <p className="text-sm text-muted-foreground">Draft, review and activate a bounded campaign. Approval does not send messages. Activation and approval require recent dual-channel administrator verification.</p>
      {feedback && <p role="status">{feedback}</p>}
      {href && <div className="rounded-lg border p-3"><p className="text-sm">Copy this invitation now. It is shown once.</p><input className={field} aria-label="Generated invitation link" readOnly value={href} onFocus={e => e.currentTarget.select()} /></div>}
      <form key={editing ? editing._id + editing.revision : 'new'} className="space-y-3" onSubmit={e => {
        e.preventDefault(); const form = e.currentTarget, f = new FormData(form);
        void act(async () => { const body = { name: text(f, 'name'), description: text(f, 'description'), audience: text(f, 'audience'), market: text(f, 'market'), channel: text(f, 'channel'), startsAt: new Date(text(f, 'startsAt')).toISOString(), endsAt: new Date(text(f, 'endsAt')).toISOString(), messaging: text(f, 'messaging'), selectionCriteria: text(f, 'selectionCriteria'), dailySendLimit: Number(f.get('dailySendLimit')), perContactLimit: Number(f.get('perContactLimit')), budgetMicroUsd: Number(f.get('budgetMicroUsd')), attributionDays: Number(f.get('attributionDays')), followUpDays: text(f, 'followUpDays') ? text(f, 'followUpDays').split(',').map(Number) : [] }; if (editing) await client.update(editing._id, { revision: editing.revision, campaign: body }); else await client.create(body); setEditing(null); form.reset(); });
      }}>
        <label className="block text-sm">Campaign name<input className={field} name="name" defaultValue={editing?.name ?? ''} required minLength={3} maxLength={160} /></label>
        <label className="block text-sm">Description<textarea className={field} name="description" defaultValue={editing?.description ?? ''} required minLength={10} maxLength={4000} /></label>
        <label className="block text-sm">Target audience<textarea className={field} name="audience" defaultValue={editing?.audience ?? ''} required minLength={10} maxLength={2000} /></label>
        <label className="block text-sm">Market<input className={field} name="market" defaultValue={editing?.market ?? ''} required minLength={2} maxLength={120} /></label>
        <label className="block text-sm">Channel<select aria-label="Channel" className={field} name="channel" defaultValue={editing?.channel ?? 'EMAIL'}><option>EMAIL</option><option>SMS</option><option>WHATSAPP</option></select></label>
        <label className="block text-sm">Start (your local time)<input className={field} type="datetime-local" name="startsAt" defaultValue={localTime(editing?.startsAt)} required /></label>
        <label className="block text-sm">End (your local time)<input className={field} type="datetime-local" name="endsAt" defaultValue={localTime(editing?.endsAt)} required /></label>
        <label className="block text-sm">Message for review<textarea className={field} name="messaging" defaultValue={editing?.messaging ?? ''} required minLength={10} maxLength={12000} /></label>
        <label className="block text-sm">Lead selection criteria<textarea className={field} name="selectionCriteria" defaultValue={editing?.selectionCriteria ?? ''} required minLength={10} maxLength={2000} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">Daily send ceiling<input className={field} type="number" name="dailySendLimit" min={1} max={1000} defaultValue={editing?.dailySendLimit ?? 20} required /></label>
          <label className="text-sm">Messages per contact<input className={field} type="number" name="perContactLimit" min={1} max={5} defaultValue={editing?.perContactLimit ?? 2} required /></label>
          <label className="text-sm">Budget (micro USD)<input className={field} type="number" name="budgetMicroUsd" min={0} max={1000000000} defaultValue={editing?.budgetMicroUsd ?? 0} required /></label>
          <label className="text-sm">Attribution window (days)<input className={field} type="number" name="attributionDays" min={1} max={90} defaultValue={editing?.attributionDays ?? 30} required /></label>
        </div>
        <label className="block text-sm">Follow-up days after initial message (comma separated)<input className={field} name="followUpDays" defaultValue={editing?.followUpDays.join(', ') ?? ''} placeholder="3,7" /></label>
        <Button type="submit" disabled={busy}>{editing ? 'Save draft changes' : 'Save draft campaign'}</Button>
      </form>
    </section>
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-xl font-semibold">Campaign review &amp; invitations</h2>
      {campaigns.isLoading && <p role="status">Loading campaigns...</p>}
      {campaigns.error && <Alert>{campaigns.error.message}<Button variant="link" onClick={() => void campaigns.refetch()}>Retry</Button></Alert>}
      {campaigns.data?.items.length === 0 && <p>No campaigns yet.</p>}
      {campaigns.data?.items.map(c => <article key={c._id} className="space-y-3 rounded-xl border border-border p-4">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{c.name}</h3><StatusBadge status={c.status} /></div>
        <p>{c.description}</p><p className="text-sm">{c.channel} · {c.market} · {c.agent}</p>
        <details><summary className="cursor-pointer">Review exact campaign</summary><dl className="mt-3 space-y-2 text-sm">
          <dt>Audience</dt><dd>{c.audience}</dd><dt>Selection</dt><dd>{c.selectionCriteria}</dd><dt>Messaging</dt><dd className="whitespace-pre-wrap">{c.messaging}</dd>
          <dt>Schedule</dt><dd>{new Date(c.startsAt).toLocaleString()} to {new Date(c.endsAt).toLocaleString()}</dd>
          <dt>Limits</dt><dd>{c.dailySendLimit}/day; {c.perContactLimit}/contact; budget {c.budgetMicroUsd} micro USD; follow-up days {c.followUpDays.join(', ') || 'none'}; attribution {c.attributionDays} days</dd>
        </dl></details>
        <form className="space-y-2" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void act(() => client.command(c._id, { revision: c.revision, action: text(f, 'action'), ...(c.payloadHash ? { payloadHash: c.payloadHash } : {}), reason: text(f, 'reason') })); }}>
          <label className="block text-sm">Action<select name="action" aria-label="Campaign action" className={field}>
            {(c.status === 'DRAFT' ? ['SUBMIT', 'CANCEL'] : c.status === 'PENDING_APPROVAL' ? ['APPROVE', 'REJECT', 'CANCEL'] : c.status === 'APPROVED' ? ['ACTIVATE', 'CANCEL'] : c.status === 'ACTIVE' ? ['PAUSE', 'COMPLETE', 'CANCEL'] : c.status === 'PAUSED' ? ['RESUME', 'COMPLETE', 'CANCEL'] : []).map(a => <option key={a}>{a}</option>)}
          </select></label>
          <label className="block text-sm">Review reason<textarea name="reason" className={field} required minLength={10} maxLength={2000} /></label>
          <Button type="submit" disabled={busy || ['COMPLETED', 'CANCELLED'].includes(c.status)}>Apply reviewed action</Button>
        </form>
        {c.status === 'DRAFT' && <Button variant="outline" onClick={() => setEditing(c)}>Edit draft</Button>}
        <Button variant="outline" onClick={() => { setSelected(c); setLinkPage(1); setHref(''); }}>Manage invitations</Button>
      </article>)}
      <div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous campaigns</Button><Button variant="outline" disabled={!campaigns.data || page * 20 >= campaigns.data.total} onClick={() => setPage(p => p + 1)}>Next campaigns</Button></div>
      {selected && <div className="space-y-3 border-t pt-4"><h3 className="font-semibold">Invitations: {selected.name}</h3>
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void act(async () => { const result = await client.link(selected._id, { leadId: text(f, 'leadId'), destination: text(f, 'destination'), expiresAt: new Date(text(f, 'expiresAt')).toISOString() }); setHref(window.location.origin + result.href); }); }}>
          <label className="block text-sm">Customer ID<input className={field} name="leadId" required pattern="[a-fA-F0-9]{24}" /></label>
          <label className="block text-sm">Destination<select className={field} name="destination"><option>PLANS</option><option>SIGNUP</option><option>DEMO</option></select></label>
          <label className="block text-sm">Expires (your local time)<input className={field} type="datetime-local" name="expiresAt" required /></label>
          <Button type="submit" disabled={busy}>Create invitation for active campaign</Button>
        </form>
        {links.isLoading && <p role="status">Loading invitations...</p>}{links.error && <Alert>{links.error.message}</Alert>}
        {links.data?.items.length === 0 && <p>No invitations in this page.</p>}
        {links.data?.items.map(l => <div key={l._id} className="rounded border p-2 text-sm"><p>{l.destination} · {l.leadId} · expires {new Date(l.expiresAt).toLocaleString()}</p><Button variant="outline" disabled={busy || !!l.revokedAt} onClick={() => void act(() => client.revoke(l._id))}>{l.revokedAt ? 'Revoked' : 'Revoke invitation'}</Button></div>)}
        <div className="flex gap-2"><Button disabled={linkPage <= 1} variant="outline" onClick={() => setLinkPage(p => p - 1)}>Previous invitations</Button><Button disabled={(links.data?.items.length ?? 0) < 20} variant="outline" onClick={() => setLinkPage(p => p + 1)}>Next invitations</Button></div>
      </div>}
    </section>
  </div>;
}
