'use client';
import { ShieldCheck, Mail, Smartphone } from 'lucide-react';
import { WorkflowPipeline } from '@/components/workflow-pipeline';
import { orderedWorkflow } from '@/lib/status';
import { Alert, Button, Input } from '@/components/ui';
import type { AdminMfaResponse } from '@/types/auth';

export function AdminMfaPanel({ challenge, code, error, busy, seconds, onCode, onVerify, onResend, onRestart }: {
  challenge: AdminMfaResponse; code: string; error: string | null; busy: 'VERIFY' | 'RESEND' | null; seconds: number;
  onCode: (code: string) => void; onVerify: () => void; onResend: () => void; onRestart: () => void;
}) {
  const email = challenge.stage === 'EMAIL';
  return <form className="mt-8 space-y-5" onSubmit={event => { event.preventDefault(); onVerify(); }}>
    <WorkflowPipeline label="Administrator authentication progress" domain="auth" stages={orderedWorkflow(["Password accepted", "Email verification", "Phone verification", "Privileged session"], email ? 1 : 2, busy ? "PROCESSING" : "UNDER_REVIEW").map(stage => stage.position === "current" && error ? {...stage, position: "failed", status: "FAILED"} : stage)} />
    <div className="flex items-center gap-3">{email ? <Mail aria-hidden size={22} /> : <Smartphone aria-hidden size={22} />}
      <h2 className="text-lg font-semibold">{email ? 'Verify your email' : 'Verify your phone'}</h2></div>
    <p className="text-sm text-muted-foreground">Administrator access requires both channels. {email ? 'Your password is verified.' : 'Your password and email are verified.'}</p>
    <p className="text-sm" aria-live="polite">{challenge.challenge.delivery === 'SENT' ? 'A six-digit code was sent to ' : 'Code delivery failed for '}
      <span className="font-medium">{challenge.challenge.destination}</span>.</p>
    {challenge.challenge.delivery !== 'SENT' && <Alert tone="warning">The provider could not deliver this code. Wait for the resend countdown, then retry. Administrator access remains locked.</Alert>}
    <label className="block text-sm font-medium">{email ? 'Email verification code' : 'SMS verification code'}
      <Input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}"
        value={code} onChange={event => onCode(event.target.value.replace(/\D/g, ''))}
        className="mt-2 h-14 text-center text-2xl tracking-[0.4em]" required disabled={busy !== null || challenge.challenge.delivery !== 'SENT'} /></label>
    {error && <div role="alert"><Alert tone="destructive">{error}</Alert></div>}
    <Button type="submit" aria-busy={busy === 'VERIFY'} loading={busy === 'VERIFY'} disabled={busy !== null || code.length !== 6 || challenge.challenge.delivery !== 'SENT'} className="w-full">
      {email ? 'Verify email' : 'Verify phone and sign in'}</Button>
    <Button type="button" aria-busy={busy === 'RESEND'} variant="outline" disabled={busy !== null || seconds > 0} loading={busy === 'RESEND'} onClick={onResend} className="w-full">
      {seconds > 0 ? 'Resend code in ' + seconds + 's' : 'Resend code'}</Button>
    <p className="text-xs text-muted-foreground" role="status">Codes expire after a short period. Only the latest code for this stage works.</p>
    <Button type="button" variant="ghost" disabled={busy !== null} onClick={onRestart} className="w-full">Start sign-in again</Button>
    <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck size={14} aria-hidden /> Lost access to a channel? Contact the authorized security operator for audited recovery.</p>
  </form>;
}
