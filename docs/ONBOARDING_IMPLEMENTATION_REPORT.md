# Acquisition and onboarding implementation report - 2026-10-25

## What changed

The public first viewport now offers direct product exploration and subscription calculation. The existing plan calculator still sources all money from `/acquisition/plans`; signup confirms the selected tier has a current server quote before creating a new account and shows the estimated initial commitment. The owner onboarding step displays the authenticated server quote before contract generation, allows legal/portfolio details to be corrected while editable, and repeats later-cycle cost beside the issued payment amount. The signed contract and invoice remain authoritative for actual obligations.

The previously implemented paid journey is reused: owner email verification, versioned contract, typed signature, invoice, Paystack checkout, signed webhook/server reconciliation, activation, saved portfolio wizard and real-record dashboard. No second billing or authorization path was introduced. Super Admin conversion visibility continues through the existing acquisition funnel, which distinguishes anonymous client-reported milestones from verified payment and first-value evidence. This slice did not add new analytics event types or collect personal data in public telemetry.

## Before and after

Before: landing -> assisted-demo prompt -> hard-to-find plans -> signup without fresh quote -> sparse owner quote -> contract/payment.

After: landing -> self-guided fictional demo or plans -> server quote -> selected signup estimate -> verified owner -> explicit owner quote -> reviewed/signed contract and invoice -> verified Paystack payment -> guided real-property setup. Assisted sales remains optional.

## Verification

| Check | Result |
| --- | --- |
| Typecheck | Backend and frontend passed. |
| Lint | Frontend passed with 27 pre-existing warnings and zero errors. Backend was not edited in this slice. |
| Root unit suites | 364 backend passed (198 opt-in skipped); 285 frontend passed. |
| Focused frontend tests | 12 passed across signup validation, plan context, and onboarding API routing. |
| Production build | Backend and frontend passed; `/`, `/plans`, `/signup`, `/onboarding`, `/get-started` generated. |
| New acquisition browser verifier | Passed at 390px and 1440px: landing links, selected plan/units/term, delayed fresh signup quote, cached-valid-to-unavailable guard, password reveal, no horizontal overflow or page errors. Catalog responses were explicitly mocked. |
| Existing self-service browser verifier | Passed at 390px and 1440px with isolated MongoDB and signed Paystack test fixture: signup, email OTP, interrupted checkout, verified activation, property creation, XLSX correction/import, resume and actual-data dashboard. Zero runtime errors; no recovery email or live debit. |
| Backend onboarding replica-set E2E | 23 passed with a 30-second per-test timeout. |
| Public landing visual matrix | 12 light/dark viewport checks passed, including mobile, tablet, short laptop, desktop and wide desktop; 3D canvas, hit targets, theme toggle and layout checks passed. An initial run against the ordinary dev server was obstructed by the Next.js dev toolbar; the passing isolated fixture disabled that toolbar only for browser tests. |
| Static release certification | `CERTIFIED_STATIC`: 38 route files, 155 permissions and 10 critical paths. |

Do not interpret local fixtures as real merchant or hosted-service acceptance.

## Files

Added: `docs/CUSTOMER_JOURNEY_AUDIT.md`, `docs/FRICTION_ELIMINATION_REPORT.md`, `docs/ONBOARDING_IMPLEMENTATION_REPORT.md`, `apps/frontend/scripts/verify-acquisition-handoff.mjs`.

Modified: `apps/frontend/src/components/marketing/landing/landing-page.tsx`, `apps/frontend/src/components/marketing/landing/digital-twin.css`, `apps/frontend/src/app/plans/page.tsx`, `apps/frontend/src/app/signup/page.tsx`, `apps/frontend/src/app/onboarding/page.tsx`, `apps/frontend/src/lib/acquisition.ts`, `apps/frontend/src/lib/data/landlord-onboarding.ts`, `apps/frontend/src/lib/plans-view-model.test.ts`, `apps/frontend/scripts/verify-landing.mjs`, `apps/frontend/scripts/landing-layout-checks.mjs`, `docs/CODEX_EXECUTION_TRACKER.md`.

## Before the first paying customer

Approve Control/Fort Knox catalog pricing and entitlements, tax and hardware terms, and the published legal contract. Configure verified email delivery and Paystack credentials/callback/webhook in Coolify, provision a MongoDB replica set and required indexes, run the worker, and complete a real staging checkout/renewal/settlement plus a deployed mobile smoke journey. Keep onboarding recovery OFF unless separately approved. The selected social-OAuth quote handoff and any remaining browser edge cases should be handled before marketing it as an uninterrupted paid path. See `SELF_SERVICE_LANDLORD_ONBOARDING.md` and `PHASE_A_OWNER_ACTIONS.md` for the existing operating gates.
