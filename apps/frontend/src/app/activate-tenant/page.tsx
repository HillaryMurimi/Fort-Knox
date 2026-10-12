'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Alert, Button, Input } from '@/components/ui';
import { BRAND } from '@/lib/brand';
export default function ActivateTenantPage() {
  const [identifier, setIdentifier] = useState(''), [code, setCode] = useState(''), [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<{ onboardingToken: string; channel: 'EMAIL'; destination: string } | null>(null), [busy, setBusy] = useState(false), [complete, setComplete] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      if (!challenge) setChallenge(await api('/tenant-onboarding/activate', { authenticated: false, method: 'POST', body: JSON.stringify({ identifier, channel: 'EMAIL' }) }));
      else { await api('/tenant-onboarding/verify', { authenticated: false, method: 'POST', body: JSON.stringify({ onboardingToken: challenge.onboardingToken, channel: challenge.channel, otp: code }) }); setComplete(true); setCode(''); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Activation is temporarily unavailable.'); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-background p-5"><section className="w-full max-w-md space-y-5 rounded-xl border border-border bg-card p-6">
    <h1 className="text-2xl font-semibold">Activate your tenant access</h1><p className="text-sm text-muted-foreground">{BRAND.name} verifies the contact registered by your landlord. Your assigned unit is set by the landlord.</p>
    {complete ? <><p role="status">Email verified and tenant access activated.</p><Link className="font-semibold underline" href="/login">Sign in with Email code</Link></> : <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
      {!challenge ? <label className="block text-sm">Registered email<Input type="email" autoComplete="email" required value={identifier} onChange={event => setIdentifier(event.target.value)} className="mt-2" /></label> : <><p className="text-sm text-muted-foreground">If an eligible pre-registration exists, a code was sent to {challenge.destination}.</p><label className="block text-sm">Activation code<Input autoFocus inputMode="numeric" autoComplete="one-time-code" required maxLength={6} pattern="[0-9]{6}" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} className="mt-2" /></label></>}
      {error && <div role="alert"><Alert tone="destructive">{error}</Alert></div>}<Button type="submit" className="w-full" loading={busy} disabled={busy || !!challenge && code.length !== 6}>{challenge ? 'Verify and activate' : 'Send activation code'}</Button>
      {challenge && <Button type="button" variant="ghost" disabled={busy} onClick={() => { setChallenge(null); setCode(''); setError(null); }}>Start activation again</Button>}
    </form>}
    <Link className="text-sm text-muted-foreground underline" href="/login">Back to sign in</Link>
  </section></main>;
}
