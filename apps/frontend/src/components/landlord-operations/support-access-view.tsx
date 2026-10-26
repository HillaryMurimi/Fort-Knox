'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useOrganization } from '@/hooks/use-organization';
import { Alert, Button } from '@/components/ui';
import { landlordOperationsClient as client } from '@/lib/data/landlord-operations';

export function SupportAccessView() {
  const auth = useAuth();
  const { activeOrganizationId } = useOrganization();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const enabled = auth.roles.includes('LANDLORD') && !auth.isDevMode && !!activeOrganizationId;
  const query = useQuery({ queryKey: ['owner-support-sessions', activeOrganizationId], queryFn: () => client.supportSessions(activeOrganizationId!), enabled });
  async function decide(id: string, action: 'approve' | 'reject' | 'end') {
    setBusy(id); setError(''); setNotice('');
    try {
      if (action === 'approve') await client.approveSupport(id);
      else if (action === 'reject') await client.rejectSupport(id);
      else await client.endSupport(id);
      setNotice(action === 'approve' ? 'Access approved for the stated purpose.' : action === 'reject' ? 'Request rejected.' : 'Access ended immediately.');
      await qc.invalidateQueries({ queryKey: ['owner-support-sessions', activeOrganizationId] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Action failed.'); }
    finally { setBusy(null); }
  }
  if (!enabled) return <Alert tone="warning">Select your landlord organization and sign in with a real owner session to manage support access.</Alert>;
  return <main className="mx-auto max-w-4xl space-y-6 pb-16">
    <header className="border-b border-border pb-5"><p className="text-xs font-semibold uppercase text-muted-foreground">Account security</p><h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold"><ShieldCheck size={28} /> Support access</h1><p className="mt-2 text-sm text-muted-foreground">Only you can approve assisted property setup. Each request states its purpose, expires, and can be ended at any time.</p></header>
    {error && <Alert tone="destructive">{error}</Alert>}{notice && <Alert tone="success">{notice}</Alert>}
    {query.isLoading && <p role="status">Loading requests...</p>}
    {query.isError && <Alert tone="destructive">Could not load requests. <Button variant="link" onClick={() => void query.refetch()}>Retry</Button></Alert>}
    {query.data?.length === 0 && <p className="py-8 text-sm text-muted-foreground">No support requests for this organization.</p>}
    <div className="divide-y divide-border border-y border-border">{query.data?.map(session => <article key={session._id} className="grid gap-3 py-5 sm:grid-cols-[1fr_auto]"><div className="min-w-0"><h2 className="font-semibold">{session.status === 'REQUESTED' ? 'Approval requested' : session.status === 'ACTIVE' ? 'Access active' : session.status === 'REJECTED' ? 'Request rejected' : 'Session ended'}</h2><p className="mt-1 text-xs text-muted-foreground">Requested by {session.adminName ?? 'Platform administrator'}</p><p className="mt-2 whitespace-pre-wrap text-sm">{session.purpose}</p><dl className="mt-2 text-xs text-muted-foreground"><dt className="inline">Permission: </dt><dd className="inline">Property and unit setup only</dd><br /><dt className="inline">Requested: </dt><dd className="inline">{new Date(session.requestedAt).toLocaleString()}</dd><br /><dt className="inline">Expires: </dt><dd className="inline">{new Date(session.expiresAt ?? session.requestExpiresAt).toLocaleString()}</dd><br /><dt className="inline">Actions used: </dt><dd className="inline">{session.useCount}</dd></dl></div><div className="flex items-start gap-2">{session.status === 'REQUESTED' && <><Button disabled={busy === session._id} onClick={() => void decide(session._id, 'approve')}>Approve</Button><Button variant="outline" disabled={busy === session._id} onClick={() => void decide(session._id, 'reject')}>Reject</Button></>}{session.status === 'ACTIVE' && <Button variant="outline" disabled={busy === session._id} onClick={() => void decide(session._id, 'end')}>End access</Button>}</div></article>)}</div>
  </main>;
}
