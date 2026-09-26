"use client";
import { FormEvent, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
export default function InvitationPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { acceptInvitation, isLoading } = useAuth();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
  });
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await acceptInvitation({
        token: params.token,
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        ...(form.email ? { email: form.email } : {}),
      });
      router.replace("/login");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to accept invitation.",
      );
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-8"
      >
        <h1 className="text-2xl font-semibold text-white">Accept invitation</h1>
        <p className="text-sm text-muted-foreground">
          Your role and organization scope are assigned by the inviter. Your
          phone number is used for field-team OTP authentication.
        </p>
        <input
          required
          placeholder="First name"
          value={form.firstName}
          onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
        />
        <input
          required
          placeholder="Last name"
          value={form.lastName}
          onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
        />
        <input
          required
          type="tel"
          placeholder="Phone number"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
        />
        <input
          type="email"
          placeholder="Email (if invited)"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
        />
        {error && (
          <p className="rounded-lg bg-red-950/30 p-3 text-sm text-red-400">
            {error}
          </p>
        )}
        <button
          disabled={isLoading}
          className="w-full rounded-xl bg-card px-4 py-3 font-semibold text-foreground disabled:opacity-50"
        >
          {isLoading ? "Accepting…" : "Accept invitation"}
        </button>
      </form>
    </main>
  );
}
