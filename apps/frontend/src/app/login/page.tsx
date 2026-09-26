'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, ShieldCheck } from 'lucide-react';
import { Alert, Button, Input, TabsList, TabsTrigger } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { getRoleRedirect } from '@/lib/auth/role-redirect';
import type { LoginChallengeResponse, LoginResponse } from '@/types/auth';

type Step = 'CREDENTIALS' | 'OTP';
type Method = 'email' | 'phone';

function isLoginChallenge(result: LoginChallengeResponse | LoginResponse): result is LoginChallengeResponse {
  return typeof result === 'object' && result !== null && 'challenge' in result && typeof result.challenge === 'object' && result.challenge !== null;
}

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, roles, isLoading, login, verifyOtp, verifyStepUp } = useAuth();
  const [method, setMethod] = useState<Method>('email');
  const [step, setStep] = useState<Step>('CREDENTIALS');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) router.replace(getRoleRedirect(roles));
  }, [isAuthenticated, roles, router]);

  function changeMethod(next: Method) {
    setMethod(next);
    setError(null);
    setCode('');
    setDevCode(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDevCode(null);
    try {
      const payload = method === 'email'
        ? { method: 'email' as const, email: email.trim(), password }
        : { method: 'phone' as const, phone: phone.trim() };
      const result = await login(payload);
      if (isLoginChallenge(result)) {
        const challenge = result.challenge as { developmentCode?: unknown };
        if (typeof challenge.developmentCode === 'string') setDevCode(challenge.developmentCode);
        setStep('OTP');
        return;
      }
      router.replace(getRoleRedirect(result.roles));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message || 'Unable to sign in.' : 'Unable to sign in.');
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const result = method === 'email' ? await verifyStepUp(email.trim(), code) : await verifyOtp(phone.trim(), code);
      router.replace(getRoleRedirect(result.roles));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message || 'Unable to verify code.' : 'Unable to verify code.');
    }
  }

  if (isAuthenticated) return null;

  return (
    <main className="grid min-h-screen bg-[#17191c] lg:grid-cols-[minmax(0,1fr)_minmax(440px,560px)]">
      <section className="hidden border-r border-white/10 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#d97745]"><Building2 size={20} /></span>
          <div><div className="text-sm font-semibold">Property Command Center</div><div className="text-xs text-white/45">Connected operations</div></div>
        </div>
        <div className="max-w-xl">
          <div className="mb-5 h-1 w-12 bg-[#d97745]" />
          <h2 className="text-4xl font-semibold leading-tight">Your portfolio, with every important signal in reach.</h2>
          <p className="mt-4 max-w-lg text-base leading-7 text-white/55">Secure access for owners, operators, field teams, and tenants across every property workflow.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/45"><ShieldCheck size={15} className="text-[#6ce9a6]" /> Multi-tenant controls and auditable access</div>
      </section>

      <section className="flex min-h-screen items-center justify-center bg-muted px-4 py-8 sm:px-8">
        <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-card p-6 shadow-xl sm:p-8">
          <p className="mb-2 text-xs font-bold uppercase text-[var(--accent-strong)]">Property Management</p>
          <h1 className="text-2xl font-semibold">Command Center</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">Sign in to your secure operations workspace.</p>

          {step === 'CREDENTIALS' ? (
            <form onSubmit={submit} className="mt-8 space-y-5">
              <TabsList className="grid grid-cols-2">
                <TabsTrigger type="button" active={method === 'email'} onClick={() => changeMethod('email')}>Email + Password</TabsTrigger>
                <TabsTrigger type="button" active={method === 'phone'} onClick={() => changeMethod('phone')}>Phone OTP</TabsTrigger>
              </TabsList>

              {method === 'email' ? <>
                <label className="block text-sm font-medium text-muted-foreground">Email<Input className="mt-2" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
                <label className="block text-sm font-medium text-muted-foreground">Password<Input className="mt-2" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
              </> : (
                <label className="block text-sm font-medium text-muted-foreground">Phone number<Input className="mt-2" type="tel" autoComplete="tel" placeholder="+254700000000" value={phone} onChange={(event) => setPhone(event.target.value)} required minLength={7} /></label>
              )}

              {error && <Alert tone="destructive">{error}</Alert>}
              <Button type="submit" loading={isLoading} className="w-full">Continue</Button>
              <p className="text-center text-sm text-[var(--muted-foreground)]">New landlord? <Link className="font-semibold text-[var(--foreground)] hover:underline" href="/signup">Create an organization</Link></p>
            </form>
          ) : (
            <form onSubmit={verify} className="mt-8 space-y-5">
              <p className="text-sm text-[var(--muted-foreground)]">Enter the six-digit verification code sent to <span className="font-medium text-[var(--foreground)]">{method === 'email' ? email : phone}</span>.</p>
              <Input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} className="h-14 text-center text-2xl tracking-[0.5em]" required />
              {devCode && <Alert tone="warning">Development OTP: <strong>{devCode}</strong></Alert>}
              {error && <Alert tone="destructive">{error}</Alert>}
              <Button type="submit" loading={isLoading} disabled={code.length !== 6} className="w-full">Enter Command Center</Button>
              <Button type="button" variant="ghost" onClick={() => { setStep('CREDENTIALS'); setCode(''); setError(null); setDevCode(null); }} className="w-full">Back</Button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

