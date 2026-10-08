'use client';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input } from '@/components/ui';
import { api } from '@/lib/api';
import { resendAdminMfa } from '@/lib/auth/auth-api';
import type { AdminMfaResponse, AdminMfaChallenge, LoginResponse } from '@/types/auth';
import { AdminMfaPanel } from './admin-mfa-panel';
export function AdminStepUp({ enabled, verify }: { enabled: boolean; verify: (flow: string, channel: 'EMAIL' | 'SMS', code: string) => Promise<AdminMfaResponse | LoginResponse> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false), [mfa, setMfa] = useState<AdminMfaChallenge | null>(null);
  const [password, setPassword] = useState(''), [code, setCode] = useState(''), [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'VERIFY' | 'RESEND' | null>(null), [now, setNow] = useState(() => Date.now()), [complete, setComplete] = useState(false);
  useEffect(() => { if (!enabled) return; const show = () => { setOpen(true); setComplete(false); }; window.addEventListener('pcc:admin-step-up', show); return () => window.removeEventListener('pcc:admin-step-up', show); }, [enabled]);
  useEffect(() => { if (open && enabled) dialog.current?.showModal(); else dialog.current?.close(); }, [open, enabled]);
  useEffect(() => { if (!open) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [open]);
  const close = () => { setOpen(false); setPassword(''); setMfa(null); setCode(''); setError(null); };
  async function credentials() {
    setBusy('VERIFY'); setError(null);
    try { setMfa(await api<AdminMfaChallenge>('/auth/admin-mfa/step-up', { method: 'POST', body: JSON.stringify({ password }) })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to verify password.'); }
    finally { setPassword(''); setBusy(null); }
  }
  async function submit() {
    if (!mfa) return; setBusy('VERIFY'); setError(null);
    try { const result = await verify(mfa.flowToken, mfa.stage, code); setCode(''); if ('mfaRequired' in result) { if (result.stage === 'CHANNEL') throw new Error('Sensitive verification requires both channels.'); setMfa(result); } else { setMfa(null); setComplete(true); } }
    catch (caught) { setCode(''); setError(caught instanceof Error ? caught.message : 'Unable to verify.'); }
    finally { setBusy(null); }
  }
  async function resend() {
    if (!mfa) return; setBusy('RESEND'); setError(null);
    try { const result = await resendAdminMfa(mfa.flowToken); if (result.stage === 'CHANNEL') throw new Error('Restart sensitive verification.'); setMfa(result); setCode(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to resend.'); }
    finally { setBusy(null); }
  }
  return <dialog ref={dialog} onCancel={close} aria-labelledby="admin-step-up-title" className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-border bg-card p-6 text-foreground shadow-xl backdrop:bg-black/60">
    <h2 id="admin-step-up-title" className="text-xl font-semibold">Confirm administrator identity</h2>
    {complete ? <div className="mt-5 space-y-4"><Alert tone="success">Verification complete. Retry the requested action when you are ready.</Alert><Button onClick={close}>Continue</Button></div> :
      mfa ? <AdminMfaPanel key={mfa.stage} challenge={mfa} code={code} error={error} busy={busy} seconds={Math.max(0, Math.ceil((Date.parse(mfa.challenge.resendAt) - now) / 1000))}
        onCode={setCode} onVerify={() => void submit()} onResend={() => void resend()} onRestart={() => { setMfa(null); setError(null); setCode(''); }} /> :
        <form className="mt-5 space-y-4" onSubmit={event => { event.preventDefault(); void credentials(); }}><p className="text-sm text-muted-foreground">This action requires recent password, email and SMS verification. Your session lifetime will remain the same.</p>
          <label className="block text-sm font-medium">Current password<Input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required className="mt-2" /></label>
          {error && <div role="alert"><Alert tone="destructive">{error}</Alert></div>}<Button type="submit" loading={busy === 'VERIFY'} aria-busy={busy === 'VERIFY'} className="w-full">Verify identity</Button>
        </form>}
    {!complete && <Button variant="ghost" onClick={close} disabled={busy !== null} className="mt-3 w-full">Cancel action</Button>}
  </dialog>;
}
