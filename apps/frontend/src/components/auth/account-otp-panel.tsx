'use client';
import { Alert, Button, Input } from '@/components/ui';
import type { AccountOtpResponse } from '@/types/auth';
export function AccountOtpPanel({ challenge, channels, code, seconds, error, busy, expired = false, onCode, onVerify, onResend, onRestart }: {
  challenge: AccountOtpResponse; channels: Array<'EMAIL' | 'SMS'>; code: string; seconds: number; error: string | null; busy: boolean; expired?: boolean;
  onCode: (code: string) => void; onVerify: () => void; onResend: (channel?: 'EMAIL' | 'SMS') => void; onRestart: () => void;
}) {
  const current = challenge.challenge;
  return <form className="mt-8 space-y-5" aria-busy={busy} onSubmit={event => { event.preventDefault(); onVerify(); }}>
    <h2 className="text-lg font-semibold">Verify your {current.channel === 'EMAIL' ? 'email' : 'phone'}</h2>
    <p className="text-sm text-muted-foreground">If this account is eligible, a six-digit code was sent to {current.destination}. Contact details become verified only after the code succeeds.</p>
    {expired && <p role="status" className="text-sm text-muted-foreground">This code expired. Request a new code.</p>}
    {busy && <p role="status" className="text-sm text-muted-foreground">Processing verification…</p>}
    {current.delivery === 'FAILED' && <Alert tone="destructive">Delivery failed. Retry after the countdown, or choose another available method.</Alert>}
    <label className="block text-sm font-medium">Verification code<Input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={event => onCode(event.target.value.replace(/\D/g, ''))} required disabled={busy} className="mt-2 h-14 text-center text-2xl tracking-[0.5em]" /></label>
    {error && <div role="alert"><Alert tone="destructive">{error}</Alert></div>}
    <Button type="submit" className="w-full" loading={busy} disabled={busy || expired || code.length !== 6 || current.delivery !== 'SENT'}>Verify and sign in</Button>
    <p className="text-xs text-muted-foreground" role="status">{seconds > 0 ? 'Resend available in ' + seconds + ' seconds.' : 'You can request a new code.'}</p>
    <div className="flex flex-wrap gap-2">{channels.map(channel => <Button key={channel} type="button" variant="outline" disabled={busy || seconds > 0} onClick={() => onResend(channel)}>{channel === current.channel ? 'Resend code' : 'Switch to ' + (channel === 'EMAIL' ? 'email' : 'SMS')}</Button>)}</div>
    <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={onRestart}>Start sign-in again</Button>
  </form>;
}
