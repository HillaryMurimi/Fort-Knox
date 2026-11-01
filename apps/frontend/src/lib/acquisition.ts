import { resolveApiBaseUrl } from "./api";

export type AcquisitionPlanKey = "CONTROL" | "FORT_KNOX";
export type AcquisitionSource = "WEBSITE" | "PUBLIC_DEMO" | "OUTREACH";
export interface SignupContext {
  planKey: AcquisitionPlanKey;
  unitCount: number;
  prepaidMonths: number;
  source: AcquisitionSource;
}
export function parseSignupContext(search: string): SignupContext {
  const params = new URLSearchParams(search);
  const count = Number(params.get("units") ?? 5),
    months = Number(params.get("months") ?? 3);
  return {
    planKey: params.get("plan") === "FORT_KNOX" ? "FORT_KNOX" : "CONTROL",
    unitCount:
      Number.isInteger(count) && count >= 0 && count <= 100000 ? count : 5,
    prepaidMonths:
      Number.isInteger(months) && months >= 3 && months <= 24 ? months : 3,
    source:
      params.get("source") === "PUBLIC_DEMO"
        ? "PUBLIC_DEMO"
        : params.get("source") === "OUTREACH"
          ? "OUTREACH"
          : "WEBSITE",
  };
}
export interface PlanPricing {
  planKey: string;
  planName: string;
  currency: string;
  billingCycle: string;
  unitCount: number;
  includedUnits: number;
  extraUnits: number;
  baseMonthlyMinor: number;
  additionalUnitMinor: number;
  monthlyMinor: number;
  recurringMinor: number;
  intervalMonths: number;
  prepaidMonths: number;
  totalMinor: number;
  taxMinor: number;
}
export interface PublicPlanCatalog {
  plans: Array<{
    key: AcquisitionPlanKey;
    name: string;
    description?: string;
    pricing: PlanPricing;
    features: string[];
  }>;
  unavailablePlans?: Array<{ key: AcquisitionPlanKey; name: string; reason: string }>;
  minimumPrepaidMonths: number;
  terms: {
    taxPolicy: string;
    hardware: string;
    renewal: string;
    cancellation: string;
    paymentMethods: string;
  };
}
async function publicRequest<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(resolveApiBaseUrl() + path, {
      method: body ? "POST" : "GET",
      credentials: "omit",
      signal: controller.signal,
      ...(body
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
    const payload = await response.json();
    if (!response.ok || payload.success !== true)
      throw new Error(
        payload.error?.message ??
          payload.message ??
          "This information is temporarily unavailable.",
      );
    return payload.data as T;
  } finally {
    clearTimeout(timeout);
  }
}
export function publicPlanCatalog(units: number, months = 3) {
  return publicRequest<PublicPlanCatalog>(
    "/acquisition/plans?units=" + units + "&months=" + months,
  );
}
const tokenKey = "dapinni-acquisition-session",
  pauseKey = "dapinni-acquisition-paused";
export function journeyToken() {
  try {
    return typeof window === "undefined"
      ? undefined
      : (sessionStorage.getItem(tokenKey) ?? undefined);
  } catch {
    return undefined;
  }
}
export function referralDestination(token: string) {
  return publicRequest<{ destination: string; expiresAt: string }>("/acquisition/referrals/resolve", { token });
}
export async function acceptReferral(token: string) {
  const result = await publicRequest<{ destination: string; journeyToken: string }>("/acquisition/referrals/visits", { token, consent: true, ...(journeyToken() ? { journeyToken: journeyToken() } : {}) });
  try { sessionStorage.setItem(tokenKey, result.journeyToken); localStorage.removeItem(pauseKey); } catch { /* Optional browser storage never blocks navigation. */ }
  return result;
}
export function pauseJourneyAnalytics() {
  try {
    localStorage.setItem(pauseKey, "true");
    sessionStorage.removeItem(tokenKey);
  } catch {
    /* Restricted browser storage does not block signup. */
  }
}
let queue: Promise<void> = Promise.resolve();
const requested = new Set<string>();
export function trackAcquisition(
  event:
    | "landing_viewed"
    | "demo_started"
    | "demo_completed"
    | "plan_selected"
    | "signup_started",
  context: Partial<SignupContext> = {},
) {
  if (typeof window === "undefined") return Promise.resolve();
  if (requested.has(event)) return queue;
  requested.add(event);
  queue = queue.then(async () => {
    try {
      if (
        localStorage.getItem(pauseKey) === "true" ||
        sessionStorage.getItem("dapinni-acquisition-sent-" + event) === "true"
      )
        return;
      const result = await publicRequest<{ journeyToken: string }>(
        "/acquisition/events",
        {
          event,
          journeyToken: journeyToken(),
          source: context.source ?? "WEBSITE",
          ...(context.planKey ? { planKey: context.planKey } : {}),
        },
      );
      sessionStorage.setItem(tokenKey, result.journeyToken);
      sessionStorage.setItem("dapinni-acquisition-sent-" + event, "true");
    } catch {
      requested.delete(
        event,
      ); /* Anonymous analytics is optional and never blocks the customer journey. */
    }
  });
  return queue;
}
const contextQuery = (context: SignupContext) =>
  new URLSearchParams({
    plan: context.planKey,
    units: String(context.unitCount),
    months: String(context.prepaidMonths),
    source: context.source,
  }).toString();
export const signupHref = (context: SignupContext) => "/signup?" + contextQuery(context);
export const plansHref = (context: SignupContext) => "/plans?" + contextQuery(context);
