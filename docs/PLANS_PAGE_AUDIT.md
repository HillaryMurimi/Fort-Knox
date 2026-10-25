# Plans page audit - 2026-10-25

## Current implementation update

The authenticated `/onboarding` plan step now reuses the public catalog and a shared, full-width Control/Fort Knox matrix. It displays both current monthly/upfront quotes from the backend, selected-plan authenticated quote details, and published-plan availability before contract generation. Comparison rows have been expanded only around implemented property, finance, tenant, maintenance, staff, security, document and intelligence surfaces; CCTV/provider/model prerequisites remain disclosed. The supplied target table ended mid-way through Staff & Access Management, so unsupported or unspecified feature claims were not inferred.

The subsequent premium Plans page keeps the server quote and selected signup handoff while adding a property-image hero, mobile-first quote controls, complete tier breakdowns, domain-grouped entitlement comparison, business-value sections and light/dark treatment. The public catalog and onboarding now fail closed when Fort Knox omits an active Control entitlement. These changes do not make optional CCTV/model integrations live; the signed agreement and backend-verified payment remain authoritative.

## Existing journey

The public `/plans` page fetches Control and Fort Knox quotes from
`/api/v1/acquisition/plans`. The backend's `priceSnapshot` also prices the
reviewed contract and invoice; signup carries plan, unit count and prepaid
months into the existing verified-email, agreement, Paystack checkout and
property-onboarding sequence. The browser price is illustrative, not billing
authority. Plan entitlements come from `SubscriptionPlan.entitlements.features`.

## Findings

- The page truncates each feature list at eight, so the comparison can omit
  meaningful Fort Knox entitlements. Raw feature identifiers are hard to scan.
- The current catalog renders a single fetch error for any invalid tier; an
  otherwise configured tier cannot be selected.
- `priceSnapshot` silently treats missing unit-pricing metadata as all units
  included with no additional-unit charge. This can underquote a plan and
  should block acquisition instead of inventing a price.
- The cards do not distinguish base price, extra-unit amount, upfront total
  and subsequent interval total clearly. There is no complete comparison view.
- Loading is text-only; the controls, selections, and mobile quote layout need
  stronger hierarchy, focus states, and a clear continuation point.

## Boundaries

No plan price, included-unit allowance, tax, hardware cost or feature is
invented here. The server remains authoritative for agreement, invoice,
Paystack verification and subscription activation. A public catalog quote is
not proof of payment or access. Live merchant checkout, settlement, renewal,
and Coolify browser smoke tests remain release gates.
