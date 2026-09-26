"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { Alert, Button, Input } from "@/components/ui";
import { useAuth } from "@/hooks/use-auth";
import {
  challengeSocial,
  finishSocial,
  getSocialStatus,
  type SocialStatus,
} from "@/lib/auth/social-api";

export default function WelcomePage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [status, setStatus] = useState<SocialStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    organizationName: "",
  });
  const [linkExisting, setLinkExisting] = useState(false);
  const [linkCredentials, setLinkCredentials] = useState({ email: "", password: "" });
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getSocialStatus()
      .then((result) => {
        if (active) {
          setStatus(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await challengeSocial(
        status?.requiresSignup
          ? linkExisting
            ? { existingAccount: true, ...linkCredentials }
            : details
          : {},
      );
      setDevCode(result.developmentCode ?? null);
      setStatus((current) =>
        current
          ? { ...current, challenged: true, phoneSuffix: result.phoneSuffix }
          : current,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to send the verification code.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await finishSocial(code);
      await refresh();
      router.replace(result.newOwner ? "/explore" : "/dashboard");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to verify the code.",
      );
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#101923] px-4 py-8 text-[#e9f5f7]">
      <div className="w-full max-w-lg border border-[#356071] bg-[#14232d] p-6 shadow-2xl sm:p-9">
        <Link
          href="/login"
          className="mb-8 inline-flex items-center gap-2 text-sm text-[#a9c7ce] hover:text-white"
        >
          <ArrowLeft size={16} /> Sign in
        </Link>
        <div className="mb-6 flex h-11 w-11 items-center justify-center bg-[#20cad5] text-[#0b1720]">
          <Building2 size={23} />
        </div>
        {loading ? (
          <p role="status">Checking your sign-in...</p>
        ) : !status ? (
          <>
            <h1 className="text-2xl font-semibold">Start again</h1>
            <p className="mt-2 text-sm text-[#a9c7ce]">
              Your provider sign-in has expired or is unavailable.
            </p>
            <Link
              href="/signup"
              className="mt-6 inline-flex items-center gap-2 text-[#57dce3]"
            >
              Choose a sign-in method <ArrowRight size={16} />
            </Link>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase text-[#65dbe3]">
              {status.provider} verified
            </p>
            <h1 className="mt-2 text-2xl font-semibold">
              {status.requiresSignup && !linkExisting
                ? "Name your organization"
                : "Confirm it is you"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#a9c7ce]">
              {status.challenged
                ? `Enter the six digit code sent to the phone ending in ${status.phoneSuffix}.`
                : status.requiresSignup && !linkExisting
                  ? "Set up the owner account, then verify your phone to enter the Command Center."
                  : linkExisting
                    ? "Confirm your existing owner password. A code will then go to your registered phone."
                    : "Your registered phone will receive a one time code."}
            </p>
            {status.challenged ? (
              <form onSubmit={verify} className="mt-7 space-y-4">
                <label className="block text-sm">
                  Verification code
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(event) =>
                      setCode(event.target.value.replace(/\D/g, ""))
                    }
                    className="mt-2 border-[#477180] bg-[#0d1b24] text-white"
                  />
                </label>
                {devCode && (
                  <Alert tone="warning">Development code: {devCode}</Alert>
                )}
                {error && <Alert tone="destructive">{error}</Alert>}
                <Button
                  loading={busy}
                  disabled={code.length !== 6}
                  className="w-full"
                >
                  Verify and continue <ShieldCheck size={16} />
                </Button>
              </form>
            ) : (
              <form onSubmit={requestCode} className="mt-7 space-y-4">
                {status.requiresSignup && !linkExisting && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {(
                      [
                        ["firstName", "First name", "text"],
                        ["lastName", "Last name", "text"],
                        ["email", "Email", "email"],
                        ["phone", "Phone", "tel"],
                        ["organizationName", "Organization name", "text"],
                      ] as const
                    ).map(([key, label, type]) => (
                      <label
                        key={key}
                        className={
                          key === "organizationName"
                            ? "block text-sm sm:col-span-2"
                            : "block text-sm"
                        }
                      >
                        {label}
                        <Input
                          type={type}
                          autoComplete={
                            key === "organizationName"
                              ? "organization"
                              : key === "phone"
                                ? "tel"
                                : key === "email"
                                  ? "email"
                                  : key === "firstName"
                                    ? "given-name"
                                    : "family-name"
                          }
                          required
                          maxLength={key === "email" ? 254 : 120}
                          minLength={key === "organizationName" ? 2 : undefined}
                          placeholder={
                            key === "phone" ? "+254700000000" : undefined
                          }
                          value={details[key]}
                          onChange={(event) =>
                            setDetails({
                              ...details,
                              [key]: event.target.value,
                            })
                          }
                          className="mt-2 border-[#477180] bg-[#0d1b24] text-white"
                        />
                      </label>
                    ))}
                  </div>
                )}
                {status.requiresSignup && linkExisting && (
                  <div className="space-y-4">
                    <label className="block text-sm">Owner email
                      <Input type="email" autoComplete="email" required value={linkCredentials.email} onChange={(event) => setLinkCredentials({ ...linkCredentials, email: event.target.value })} className="mt-2 border-[#477180] bg-[#0d1b24] text-white" />
                    </label>
                    <label className="block text-sm">Current password
                      <Input type="password" autoComplete="current-password" required value={linkCredentials.password} onChange={(event) => setLinkCredentials({ ...linkCredentials, password: event.target.value })} className="mt-2 border-[#477180] bg-[#0d1b24] text-white" />
                    </label>
                  </div>
                )}
                {error && <Alert tone="destructive">{error}</Alert>}
                <Button loading={busy} className="w-full">
                  Send verification code <KeyRound size={16} />
                </Button>
                {status.requiresSignup && <button type="button" className="w-full text-center text-sm text-[#75dfe5] hover:text-white" onClick={() => { setLinkExisting(!linkExisting); setError(null); }}>
                  {linkExisting ? 'Create a new organization' : 'Link an existing owner account'}
                </button>}
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}
