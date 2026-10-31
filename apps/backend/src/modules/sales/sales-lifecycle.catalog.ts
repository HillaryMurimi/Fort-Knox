export const salesLifecycleEvents = [
  "landlord.signup.created",
  "landlord.email.verified",
  "organization.activated",
  "portfolio.import.completed",
  "portfolio.first_value.reached",
  "property.created",
  "building.created",
  "floor.created",
  "unit.created",
] as const;
export const salesLifecycleAudits = [
  "landlord.organization.configured",
  "landlord.onboarding.transition",
  "landlord.payment.pending",
  "portfolio.bulk_import.completed",
  "portfolio.first_dashboard.visited",
] as const;

export function sourceStage(name: string, state?: string) {
  if (name === "landlord.signup.created")
    return { rank: 9, stage: "REGISTERED" };
  if (name === "organization.activated")
    return { rank: 13, stage: "SUBSCRIPTION_ACTIVATED" };
  if (name === "portfolio.first_value.reached")
    return { rank: 14, stage: "ONBOARDING_IN_PROGRESS" };
  if (name === "landlord.payment.pending")
    return { rank: 11, stage: "CHECKOUT_STARTED" };
  if (name === "landlord.onboarding.transition" && state === "PAYMENT_VERIFIED")
    return { rank: 12, stage: "PAYMENT_VERIFIED" };
  if (
    name === "landlord.onboarding.transition" &&
    [
      "PLAN_SELECTED",
      "CONTRACT_GENERATED",
      "CONTRACT_PENDING_SIGNATURE",
      "CONTRACT_SIGNED",
    ].includes(state ?? "")
  )
    return { rank: 10, stage: "PLAN_SELECTED" };
  return null;
}
