'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2 } from 'lucide-react';
import { Alert, Button, Input } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { passwordConfirmationError } from '@/lib/auth/signup-validation';
import { SocialButtons } from '@/components/auth/social-buttons';

export default function SignupPage() {
  const router = useRouter();
  const { bootstrapLandlord, isLoading } = useAuth();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '', name: '', slug: '' });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const validationError = passwordConfirmationError(form.password, form.confirmPassword);
    setPasswordError(validationError);
    if (validationError) {
      document.getElementById('confirmPassword')?.focus();
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await bootstrapLandlord({ firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone, password: form.password, organization: { name: form.name, ...(form.slug ? { slug: form.slug } : {}) } });
      router.replace('/login');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create organization.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function field(key: keyof typeof form, label: string, type = 'text', placeholder?: string) {
    return <label className="block text-sm font-medium text-muted-foreground">{label}<Input id={key} name={key} required={key !== 'slug'} type={type} autoComplete={type === 'password' ? 'new-password' : undefined} minLength={type === 'password' ? 12 : undefined} maxLength={type === 'password' ? 200 : undefined} aria-invalid={key === 'confirmPassword' && Boolean(passwordError)} aria-describedby={key === 'confirmPassword' && passwordError ? 'password-error' : undefined} placeholder={placeholder} value={form[key]} onChange={(event) => { setForm({ ...form, [key]: event.target.value }); if (type === 'password') setPasswordError(null); }} className="mt-2" /></label>;
  }

  return <main className="min-h-screen bg-muted px-4 py-8 sm:px-6 sm:py-12">
    <div className="mx-auto w-full max-w-2xl">
      <Link href="/login" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-[var(--foreground)]"><ArrowLeft size={15} /> Back to sign in</Link>
      <form onSubmit={submit} className="rounded-lg border border-[var(--border)] bg-card shadow-xl">
        <div className="border-b border-[var(--border)] p-5 sm:p-7">
          <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-md bg-[#17191c] text-white"><Building2 size={19} /></div>
          <h1 className="text-2xl font-semibold">Create your Command Center</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Set up the organization owner account. Staff and tenants will join through controlled invitations.</p>
        </div>
        <div className="space-y-5 p-5 sm:p-7">
          <div className="grid gap-4 sm:grid-cols-2">{field('firstName', 'First name')}{field('lastName', 'Last name')}{field('email', 'Email', 'email')}{field('phone', 'Phone', 'tel', '+254700000000')}</div>
          {field('password', 'Password', 'password')}
          {field('confirmPassword', 'Confirm password', 'password')}
          {passwordError && <p id="password-error" role="alert" className="text-sm text-destructive">{passwordError}</p>}
          <div className="border-t border-[var(--border)] pt-5"><div className="mb-4 text-xs font-bold uppercase text-[var(--accent-strong)]">Organization</div><div className="grid gap-4 sm:grid-cols-2">{field('name', 'Organization name')}{field('slug', 'Organization slug', 'text', 'Optional')}</div></div>
          {error && <Alert tone="destructive">{error}</Alert>}
          <Button loading={isLoading || isSubmitting} disabled={isSubmitting} className="w-full">Create organization</Button>
          <SocialButtons />
        </div>
      </form>
    </div>
  </main>;
}
