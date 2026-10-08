'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { useRouter } from 'next/navigation';
import { Building2, ShieldCheck } from 'lucide-react';
import { Alert, Button, Input, TabsList, TabsTrigger } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { getRoleRedirect } from '@/lib/auth/role-redirect';
import { selectAdminMfaChannel, resendAdminMfa } from '@/lib/auth/auth-api';
import type { AdminMfaResponse } from '@/types/auth';
import { SocialButtons } from '@/components/auth/social-buttons';
import { AdminMfaChoicePanel } from '@/components/auth/admin-mfa-choice';
import { AdminMfaPanel } from '@/components/auth/admin-mfa-panel';

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, roles, isLoading, login, verifyOtp, verifyStepUp, verifyAdmin } = useAuth();
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [step, setStep] = useState<'CREDENTIALS' | 'OTP' | 'ADMIN'>('CREDENTIALS');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [phone, setPhone] = useState('');
  const [code, setCode] = useState(''), [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null), [mfa, setMfa] = useState<AdminMfaResponse | null>(null);
  const [busy, setBusy] = useState<'VERIFY' | 'RESEND' | null>(null), [now, setNow] = useState(() => Date.now());
  const [sendingChannel, setSendingChannel] = useState<'EMAIL' | 'SMS' | null>(null);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (isAuthenticated) router.replace(roles.includes('SUPER_ADMIN') ? getRoleRedirect(roles) : new URLSearchParams(window.location.search).get('next') === '/onboarding' ? '/onboarding' : getRoleRedirect(roles)); }, [isAuthenticated, roles, router]);
  const redirect = (nextRoles: typeof roles) => router.replace(nextRoles.includes('SUPER_ADMIN') ? getRoleRedirect(nextRoles) : new URLSearchParams(window.location.search).get('next') === '/onboarding' ? '/onboarding' : getRoleRedirect(nextRoles));
  const restart = () => { setStep('CREDENTIALS'); setPassword(''); setMfa(null); setCode(''); setError(null); setDevCode(null); };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setDevCode(null);
    try {
      const result = await login(method === 'email' ? { method: 'email', email: email.trim(), password } : { method: 'phone', phone: phone.trim() });
      setPassword('');
      if ('mfaRequired' in result) { setMfa(result); setStep('ADMIN'); setCode(''); return; }
      if ('accessToken' in result) { redirect(result.roles); return; }
      if ('challenge' in result && result.challenge.developmentCode) setDevCode(result.challenge.developmentCode);
      setStep('OTP');
    } catch (caught) { setPassword(''); setError(caught instanceof Error ? caught.message : 'Unable to sign in.'); }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null);
    try { const result = method === 'email' ? await verifyStepUp(email.trim(), code) : await verifyOtp(phone.trim(), code); setCode(''); redirect(result.roles); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to verify code.'); }
  }
  async function verifyAdministrator() {
    if (!mfa || mfa.stage === 'CHANNEL') return; setBusy('VERIFY'); setError(null);
    try {
      const result = await verifyAdmin(mfa.flowToken, mfa.stage, code);
      setCode('');
      if ('mfaRequired' in result) setMfa(result); else { setMfa(null); redirect(result.roles); }
    } catch (caught) { setCode(''); setError(caught instanceof Error ? caught.message : 'Unable to verify this channel.'); }
    finally { setBusy(null); }
  }
  async function chooseChannel(channel: 'EMAIL' | 'SMS') {
    if (!mfa || mfa.stage !== 'CHANNEL' || sendingChannel) return;
    setSendingChannel(channel); setError(null);
    try { setMfa(await selectAdminMfaChannel(mfa.flowToken, channel)); setCode(''); setNow(Date.now()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to send the verification code. Restart sign-in to try again.'); }
    finally { setSendingChannel(null); }
  }
  async function resend() {
    if (!mfa) return; setBusy('RESEND'); setError(null);
    try { setMfa(await resendAdminMfa(mfa.flowToken)); setCode(''); setNow(Date.now()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to resend the code.'); }
    finally { setBusy(null); }
  }
  if (isAuthenticated) return null;
  return <main className="grid min-h-screen bg-[#17191c] lg:grid-cols-[minmax(0,1fr)_minmax(440px,560px)]">
    <section className="hidden border-r border-white/10 p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#d97745]"><Building2 size={20} /></span>
        <div><div className="text-xl font-semibold">{BRAND.name}</div><div className="text-xs text-white/60">{BRAND.descriptor}</div></div></div>
      <div className="max-w-xl"><div className="mb-5 h-1 w-12 bg-[#d97745]" /><h2 className="text-4xl font-semibold leading-tight">Your properties. Your decisions. Wherever you are.</h2>
        <p className="mt-4 max-w-lg text-base leading-7 text-white/55">Secure access for owners, operators, field teams, and tenants across every property workflow.</p></div>
      <div className="flex items-center gap-2 text-xs text-white/45"><ShieldCheck size={15} className="text-[#6ce9a6]" /> Multi-tenant controls and auditable access</div>
    </section>
    <section className="flex min-h-screen items-center justify-center bg-muted px-4 py-8 sm:px-8">
      <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-card p-6 shadow-xl sm:p-8">
        <h1 className="text-3xl font-semibold">{BRAND.name}</h1><p className="mt-2 text-sm font-medium text-[var(--accent-strong)]">{BRAND.descriptor}</p>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to your secure operations workspace.</p>
        {step === 'ADMIN' && mfa ? mfa.stage === 'CHANNEL' ? <AdminMfaChoicePanel choice={mfa} sending={sendingChannel} error={error}
          onChoose={channel => void chooseChannel(channel)} onRestart={restart} /> : <AdminMfaPanel key={mfa.stage} challenge={mfa} code={code} error={error} busy={busy}
          seconds={Math.max(0, Math.ceil((Date.parse(mfa.challenge.resendAt) - now) / 1000))}
          onCode={setCode} onVerify={() => void verifyAdministrator()} onResend={() => void resend()} onRestart={restart} /> :
          step === 'CREDENTIALS' ? <form onSubmit={submit} className="mt-8 space-y-5">
            <TabsList className="grid grid-cols-2"><TabsTrigger type="button" active={method === 'email'} onClick={() => { setMethod('email'); setError(null); }}>Email + Password</TabsTrigger>
              <TabsTrigger type="button" active={method === 'phone'} onClick={() => { setMethod('phone'); setError(null); }}>Phone OTP</TabsTrigger></TabsList>
            {method === 'email' ? <><label className="block text-sm font-medium text-muted-foreground">Email<Input className="mt-2" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
              <label className="block text-sm font-medium text-muted-foreground">Password<Input className="mt-2" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label></> :
              <label className="block text-sm font-medium text-muted-foreground">Phone number<Input className="mt-2" type="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} required minLength={7} /></label>}
            {error && <div role="alert"><Alert tone="destructive">{error}</Alert></div>}<Button type="submit" loading={isLoading} className="w-full">Continue</Button>
            <p className="text-center text-sm text-muted-foreground">New landlord? <Link className="font-semibold text-foreground hover:underline" href="/signup">Create an organization</Link></p>
          </form> : <form onSubmit={verify} className="mt-8 space-y-5">
            <p className="text-sm text-muted-foreground">Enter the six-digit verification code sent to your registered phone.</p>
            <Input aria-label="Phone verification code" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} className="h-14 text-center text-2xl tracking-[0.5em]" required />
            {devCode && <Alert tone="warning">Development OTP: <strong>{devCode}</strong></Alert>}{error && <div role="alert"><Alert tone="destructive">{error}</Alert></div>}
            <Button type="submit" loading={isLoading} disabled={code.length !== 6} className="w-full">Enter Command Center</Button><Button type="button" variant="ghost" onClick={restart} className="w-full">Back</Button>
          </form>}
        {step === 'CREDENTIALS' && <div className="mt-5"><SocialButtons /></div>}
      </div>
    </section>
  </main>;
}
