"use client";
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { Alert, Button } from '@/components/ui';
import type { Customer } from '@/lib/data/sales-success';

type Step = { index: number; status: string; messageId?: string; agentRunId?: string };
type Plan = { _id: string; trigger: string; status: string; revision: number; sourceKind: string; nextContactAt: string; expiresAt: string; reasonCode?: string; steps: Step[] };
type Template = { id: string; name: string; language: string; parameters: number; body: string; header: string; footer: string };
type Policy = { _id: string; name: string; trigger: string; mode: string; status: string; revision: number; payloadHash: string; responsibleId: string; campaignId: string; audienceLeadIds: string[]; expiresAfterDays: number; maximumAttempts: number; initialDelayMinutes: number; repeatDelayMinutes: number; approvedUntil?: string; templates: { subject?: string; body?: string; whatsappTemplate?: { name: string; language: string; bindings: string[] } }[] };
const triggers = ['QUALIFIED_NOT_CONTACTED', 'DELIVERED_NO_REPLY', 'PROSPECT_REPLIED', 'DEMO_BOOKED', 'DEMO_MISSED', 'DEMO_COMPLETED', 'MEETING_NOT_HELD', 'REGISTRATION_INCOMPLETE', 'EMAIL_VERIFICATION_PENDING', 'CHECKOUT_INCOMPLETE', 'PAYMENT_FAILED', 'SUBSCRIPTION_ACTIVATED', 'PROPERTY_ONBOARDING_NOT_STARTED', 'UNIT_ONBOARDING_STALLED', 'ASSISTANCE_UNRESOLVED', 'CUSTOMER_REQUESTED'];
const input = 'mt-1 min-w-0 w-full rounded-lg border border-border bg-background p-2 text-sm';
const label = (value: string) => value.toLowerCase().replaceAll('_', ' ');
const date = (value: string) => new Date(value).toLocaleString();
export function SalesCustomerFollowups({ customer }: { customer: Customer }) {
  const auth = useAuth(), cache = useQueryClient(), admin = auth.roles.includes('SUPER_ADMIN');
  const can = (permission: string) => !auth.isDevMode && (admin || auth.memberships.some(m => m.permissions.includes(permission)));
  const allowed = can('sales.followups.read') && (!customer.organizationId || can('sales.onboarding.read'));
  const manage = allowed && can('sales.followups.manage') && can('sales.outreach.prepare') && can('sales.notes.create');
  const scope = [auth.user?._id, auth.memberships.map(m => m.permissions.join(',')).join('|')].join(':');
  const root = '/sales/success', path = root + '/customers/' + customer.id + '/followups';
  const [page, setPage] = useState(1), [policyPage, setPolicyPage] = useState(1), [campaignPage, setCampaignPage] = useState(1), [pending, setPending] = useState(false), [feedback, setFeedback] = useState('');
  const [campaignId, setCampaign] = useState(''), [mode, setMode] = useState('AI_PROPOSAL'), [attempts, setAttempts] = useState(2), [open, setOpen] = useState(false), [selectedTemplates, setTemplates] = useState<string[]>([]);
  const plans = useQuery({ queryKey: ['sales-success', scope, customer.id, 'followups', page], queryFn: () => api<{ items: Plan[] }>(path + '?page=' + page), enabled: allowed });
  const options = useQuery({ queryKey: ['sales-success', scope, customer.id, 'followup-options', policyPage], queryFn: () => api<{ items: Policy[]; automationEnabled: boolean }>(path + '/options?page=' + policyPage), enabled: manage });
  const policies = useQuery({ queryKey: ['sales-success', scope, customer.id, 'followup-policies', policyPage], queryFn: () => api<{ items: Policy[] }>(root + '/followups/policies?leadId=' + customer.id + '&page=' + policyPage), enabled: admin && allowed });
  const campaigns = useQuery({ queryKey: ['sales-success', scope, 'followup-campaigns', campaignPage], queryFn: () => api<{ items: { _id: string; name: string; status: string; channel: string }[] }>(root + '/campaigns?page=' + campaignPage), enabled: admin && allowed && open });
  const channel = campaigns.data?.items.find(c => c._id === campaignId)?.channel;
  const human = channel === 'WHATSAPP' || mode === 'HUMAN_TEMPLATE';
  const catalogue = useQuery({ queryKey: ['sales-success', scope, 'whatsapp-templates'], queryFn: () => api<{ items: Template[]; truncated: boolean }>(root + '/outreach/whatsapp/templates'), enabled: admin && open && channel === 'WHATSAPP', staleTime: 0 });
  async function act(url: string, body: unknown) {
    setPending(true); setFeedback('');
    try { await api(url, { method: 'POST', body: JSON.stringify(body) }); await cache.invalidateQueries({ queryKey: ['sales-success'] }); setFeedback('Saved. Each proposed message still needs fresh review in customer outreach.'); }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Unable to save. Refresh and retry.'); }
    finally { setPending(false); }
  }
  function form(handler: (data: FormData) => void) { return (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); handler(new FormData(event.currentTarget)); }; }
  const text = (data: FormData, key: string) => String(data.get(key) ?? '').trim();
  if (!allowed) return null;
  return <section aria-label="Customer follow-ups" className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-5 [overflow-wrap:anywhere]">
    <h2 className="text-lg font-semibold">Follow-ups</h2>
    <p className="text-sm text-muted-foreground">A reviewed policy prepares a bounded sequence of drafts. Replies, new meetings, verified payment, opt-out or onboarding progress stop the old sequence. Each message requires fresh human approval. Contacts use recipient weekdays, 08:00–20:00; uncertain attempts require manual review.</p>
    {feedback && <p role="status">{feedback}</p>}
    {plans.isLoading && <p role="status">Loading follow-up history...</p>}
    {plans.error && <Alert>{plans.error.message}<Button variant="link" onClick={() => void plans.refetch()}>Retry follow-ups</Button></Alert>}
    {plans.data?.items.length === 0 && <p>No follow-up sequences recorded.</p>}
    {plans.data?.items.map(plan => <article key={plan._id} className="min-w-0 space-y-2 rounded-lg border p-3 text-sm">
      <h3 className="font-semibold">{label(plan.trigger)} · {label(plan.status)}</h3>
      <p>Source: {label(plan.sourceKind)}. Next contact: {date(plan.nextContactAt)}. Expires: {date(plan.expiresAt)}.</p>
      {plan.reasonCode && <p>Recorded reason: {label(plan.reasonCode)}</p>}
      {plan.steps.map(step => <p key={step.index}>Step {step.index + 1}: {label(step.status)}{step.messageId && <> · Outreach draft <span className="break-all">{step.messageId}</span></>}{step.agentRunId && <> · Agent task <span className="break-all">{step.agentRunId}</span></>}</p>)}
      {manage && !['STOPPED', 'CANCELLED', 'EXHAUSTED'].includes(plan.status) && <details><summary className="cursor-pointer">Review sequence controls</summary><form key={plan.revision} className="mt-3 grid gap-3" onSubmit={form(d => void act(path + '/' + plan._id + '/controls', { revision: plan.revision, action: text(d, 'action'), context: text(d, 'context'), ...(text(d, 'nextContactAt') ? { nextContactAt: text(d, 'nextContactAt') } : {}) }))}>
        <label>Sequence action<select aria-label="Sequence action" name="action" defaultValue="" required className={input}><option value="" disabled>Choose sequence action</option>{(plan.status === 'ACTIVE' ? ['PAUSE', 'RESCHEDULE', 'ESCALATE', 'CANCEL'] : ['RESUME', 'RESCHEDULE', 'ESCALATE', 'CANCEL']).map(action => <option key={action} value={action}>{label(action)}</option>)}</select></label>
        <label>Next contact, ISO date with offset<input name="nextContactAt" placeholder="2026-11-12T10:00:00+03:00" className={input}/></label>
        <label>Review context<textarea name="context" required minLength={20} maxLength={2000} className={input}/></label>
        <p>Rescheduling requires a date. Resuming rechecks current source evidence and permissions; paused drafts need fresh message review. Failed or uncertain messages cannot be automatically retried.</p><Button disabled={pending}>Apply sequence control</Button>
      </form></details>}
    </article>)}
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={page === 1 || plans.isFetching} onClick={() => setPage(page-1)}>Previous sequences</Button><span>Page {page}</span><Button variant="outline" disabled={plans.isFetching || (plans.data?.items.length ?? 0) < 20} onClick={() => setPage(page+1)}>Next sequences</Button></div>
    {manage && <details><summary className="cursor-pointer font-medium">Enroll an eligible follow-up</summary>
      {options.isLoading && <p role="status">Loading approved policies...</p>}{options.error && <Alert>{options.error.message}<Button variant="link" onClick={() => void options.refetch()}>Retry policies</Button></Alert>}
      {options.data && <p className="mt-2 text-sm">Automation: {options.data.automationEnabled ? 'Enabled; drafts still require review' : 'Off; enrollment and new drafts are blocked'}. Only policies approved for this customer are listed. Current evidence and channel consent are checked by the server.</p>}
      {options.data?.items.length === 0 && <p>No active approved policies on this page.</p>}
      <form className="mt-3 grid gap-3" onSubmit={form(d => void act(path, { policyId: text(d, 'policyId'), commandId: crypto.randomUUID(), evidence: text(d, 'evidence'), ...(text(d, 'nextContactAt') ? { nextContactAt: text(d, 'nextContactAt') } : {}) }))}>
        <label>Approved follow-up policy<select aria-label="Approved follow-up policy" name="policyId" required className={input}><option value="">Select policy</option>{options.data?.items.map(p => <option key={p._id} value={p._id}>{p.name} · {label(p.trigger)}</option>)}</select></label>
        <label>Enrollment evidence<textarea name="evidence" required minLength={20} maxLength={2000} className={input}/></label>
        <label>Optional contact date with offset<input name="nextContactAt" placeholder="2026-11-12T10:00:00+03:00" className={input}/></label><Button disabled={pending || !options.data?.automationEnabled || !options.data.items.length}>Enroll follow-up</Button>
      </form></details>}
    {admin && <details onToggle={event => setOpen(event.currentTarget.open)}><summary className="cursor-pointer font-medium">Create a customer follow-up policy</summary>
      <p className="mt-2 text-sm">This policy applies only to {customer.name}. Draft policies require a separate exact-content activation review with recent administrator verification. Activation may enroll eligible evidence; it never approves a message.</p>
      {campaigns.isLoading && <p role="status">Loading campaigns...</p>}{campaigns.error && <Alert>{campaigns.error.message}<Button variant="link" onClick={() => void campaigns.refetch()}>Retry campaigns</Button></Alert>}
      {campaigns.data && !campaigns.data.items.some(c => c.status === 'ACTIVE') && <p>No active campaigns on this page. Activate a reviewed campaign in Campaigns or check another page.</p>}
      <div className="mt-2 flex flex-wrap gap-2"><Button variant="outline" disabled={campaignPage === 1 || campaigns.isFetching} onClick={() => { setCampaignPage(campaignPage-1); setCampaign(''); setTemplates([]); }}>Previous campaigns</Button><span>Campaign page {campaignPage}</span><Button variant="outline" disabled={campaigns.isFetching || (campaigns.data?.items.length ?? 0) < 20} onClick={() => { setCampaignPage(campaignPage+1); setCampaign(''); setTemplates([]); }}>Next campaigns</Button></div>
      <form className="mt-3 grid min-w-0 gap-3" onSubmit={form(d => {
        const templates = human ? Array.from({ length: attempts }, (_, n) => {
          const template = catalogue.data?.items.find(t => t.id + ':' + t.language === selectedTemplates[n]);
          return channel === 'WHATSAPP' && template ? { whatsappTemplate: { id: template.id, name: template.name, language: template.language, bindings: Array.from({ length: template.parameters }, (_, i) => text(d, `binding-${n}-${i}`)) } } : { body: text(d, 'body-'+n), ...(channel === 'EMAIL' ? { subject: text(d, 'subject-'+n) } : {}) };
        }) : undefined;
        void act(root + '/followups/policies', { name: text(d, 'name'), campaignId, trigger: text(d, 'trigger'), audienceLeadIds: [customer.id], responsibleId: text(d, 'responsibleId'), mode: human ? 'HUMAN_TEMPLATE' : 'AI_PROPOSAL', initialDelayMinutes: Number(d.get('initialDelayHours'))*60, repeatDelayMinutes: Number(d.get('repeatDelayHours'))*60, maximumAttempts: attempts, expiresAfterDays: Number(d.get('expiresAfterDays')), ...(templates ? { templates } : {}) });
      })}>
        <label>Policy name<input name="name" required minLength={3} maxLength={160} className={input}/></label>
        <label>Approved campaign<select aria-label="Approved campaign" required value={campaignId} onChange={event => { setCampaign(event.target.value); setTemplates([]); }} className={input}><option value="">Select active campaign</option>{campaigns.data?.items.filter(c => c.status === 'ACTIVE').map(c => <option key={c._id} value={c._id}>{c.name} · {c.channel}</option>)}</select></label>
        <label>Recorded trigger<select aria-label="Recorded trigger" name="trigger" className={input}>{triggers.map(trigger => <option key={trigger} value={trigger}>{label(trigger)}</option>)}</select></label>
        <label>Responsible representative<select aria-label="Responsible representative" name="responsibleId" className={input}><option value={auth.user?._id}>Me</option>{customer.assignedTo && customer.assignedTo !== auth.user?._id && <option value={customer.assignedTo}>Assigned representative</option>}</select></label>
        <label>Draft preparation<select aria-label="Draft preparation" value={channel === 'WHATSAPP' ? 'HUMAN_TEMPLATE' : mode} disabled={channel === 'WHATSAPP'} onChange={event => setMode(event.target.value)} className={input}><option value="AI_PROPOSAL">AI proposal, followed by human review</option><option value="HUMAN_TEMPLATE">Distinct reviewed content for each step</option></select></label>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2"><label>Initial delay, hours<input name="initialDelayHours" type="number" min={1} max={720} defaultValue={24} required className={input}/></label><label>Repeat delay, hours<input name="repeatDelayHours" type="number" min={1} max={720} defaultValue={48} required className={input}/></label><label>Maximum contact attempts<input type="number" min={1} max={5} value={attempts} onChange={event => setAttempts(Math.min(5, Math.max(1, Number(event.target.value) || 1)))} required className={input}/></label><label>Expires after days<input name="expiresAfterDays" type="number" min={1} max={90} defaultValue={30} required className={input}/></label></div>
        {channel === 'WHATSAPP' && <>{catalogue.isLoading && <p role="status">Loading approved WhatsApp templates...</p>}{catalogue.error && <Alert>{catalogue.error.message}<Button type="button" variant="link" onClick={() => void catalogue.refetch()}>Retry template catalogue</Button></Alert>}{catalogue.data?.truncated && <Alert>The bounded catalogue is incomplete. An administrator must review missing templates.</Alert>}</>}
        {human && Array.from({ length: attempts }, (_, n) => {
          const template = catalogue.data?.items.find(t => t.id + ':' + t.language === selectedTemplates[n]);
          return <fieldset key={n} className="min-w-0 space-y-2 rounded-lg border p-3"><legend>Step {n+1}, distinct content</legend>{channel === 'WHATSAPP' ? <><label>Approved template<select required value={selectedTemplates[n] ?? ''} onChange={event => setTemplates(previous => { const next = [...previous]; next[n] = event.target.value; return next; })} className={input}><option value="">Select template</option>{catalogue.data?.items.map(t => <option key={t.id + ':' + t.language} value={t.id + ':' + t.language}>{t.name} ({t.language})</option>)}</select></label>{template && <><p className="whitespace-pre-wrap">{[template.header, template.body, template.footer].filter(Boolean).join('\n\n')}</p>{Array.from({ length: template.parameters }, (_, i) => <label key={i}>Placeholder {i+1}<select name={`binding-${n}-${i}`} className={input}><option value="CUSTOMER_NAME">Customer name</option><option value="PLANS_URL">Published plans link</option><option value="DEMO_URL">Demo request link</option></select></label>)}</>}</> : <>{channel === 'EMAIL' && <label>Subject<input name={'subject-'+n} required minLength={3} maxLength={200} className={input}/></label>}<label>Message body<textarea name={'body-'+n} required minLength={10} maxLength={channel === 'SMS' ? 800 : 8000} className={input}/></label></>}</fieldset>;
        })}
        <Button disabled={pending || !channel || (channel === 'WHATSAPP' && (!catalogue.data || catalogue.isFetching))}>Create draft policy</Button>
      </form></details>}
    {admin && <details><summary className="cursor-pointer font-medium">Review exact policy content</summary>
      {policies.isLoading && <p role="status">Loading policy reviews...</p>}{policies.error && <Alert>{policies.error.message}<Button variant="link" onClick={() => void policies.refetch()}>Retry policy reviews</Button></Alert>}{policies.data?.items.length === 0 && <p>No policy drafts on this page.</p>}
      {policies.data?.items.map(p => <article key={p._id} className="mt-3 min-w-0 space-y-2 rounded-lg border p-3 text-sm"><h3>{p.name} · {label(p.status)}</h3><p>{label(p.trigger)} · {label(p.mode)} · {p.maximumAttempts} attempts · initial {p.initialDelayMinutes} minutes · repeat {p.repeatDelayMinutes} minutes</p><p>Campaign: {p.campaignId}. Customer cohort: {p.audienceLeadIds.length}. Sequence expires after {p.expiresAfterDays} days.</p><p>Representative: {p.responsibleId}. {p.approvedUntil && <>Approval expires {date(p.approvedUntil)}.</>}</p>{p.templates.map((t, n) => <div key={n}><strong>Step {n+1}</strong><p className="whitespace-pre-wrap">{t.subject}{t.subject && '\n'}{t.body}{t.whatsappTemplate && `${t.whatsappTemplate.name} (${t.whatsappTemplate.language}) · ${t.whatsappTemplate.bindings.join(', ')}`}</p></div>)}<p className="break-all">Reviewed content hash: {p.payloadHash}</p>
        {p.status !== 'ARCHIVED' && <form key={p.revision} className="grid gap-3" onSubmit={form(d => void act(root + '/followups/policies/' + p._id + '/decisions', { revision: p.revision, payloadHash: p.payloadHash, action: text(d, 'action'), reason: text(d, 'reason') }))}><label>Policy decision<select aria-label="Policy decision" name="action" defaultValue="" required className={input}><option value="" disabled>Choose policy decision</option>{['DRAFT', 'PAUSED'].includes(p.status) && <option value="ACTIVATE">Activate reviewed policy</option>}{p.status === 'ACTIVE' && <option value="PAUSE">Pause policy</option>}<option value="ARCHIVE">Archive policy</option></select></label><label>Policy review reason<textarea name="reason" required minLength={20} maxLength={2000} className={input}/></label><Button disabled={pending}>Record policy decision</Button></form>}
      </article>)}
    </details>}
    {manage && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={policyPage === 1} onClick={() => setPolicyPage(policyPage-1)}>Previous policy page</Button><span>Policy page {policyPage}</span><Button variant="outline" disabled={Math.max(options.data?.items.length ?? 0, policies.data?.items.length ?? 0) < 20} onClick={() => setPolicyPage(policyPage+1)}>Next policy page</Button></div>}
  </section>;
}
