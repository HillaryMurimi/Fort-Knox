"use client";
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { Alert, Button } from '@/components/ui';
import { successClient, type Customer } from '@/lib/data/sales-success';
type Message = { _id: string; channel: 'EMAIL' | 'SMS'; status: string; deliveryStatus: string; subject?: string; body?: string; recipient?: string; sender: string; payloadHash: string; revision: number; timezone: string; estimatedCostMicroUsd: number; smsSegments?: number; smsEncoding?: string; errorCode?: string; approvalExpiresAt?: string; nextAttemptAt?: string; redactedAt?: string };
type Consent = { _id: string; channel: string; decision: string; evidence: string; createdAt: string };
type Entry = { _id: string; direction: string; subject?: string; text: string; occurredAt: string; correlation?: string; senderAuthentication?: string };
type Capabilities = { email: { provider: string; configured: boolean; sendingAvailable: boolean; authentication: string; webhook: string; inbound: string; costPolicyConfigured: boolean; lastSuccessfulOperation: string | null }; sms: { sendingAvailable: boolean; configured: boolean; authentication: string; maximumSegments: number; costPolicyConfigured: boolean; webhook: string }; whatsapp: { sendingAvailable: boolean } };
const input = 'mt-1 min-w-0 w-full max-w-full rounded-lg border border-border bg-background p-2 text-sm';
const base = '/sales/success';
const write = (path: string, body: unknown) => api(base + path, { method: 'POST', body: JSON.stringify(body) });
const data = (form: HTMLFormElement) => Object.fromEntries(new FormData(form));
export function SalesCustomerOutreach({ customer }: { customer: Customer }) {
  const auth = useAuth(), cache = useQueryClient(), admin = auth.roles.includes('SUPER_ADMIN');
  const can = (p: string) => !auth.isDevMode && (admin || auth.memberships.some(m => m.permissions.includes(p)));
  const scope = [auth.user?._id, auth.memberships.map(m => m.permissions.join(',')).join('|')].join(':');
  const path = `/customers/${customer.id}`, [selected, select] = useState(''), [page, setPage] = useState(1), [feedback, setFeedback] = useState(''), [pending, setPending] = useState(false);
  const enabled = can('sales.outreach.read');
  const capabilities = useQuery({ queryKey: ['sales-success', scope, 'outreach-capabilities'], queryFn: () => api<Capabilities>(base + '/outreach/capabilities'), enabled: admin && !auth.isDevMode });
  const messages = useQuery({ queryKey: ['sales-success', scope, customer.id, 'outreach', page], queryFn: () => api<{ items: Message[] }>(base + path + '/messages?page=' + page), enabled });
  const consents = useQuery({ queryKey: ['sales-success', scope, customer.id, 'consents'], queryFn: () => api<{ items: Consent[] }>(base + path + '/consents'), enabled: can('sales.notes.read') });
  const conversation = useQuery({ queryKey: ['sales-success', scope, customer.id, 'conversation', page], queryFn: () => api<{ items: Entry[] }>(base + path + '/conversation?page=' + page), enabled: enabled && can('sales.notes.read') });
  const preview = useQuery({ queryKey: ['sales-success', scope, customer.id, 'message', selected], queryFn: () => api<{ message: Message; campaign: { name: string; status: string; dailySendLimit: number; perContactLimit: number; budgetMicroUsd: number } }>(base + path + '/messages/' + selected), enabled: !!selected && enabled && can('sales.notes.read') && can('sales.meetings.read') });
  async function act(work: () => Promise<unknown>) {
    setPending(true); setFeedback('');
    try { await work(); await cache.invalidateQueries({ queryKey: ['sales-success'] }); setFeedback('Saved. Provider acceptance, delivery and recipient replies are recorded separately.'); }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Unable to save. Retry after refreshing.'); }
    finally { setPending(false); }
  }
  function form(handler: (values: Record<string, FormDataEntryValue>) => Promise<unknown>) {
    return (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const values = data(event.currentTarget); void act(() => handler(values)); };
  }
  if (!enabled && !admin) return null;
  const message = preview.data?.message;
  return <section className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-5 [overflow-wrap:anywhere]" aria-label="Customer outreach">
    <h2 className="text-lg font-semibold">Consent, outreach &amp; conversation</h2>
    <p className="text-sm text-muted-foreground">Email and SMS drafts require recorded channel consent, an approved campaign and fresh administrator review. Sending also depends on configured providers and enabled controls. Delivery does not confirm that a person read the message.</p>
    {feedback && <p role="status" className="text-sm">{feedback}</p>}
    {admin && <details><summary className="cursor-pointer font-medium">Business delivery readiness</summary>
      {capabilities.isLoading && <p role="status">Reading transport configuration...</p>}
      {capabilities.error && <Alert>{capabilities.error.message}<Button variant="link" onClick={() => void capabilities.refetch()}>Retry</Button></Alert>}
      {capabilities.data?.email && <p className="mt-2 text-sm">Provider: {capabilities.data.email.provider} · {capabilities.data.email.configured ? 'Configured' : 'Not configured'}<br/>Sending prerequisites: {capabilities.data.email.sendingAvailable ? 'Available; live acceptance still requires verification' : 'Unavailable'}<br/>Authentication: {capabilities.data.email.authentication}<br/>Webhook: {capabilities.data.email.webhook}; replies: {capabilities.data.email.inbound}<br/>Cost policy: {capabilities.data.email.costPolicyConfigured ? 'Configured estimate' : 'Missing'}<br/>Last provider acceptance: {capabilities.data.email.lastSuccessfulOperation ? new Date(capabilities.data.email.lastSuccessfulOperation).toLocaleString() : 'None recorded'}</p>}
      {capabilities.data?.sms && <p className="mt-2 text-sm">SMS: Twilio · {capabilities.data.sms.configured ? 'Configured' : 'Not configured'}<br/>SMS sending: {capabilities.data.sms.sendingAvailable ? 'Prerequisites available; live acceptance unverified' : 'Unavailable'}<br/>Dedicated two-way sales number required, separate from account and operational notifications.<br/>Authentication: {capabilities.data.sms.authentication}; webhook: {capabilities.data.sms.webhook}<br/>Maximum segments including the brand and STOP instruction: {capabilities.data.sms.maximumSegments}<br/>Cost ceiling: {capabilities.data.sms.costPolicyConfigured ? 'Configured estimate' : 'Missing'}. Ambiguous SMS attempts are not automatically resent.<br/>WhatsApp remains unavailable in this workflow.</p>}
    </details>}
    {admin && <details><summary className="cursor-pointer font-medium">Record explicit consent or opt-out</summary>
      <form className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={form(v => write(path + '/consents', { ...v, revision: customer.revision, acknowledgePreviousSuppression: v.acknowledgePreviousSuppression === 'on' }))}>
        <label>Channel<select aria-label="Channel" name="channel" className={input}><option>EMAIL</option><option>SMS</option><option>WHATSAPP</option></select></label>
        <label>Decision<select aria-label="Decision" name="decision" className={input}><option value="OPT_IN">Explicit opt-in</option><option value="OPT_OUT">Opt-out across sales channels</option></select></label>
        <label>Recipient timezone<input name="timezone" defaultValue="Africa/Nairobi" required className={input}/></label>
        <label>Evidence of request<textarea name="evidence" minLength={20} maxLength={2000} required className={input}/></label>
        <label className="text-sm"><input type="checkbox" name="acknowledgePreviousSuppression"/> I reviewed any previous suppression and obtained new explicit consent.</label>
        <Button disabled={pending}>Record consent evidence</Button>
      </form>
    </details>}
    {consents.isLoading && <p role="status">Loading consent evidence...</p>}
    {consents.error && <Alert>{consents.error.message}<Button variant="link" onClick={() => void consents.refetch()}>Retry</Button></Alert>}
    {consents.data?.items.length === 0 && <p className="text-sm">No recorded channel-specific consent. A CRM checkbox alone does not permit delivery.</p>}
    {consents.data?.items.map(c => <div key={c._id} className="rounded-lg border p-3 text-sm"><strong>{c.channel} · {c.decision}</strong><p>{c.evidence}</p><time>{new Date(c.createdAt).toLocaleString()}</time></div>)}
    {admin && <details><summary className="cursor-pointer font-medium">Correct primary contact</summary><p className="mt-2 text-sm">Contact changes invalidate previous channel consent and message approvals. Existing opt-outs remain in force.</p>
      <form className="mt-3 grid gap-3" onSubmit={form(v => successClient.update(customer.id, { revision: customer.revision, email: String(v.email).trim() || null, phone: String(v.phone).trim() || null, contactChangeReason: v.contactChangeReason }))}>
        <label>Email<input name="email" type="email" defaultValue={customer.email ?? ''} className={input}/></label>
        <label>Phone in international format<input name="phone" defaultValue={customer.phone ?? ''} className={input}/></label>
        <label>Correction evidence<textarea name="contactChangeReason" required minLength={20} maxLength={2000} className={input}/></label>
        <Button disabled={pending}>Save reviewed contact correction</Button>
      </form></details>}
    {can('sales.outreach.prepare') && <details><summary className="cursor-pointer font-medium">Prepare outreach for review</summary>
      <form className="mt-3 grid gap-3" onSubmit={form(v => write(path + '/messages', { campaignId: v.campaignId, commandId: crypto.randomUUID(), ...(v.originApprovalId ? { originApprovalId: v.originApprovalId } : { ...(v.subject ? { subject: v.subject } : {}), body: v.body }) }))}>
        <label>Approved campaign ID<input name="campaignId" required pattern="[a-fA-F0-9]{24}" className={input}/></label>
        <label>Approved agent proposal ID (optional)<input name="originApprovalId" pattern="[a-fA-F0-9]{24}" className={input}/></label>
        <label>Subject (email only)<input name="subject" minLength={3} maxLength={200} className={input}/></label>
        <label>Message<textarea name="body" minLength={10} maxLength={8000} className={input}/></label>
        <p className="text-sm">The campaign determines the channel. An approved proposal supplies its exact content. Email includes an unsubscribe link and reply route; SMS includes the brand and STOP instruction. Oversized SMS drafts are rejected for revision.</p>
        <Button disabled={pending}>Prepare draft</Button>
      </form></details>}
    {messages.isLoading && <p role="status">Loading messages...</p>}
    {messages.error && <Alert>{messages.error.message}<Button variant="link" onClick={() => void messages.refetch()}>Retry</Button></Alert>}
    {messages.data?.items.length === 0 && <p className="text-sm">No outreach messages recorded.</p>}
    {messages.data?.items.map(m => <div key={m._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div><p className="font-medium">{m.redactedAt ? 'Retained message record' : m.subject ?? 'SMS message'}</p><p className="text-sm">{m.channel} · {m.status} · Delivery: {m.deliveryStatus}{m.errorCode ? ' · ' + m.errorCode : ''}</p></div><Button variant="outline" onClick={() => select(m._id)}>Review message</Button></div>)}
    {preview.isLoading && <p role="status">Loading exact message...</p>}
    {preview.error && <Alert>{preview.error.message}<Button variant="link" onClick={() => void preview.refetch()}>Retry</Button></Alert>}
    {message && <article className="space-y-3 rounded-xl border p-4" aria-label="Exact message review">
      <h3 className="font-semibold">Exact message review</h3>
      <p className="break-all text-sm">From: {message.sender}<br/>To: {message.recipient ?? 'Content expired'}<br/>Timezone: {message.timezone}</p>
      <p>{message.subject}</p><pre className="whitespace-pre-wrap break-words font-sans text-sm">{message.body}</pre>
      {message.channel === 'SMS' && <p className="text-sm">SMS encoding: {message.smsEncoding}; segments: {message.smsSegments}. No automatic resend is allowed after an ambiguous attempt.</p>}
      <p className="text-sm">Campaign: {preview.data?.campaign?.name} · {preview.data?.campaign?.status}<br/>Daily ceiling: {preview.data?.campaign?.dailySendLimit}; contact ceiling: {preview.data?.campaign?.perContactLimit}<br/>Reserved estimate: {message.estimatedCostMicroUsd} micro USD; campaign budget: {preview.data?.campaign?.budgetMicroUsd} micro USD. These are ceilings, not actual charges.</p>
      {message.nextAttemptAt && <p className="text-sm">Scheduled: {new Date(message.nextAttemptAt).toLocaleString()}</p>}
      {message.approvalExpiresAt && <p className="text-sm">Approval expires: {new Date(message.approvalExpiresAt).toLocaleString()}</p>}
      <p className="break-all text-xs text-muted-foreground">Review hash: {message.payloadHash}</p>
      {!message.redactedAt && can('sales.outreach.prepare') && <form className="space-y-2" onSubmit={form(v => write(path + '/messages/' + message._id + '/decisions', { action: v.action, reason: v.reason, revision: message.revision, payloadHash: message.payloadHash }))}>
        <label>Decision<select aria-label="Decision" name="action" required className={input}>
          {message.status === 'DRAFT' && <option value="SUBMIT">Submit for approval</option>}
          {admin && message.status === 'PENDING_APPROVAL' && <><option value="APPROVE">Approve and queue delivery</option><option value="REJECT">Reject</option></>}
          {admin && message.status === 'PAUSED' && <option value="RESUME">Review again and resume</option>}
          {['DRAFT', 'PENDING_APPROVAL', 'QUEUED', 'PAUSED'].includes(message.status) && <option value="CANCEL">Cancel</option>}
        </select></label>
        <label>Review reason<textarea name="reason" minLength={10} maxLength={2000} required className={input}/></label>
        <Button disabled={pending || !['DRAFT', 'PENDING_APPROVAL', 'QUEUED', 'PAUSED'].includes(message.status)}>Save message decision</Button>
      </form>}
    </article>}
    <h3 className="font-medium">Recorded conversation</h3>
    {conversation.isLoading && <p role="status">Loading conversation...</p>}
    {conversation.error && <Alert>{conversation.error.message}<Button variant="link" onClick={() => void conversation.refetch()}>Retry</Button></Alert>}
    {conversation.data?.items.length === 0 && <p className="text-sm">No provider-accepted messages or retrieved replies.</p>}
    {conversation.data?.items.map(e => <article key={e._id} className="rounded-lg border p-3 text-sm"><strong>{e.direction} · {e.subject}</strong><p className="whitespace-pre-wrap break-words">{e.text}</p><p>{new Date(e.occurredAt).toLocaleString()} · {e.correlation ?? 'Outbound'} · {e.senderAuthentication ?? 'Not account authentication'}</p></article>)}
    <div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous messages</Button><span className="whitespace-nowrap">Page {page}</span><Button variant="outline" disabled={(messages.data?.items.length ?? 0) < 20 && (conversation.data?.items.length ?? 0) < 20} onClick={() => setPage(p => p + 1)}>More messages</Button></div>
  </section>;
}
