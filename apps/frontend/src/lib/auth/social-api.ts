import { api } from "../api";

export type SocialProvider = "google" | "facebook" | "apple";
export type SocialProviders = Record<SocialProvider, boolean>;
export interface SocialStatus {
  provider: SocialProvider;
  requiresSignup: boolean;
  challenged: boolean;
  phoneSuffix?: string;
}

export const getSocialProviders = () =>
  api<SocialProviders>("/auth/social/providers", { authenticated: false });
export const startSocial = (provider: SocialProvider) =>
  api<{ url: string }>(`/auth/social/${provider}/start`, {
    authenticated: false,
    method: "POST",
  });
export const getSocialStatus = () =>
  api<SocialStatus>("/auth/social/session", { authenticated: false });
export const challengeSocial = (details: Record<string, string | boolean>) =>
  api<{ phoneSuffix: string; developmentCode?: string }>(
    "/auth/social/challenge",
    { authenticated: false, method: "POST", body: JSON.stringify(details) },
  );
export const finishSocial = (code: string) =>
  api<{ newOwner: boolean }>("/auth/social/finish", {
    authenticated: false,
    method: "POST",
    body: JSON.stringify({ code }),
  });
