"use client";
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { Alert, Button } from '@/components/ui';
import type { Customer } from '@/lib/data/sales-success';

type Assistance = { _id: string; source?: string; status: string; assignedTo?: string; preferredDate?: string; guidance?: string; notes?: string; outcome?: string; revision?: number; createdAt: string };
const field = 'mt-1 w-full min-w-0 rounded-lg border border-border bg-background p-2 text-sm';
const label = (value: string) => value.toLowerCase().replaceAll('_', ' ');

export function SalesCustomerAssistance({ customer }: { customer: Customer }) {
  const auth = useAuth(), cache = useQueryClient();
  const admin = auth.roles.includes('SUPER_ADMIN');
  const can = (permission: string) => !auth.isDevMode && (admin || auth.memberships.some(member => member.permissions.includes(permission)));
  const allowed = can('sales.onboarding.read') && can('sales.notes.read');
  const [page, setPage] = useState(1), [pending, setPending] = useState(false), [feedback, setFeedback] = useState('');
  const scope = [auth.user?._id, admin, auth.memberships.map(member => member.permissions.join(',')).join('|')].join(':');
  const path = '/sales/success/customers/' + customer.id + '/assistance';
  const query = useQuery({ queryKey: ['sales-success', scope, customer.id, customer.organizationId, 'assistance', page], queryFn: () => api<{ items: Assistance[]; total: number }>(path + '?page=' + page), enabled: allowed && !!customer.organizationId });
  async function control(request: Assistance, data: FormData) {
    setPending(true); setFeedback('');
    try {
      const action = String(data.get('action')), scheduled = String(data.get('preferredDate') ?? '');
      await api(path + '/' + request._id + '/controls', { method: 'POST', body: JSON.stringify({ revision: request.revision ?? 0, action, reason: String(data.get('reason')), ...(action === 'ASSIGN' ? { assignedTo: String(data.get('assignedTo')).trim() } : {}), ...(action === 'SCHEDULE' ? { preferredDate: new Date(scheduled).toISOString() } : {}) }) });
      await cache.invalidateQueries({ queryKey: ['sales-success'] }); setFeedback('Assistance updated. Customer messages and account changes use their separate workflows.');
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Unable to update assistance. Please retry.'); }
    finally { setPending(false); }
  }
  if (!allowed || !customer.organizationId) return null;
  return <section aria-label="Onboarding assistance" className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-5 [overflow-wrap:anywhere]">
    <h2 className="text-lg font-semibold">Onboarding assistance</h2>
    <p className="text-sm text-muted-foreground">Customer requests and approved internal recommendations appear here. Internal recommendations start when a Super Admin approves an Onboarding Success or CRM Intelligence assistance proposal.</p>
    {feedback && <p role="status">{feedback}</p>}
    {query.isLoading && <p role="status">Loading assistance...</p>}
    {query.error && <Alert>{query.error.message}<Button variant="link" onClick={() => void query.refetch()}>Retry assistance</Button></Alert>}
    {query.data?.items.length === 0 && <p className="text-sm">No assistance requests recorded.</p>}
    {query.data?.items.map(request => <article key={request._id} className="min-w-0 space-y-3 rounded-lg border p-4 text-sm">
      <h3 className="font-medium">{request.source === 'INTERNAL_ASSISTANCE' ? 'Internal recommendation' : 'Customer request'} · {label(request.status)}</h3>
      <p>Opened {new Date(request.createdAt).toLocaleString()}{request.preferredDate ? ' · Scheduled ' + new Date(request.preferredDate).toLocaleString() : ''}</p>
      <p>Assigned representative: {request.assignedTo ?? 'Awaiting assignment'}</p>
      {request.guidance && <p className="whitespace-pre-wrap">{request.guidance}</p>}
      {request.notes && <p className="whitespace-pre-wrap">{request.notes}</p>}
      {request.outcome && <p className="whitespace-pre-wrap">Recorded outcome: {request.outcome}</p>}
      {can('sales.assistance.manage') && (admin || request.assignedTo === auth.user?._id) && !['COMPLETED', 'CANCELLED'].includes(request.status) && <AssistanceControls key={request.revision ?? 0} request={request} admin={admin} pending={pending} submit={data => void control(request, data)} />}
    </article>)}
    <div className="flex items-center gap-3"><Button variant="outline" disabled={page === 1 || query.isFetching} onClick={() => setPage(value => value - 1)}>Previous assistance</Button><span className="text-sm">Page {page}</span><Button variant="outline" disabled={query.isFetching || page * 20 >= (query.data?.total ?? 0)} onClick={() => setPage(value => value + 1)}>Next assistance</Button></div>
  </section>;
}

function AssistanceControls({ request, admin, pending, submit }: { request: Assistance; admin: boolean; pending: boolean; submit: (data: FormData) => void }) {
  const [action, setAction] = useState(request.status === 'IN_PROGRESS' ? 'COMPLETE' : 'START');
  return <details><summary className="cursor-pointer">Update assistance</summary><form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); submit(new FormData(event.currentTarget)); }}>
    <label>Action<select name="action" value={action} onChange={event => setAction(event.target.value)} className={field}>{request.status !== 'IN_PROGRESS' && <><option value="START">Start work</option><option value="SCHEDULE">Schedule assistance</option></>}{request.status === 'IN_PROGRESS' && <option value="COMPLETE">Record completion</option>}{admin && <option value="ASSIGN">Assign representative</option>}<option value="CANCEL">Cancel request</option></select></label>
    {action === 'ASSIGN' && <label>Authorized representative ID<input name="assignedTo" pattern="[a-fA-F0-9]{24}" required className={field} defaultValue={request.assignedTo ?? ''} /></label>}
    {action === 'SCHEDULE' && <label>Assistance date (your local time)<input type="datetime-local" name="preferredDate" required className={field} /></label>}
    <label className="sm:col-span-2">Reason or outcome<textarea name="reason" required minLength={20} maxLength={2000} className={field} /></label>
    <Button type="submit" disabled={pending}>{pending ? 'Saving...' : 'Save assistance update'}</Button>
  </form></details>;
}
