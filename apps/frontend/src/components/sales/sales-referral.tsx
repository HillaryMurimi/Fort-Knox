'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button } from '@/components/ui';
import { acceptReferral, pauseJourneyAnalytics, referralDestination } from '@/lib/acquisition';
const safeDestination = (value: string) => ['/plans?source=OUTREACH', '/signup?source=OUTREACH', '/demo'].includes(value) ? value : '/plans';
export function SalesReferral({ token }: { token: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const invitation = useQuery({ queryKey: ['sales-referral', token], queryFn: () => referralDestination(token), retry: false, staleTime: 0, gcTime: 0 });
  async function accept() {
    setBusy(true); setError('');
    try { const result = await acceptReferral(token); window.location.assign(safeDestination(result.destination)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Tracking is unavailable. You can continue without it.'); setBusy(false); }
  }
  return <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center space-y-6 px-6 py-12">
    <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Dapinni</p>
    <h1 className="text-3xl font-semibold">Your property command center awaits</h1>
    <p>Explore Dapinni and choose how to continue. Optional first-party analytics connect this invitation to your registration and onboarding milestones. A visit does not tell us whether you read the content.</p>
    {invitation.isLoading && <p role="status">Checking your invitation...</p>}
    {invitation.error && <Alert>This invitation is unavailable or expired. You can still <Link href="/plans" className="underline">explore the plans</Link>.</Alert>}
    {error && <Alert>{error}</Alert>}
    {invitation.data && <div className="flex flex-wrap gap-3">
      <Button disabled={busy} onClick={() => void accept()}>{busy ? 'Continuing...' : 'Allow analytics and continue'}</Button>
      <Link className="btn-secondary" href={safeDestination(invitation.data.destination)} onClick={pauseJourneyAnalytics}>Continue without analytics</Link>
    </div>}
    <p className="text-sm text-muted-foreground">Your choice does not affect access, pricing or the signup process. No contact details appear in this invitation.</p>
  </main>;
}
