"use client";

import { Suspense, type FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Building2, ShieldCheck } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { Alert, Button, Input } from "@/components/ui";
import { useAuth } from "@/hooks/use-auth";
import { passwordConfirmationError } from "@/lib/auth/signup-validation";
import { SocialButtons } from "@/components/auth/social-buttons";
import { AccountOtpPanel } from "@/components/auth/account-otp-panel";
import { resendAccountOtp } from "@/lib/auth/auth-api";
import {
  journeyToken,
  parseSignupContext,
  trackAcquisition,
} from "@/lib/acquisition";
import type { AccountOtpResponse } from "@/types/auth";

function Signup() {
  const router = useRouter(),
    search = useSearchParams(),
    context = useMemo(() => parseSignupContext(search.toString()), [search]);
  const { bootstrapLandlord, login, verifyAccount } = useAuth();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    name: "",
  });
  const [optIn, setOptIn] = useState(false),
    [passwordError, setPasswordError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [created, setCreated] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<AccountOtpResponse | null>(null),
    [code, setCode] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    void trackAcquisition("signup_started", context);
  }, [context]);
  useEffect(() => {
    if (!challenge) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    const problem = passwordConfirmationError(
      form.password,
      form.confirmPassword,
    );
    setPasswordError(problem);
    if (problem) {
      document.getElementById("confirmPassword")?.focus();
      return;
    }
    setBusy(true);
    try {
      if (!created) {
        await bootstrapLandlord({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          password: form.password,
          organization: {
            name:
              form.name.trim() ||
              form.firstName.trim() + " " + form.lastName.trim() + " portfolio",
          },
          acquisition: {
            selectedPlanKey: context.planKey,
            unitCount: context.unitCount,
            prepaidMonths: context.prepaidMonths,
            source: context.source,
            journeyToken: journeyToken(),
            recoveryEmailOptIn: optIn,
          },
        });
        setCreated(true);
      }
      const result = await login({
        method: "email",
        email: form.email,
        password: form.password,
        channel: "EMAIL",
      });
      if (!("accountOtpRequired" in result))
        throw new Error(
          "Sign in with your owner account to continue email verification.",
        );
      setChallenge(result);
      setNow(Date.now());
      setForm((previous) => ({
        ...previous,
        password: "",
        confirmPassword: "",
      }));
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Account setup could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    if (!challenge || busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyAccount(challenge.challengeToken, "EMAIL", code);
      router.replace("/onboarding");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Verification failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    if (!challenge || busy) return;
    setBusy(true);
    setError(null);
    try {
      setChallenge(await resendAccountOtp(challenge.challengeToken, "EMAIL"));
      setCode("");
      setNow(Date.now());
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Delivery failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function field(key: keyof typeof form, label: string, type = "text") {
    return (
      <label className="block text-sm font-medium">
        {label}
        <Input
          id={key}
          name={key}
          required={key !== "name"}
          disabled={created && type !== "password"}
          type={type}
          autoComplete={
            type === "password"
              ? "new-password"
              : key === "email"
                ? "email"
                : key === "phone"
                  ? "tel"
                  : undefined
          }
          minLength={type === "password" ? 12 : undefined}
          maxLength={type === "password" ? 200 : 120}
          aria-invalid={key === "confirmPassword" && Boolean(passwordError)}
          aria-describedby={
            key === "confirmPassword" && passwordError
              ? "password-error"
              : undefined
          }
          value={form[key]}
          onChange={(event) => {
            setForm({ ...form, [key]: event.target.value });
            if (type === "password") setPasswordError(null);
          }}
          className="mt-2"
        />
      </label>
    );
  }
  return (
    <main className="min-h-screen bg-muted px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/plans"
          className="mb-5 inline-flex items-center gap-2 text-sm font-semibold"
        >
          <ArrowLeft size={15} /> Compare plans
        </Link>
        <section className="rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-8">
          <Building2 size={24} />
          <p className="mt-4 text-sm font-semibold text-accent-foreground">
            {BRAND.name}
          </p>
          <h1 className="mt-2 text-2xl font-semibold">
            {challenge
              ? "Verify your owner email"
              : "Create your Property Command Center"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Selected:{" "}
            {context.planKey === "FORT_KNOX" ? "Fort Knox" : "Control"} ·{" "}
            {context.unitCount} planned units · {context.prepaidMonths} months
            upfront. Your property records can be added after verified payment.
          </p>
          {challenge ? (
            <AccountOtpPanel
              challenge={challenge}
              channels={["EMAIL"]}
              code={code}
              seconds={Math.max(
                0,
                Math.ceil(
                  (Date.parse(challenge.challenge.resendAt) - now) / 1000,
                ),
              )}
              expired={Date.parse(challenge.challenge.expiresAt) <= now}
              error={error}
              busy={busy}
              onCode={setCode}
              onVerify={() => void verify()}
              onResend={() => void resend()}
              onRestart={() => router.replace("/login?next=%2Fonboarding")}
            />
          ) : (
            <form className="mt-6 space-y-5" onSubmit={submit}>
              <div className="grid gap-4 sm:grid-cols-2">
                {field("firstName", "First name")}
                {field("lastName", "Last name")}
                {field("email", "Email", "email")}
                {field("phone", "Phone", "tel")}
              </div>
              {field("name", "Workspace or business name (optional)")}
              <div className="grid gap-4 sm:grid-cols-2">
                {field("password", "Password", "password")}
                {field("confirmPassword", "Confirm password", "password")}
              </div>
              {passwordError && (
                <p
                  id="password-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {passwordError}
                </p>
              )}
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={optIn}
                  onChange={(event) => setOptIn(event.target.checked)}
                />
                <span>
                  Email me occasional reminders to finish my setup. You can
                  change this preference later.
                </span>
              </label>
              {error && (
                <Alert tone="destructive">
                  {error}{" "}
                  {created && (
                    <Link
                      href="/login?next=%2Fonboarding"
                      className="underline"
                    >
                      Resume your existing account
                    </Link>
                  )}
                </Alert>
              )}
              <Button loading={busy} disabled={busy} className="w-full">
                {created
                  ? "Continue email verification"
                  : "Create account and verify email"}
              </Button>
              <SocialButtons />
              <p className="flex gap-2 text-xs leading-5 text-muted-foreground">
                <ShieldCheck size={16} className="shrink-0" />
                No charge at signup. You will review the agreement and exact
                invoice before secure checkout.
              </p>
            </form>
          )}
          <p className="mt-6 text-sm text-muted-foreground">
            Already registered?{" "}
            <Link
              href="/login?next=%2Fonboarding"
              className="font-semibold underline"
            >
              Sign in and resume
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <main className="p-8" role="status">
          Loading your selected plan…
        </main>
      }
    >
      <Signup />
    </Suspense>
  );
}
