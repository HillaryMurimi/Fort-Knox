"use client";

import { useEffect, useState } from "react";
import { Alert, Button } from "@/components/ui";
import {
  getSocialProviders,
  startSocial,
  type SocialProvider,
  type SocialProviders,
} from "@/lib/auth/social-api";

const providers: { key: SocialProvider; label: string }[] = [
  { key: "google", label: "Google" },
  { key: "facebook", label: "Facebook" },
  { key: "apple", label: "Apple" },
];

export function SocialButtons() {
  const [available, setAvailable] = useState<SocialProviders | null>(null);
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getSocialProviders()
      .then((result) => {
        if (active) setAvailable(result);
      })
      .catch(() => {
        if (active) setAvailable(null);
      });
    return () => {
      active = false;
    };
  }, []);

  async function begin(provider: SocialProvider) {
    setBusy(provider);
    setError(null);
    try {
      const { url } = await startSocial(provider);
      const destination = new URL(url);
      if (
        ![
          "accounts.google.com",
          "www.facebook.com",
          "appleid.apple.com",
        ].includes(destination.hostname) ||
        destination.protocol !== "https:"
      )
        throw new Error("The provider returned an invalid destination.");
      window.location.assign(destination.toString());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Social sign-in could not start.",
      );
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 border-t border-[var(--border)] pt-5">
      <p className="text-center text-xs font-semibold uppercase text-[var(--muted-foreground)]">
        Or continue with
      </p>
      <div className="grid grid-cols-3 gap-2">
        {providers.map(({ key, label }) => (
          <Button
            key={key}
            type="button"
            variant="outline"
            disabled={!available?.[key] || busy !== null}
            aria-label={`Continue with ${label}`}
            title={
              available?.[key]
                ? `Continue with ${label}`
                : `${label} sign-in is awaiting provider configuration`
            }
            onClick={() => void begin(key)}
            className="min-w-0 px-1"
          >
            {label}
          </Button>
        ))}
      </div>
      {error && <Alert tone="destructive">{error}</Alert>}
    </div>
  );
}
