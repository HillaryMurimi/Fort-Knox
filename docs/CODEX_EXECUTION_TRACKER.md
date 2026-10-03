# Property Management Command Center - Codex Execution Tracker

## Repository reconstruction and platform-control repair (2026-10-01)

Repository checkpoint: main at 6d0cfb2 before this change, following 49f1406 (sales lead capture) and 068e31a (landlord prepaid onboarding). The only pre-existing untracked directory was .continue/; it is preserved. No restart or parallel application was created.

### Current implementation state

- Completed foundations: modular Express/TypeScript/Mongoose backend, Next.js role-specific workspaces, server authorization/scope infrastructure, rent confirmation/reversal transactions, payment event outbox/worker, quality scripts and container definitions. These are implemented foundations, not acceptance certification of every feature.
- Partially completed: operational domain journeys, authoritative minor-unit storage migration, billing/provider acceptance, service-switch enforcement, Super Admin operations, optional property hierarchy and comprehensive browser E2E coverage.
- Broken at takeover: switch state persisted before audit (audit failure could leave a changed switch); NVR used CCTV endpoint/credential; the blanket camera route gate required CCTV_GATEWAY even for NVR cameras.
- Missing in inspected onboarding path: durable versioned contract acceptance/signature; real Gmail, Google Sheets and Drive synchronization. SalesService stores database leads/requests and CRM metadata only; gmailFollowUp=true is not an email delivery.
- Tests failing at takeover: none in the configured baseline after supplying CI-equivalent test environment variables (176 backend and 59 frontend passed, 36 database tests skipped). Database and live-provider acceptance remained unverified.
- Previous stopping point: initial platform switch catalog/dashboard and selected enforcement paths in 6d0cfb2. TENANT_OTP_LOGIN, DECISION_INTELLIGENCE and DECISION_AUTOMATION had no enforcement references.
- Recommended bounded next task: restore trustworthy audit atomicity and independent camera gateway controls before expanding the remaining switch coverage.

Required repository docs and configs were inspected before edits. BILLING_ARCHITECTURE.md, PRICING_MODEL.md, SUBSCRIPTIONS.md and pnpm-workspace.yaml are absent. This repository uses npm prefix scripts and generated OpenAPI in apps/backend/src/core/api/openapi.ts, not the documented docs/api/openapi.yaml.

### Implemented in this slice

- PlatformControlService.update now checks platform administration at the service boundary, reads/writes in a MongoDB transaction, records before/after audit in that same session, and always closes the session.
- Camera live/playback service calls retain entitlement and resource authorization and then check only the resolved gateway switch (NVR_GATEWAY for NVR, CCTV_GATEWAY otherwise). Direct service calls are covered, not merely frontend visibility.
- NVR live/playback/health use NVR_BASE_URL/NVR_API_KEY, without falling back to CCTV configuration. Health remains available with streaming OFF.
- Added switch schema, authorization, session/audit propagation, fail-closed guard, provider isolation, camera-service scope/entitlement and isolated replica-set rollback regression tests.
- Updated generated OpenAPI, API specification and README to reflect actual boundaries and outstanding integrations. No new database collection, destructive migration or production configuration write.

### Remaining MVP acceptance gaps

| Area | Existing implementation / gap |
| --- | --- |
| Sales CRM | Demo and assistance records persist through the backend. Gmail/Sheets/Drive adapter, durable synchronization, retries and operational acceptance are missing. |
| Landlord contract | The onboarding UI has a client-only checkbox; no signed/versioned acceptance is enforced by subscription creation. |
| Prepaid billing | API restricts initial prepayment to 3-24 months. Paystack checkout passes both a plan code and multiplied amount; provider amount handling and delayed renewal are not certified. No explicit prepaid-term renewal start is configured in that request. Do not claim successful three-month advance collection/renewal yet. |
| Tenant onboarding/auth | Hash/expiry/attempt controls and assigned unit binding exist. Completion is multi-record, non-transactional and returns a unit binding followed by separate login, not the full automatic active-tenancy journey. Concurrent OTP consumption/resend and assignment safety need dedicated tests/review. |
| Property hierarchy/passport | Hierarchy/setup/history modules exist. Standalone presentation creates Site/Ground Floor; truly optional intermediate references remain unfinished. |
| Maintenance/contractors | Workflow/policy and assigned-job modules/tests exist; full quote-to-evidence-to-closure staging/browser acceptance remains required. |
| Finance/payments | Transactional rent allocation/reversal and event delivery exist; canonical minor-unit cutover, other money collections/report readers, settlement acceptance and additional rails remain open. |
| CCTV/security | Camera APIs currently return stored gateway references. Fresh short-lived browser stream sessions, surveillance view/playback access audit, step-up/export and hardware acceptance are not completed by this repair. |
| Evidence/notifications | Storage/messaging provider boundaries exist. Malware quarantine, unsupported channels/providers and delivery/retry acceptance remain open. |
| Intelligence/automation/Action Queue | Existing modules are foundations. Feature switches, worker/service entry-point enforcement and complete explainable operational acceptance remain unfinished. |
| Admin/deployment | Control plane and Coolify configs exist. Provider readiness, full switch coverage, recovery guarantees, image/staging acceptance and monitoring remain release gates. |

Switch catalog defaults remain OFF; no live switch was changed. Missing records fail closed. This does not prove all catalog features are OFF end-to-end: payment and billing internal calls, storage uploads, tenant OTP, intelligence and automation workers still need boundary enforcement. SMS_NOTIFICATIONS also gates production OTP transport, including privileged step-up, so admin recovery cannot be assumed unaffected. Existing external streaming sessions are not revoked by these switches.

### Verification

- Configured root npm test: 208 backend passed, 38 opt-in database tests skipped; 59 frontend passed. The final focused suite passed all 33 new non-database assertions, including the subsequently added generated-OpenAPI regression.
- Root npm run typecheck passed after correcting a new test's overloaded Mongoose mock typing.
- Root npm run lint passed with 289 backend / 25 frontend warnings and zero errors.
- Two replica-set switch commit/rollback tests were added to the existing opt-in E2E suite but not executed. Only an Ubuntu binary and an incomplete Windows download were found in the remote test cache; no usable Windows mongod was available.
- Root npm run build passed (backend compiler and Next.js production build, 39 static pages). Final generated OpenAPI was subsequently tested and backend rebuild passed. npm run certify:release passed with CERTIFIED_STATIC (35 route files, 154 permissions, 6 critical paths); static certification is not live-provider acceptance. Final git diff --check and focused authorization/provider diff review passed.
- No GitHub push, deployment, external CRM write or live provider operation performed in this slice.

## Phase A-F Delivery Map

This is the dependency order for the attached platform expansion brief. Existing related modules are foundations, not evidence that a phase is complete.

| Phase | Current position | Exit work still required |
| --- | --- | --- |
| A - Architecture | Partial: regional profile, boundary Money helper, transitional rent-ledger minor-unit fields, KE/KES rail guard, event store, payment provider adapters, transactional finance writes, and payment-activity outbox/worker/replay exist. | Complete authoritative integer-minor-unit finance migration and API/report conversion; expanded country/currency/provider matrix with merchant acceptance; transactional events and consumers across other critical domains; bulk backfill and delivery observability; provider-boundary review. |
| B - Recurring services | Job-based contractor module exists; recurring service lifecycle is not complete. | Scoped providers, contracts, schedules, visits, verification, invoices, SLA/performance, UI and E2E. |
| C - Reliability | Jobs and integration attempts exist; reliability center is not complete. | Integration health signals, queue/webhook observability, safe retry policy, admin/operator views and tests. |
| D - Evidence/documents | Documents and evidence modules exist; intelligence and integrity are not complete. | Content hashing/verification, extraction, permission-filtered grounded retrieval, invoice review and tests. |
| E - Automation | Decision automation exists; the requested structured low-code engine is not complete. | Versioned safe rules, event/schedule triggers, dry-run, scoped execution, audit and tests. |
| F - Owner intelligence | Command-center and intelligence modules exist; requested owner workflows are not complete. | Event timeline, morning brief, experience score, guarded churn support, scenario simulation and tests. |

Next dependency gate: migrate authoritative finance values to integer minor units, then establish the country/currency/provider matrix. Expand event delivery beyond payment activity before treating Phase B-F features as production-ready. Payment settlement reconciliation remains a separate financial workstream; the recent Paystack refund slices did not close Phase A. See `PHASE_A_OWNER_ACTIONS.md` for owner-side inputs and release gates.

## Slice 46 - Transitional Rent Ledger Minor Fields (2026-09-29)

- New rent charges, pending payments, and manual/provider payment allocations now write integer minor-unit fields alongside the existing major-unit fields. Confirmation and reversal prefer the minor fields when present, verify major/minor parity and charge balance invariants, then update both representations transactionally. Legacy records without minor fields remain readable for the transition; mismatches fail before allocation writes.
- This does **not** complete the canonical migration. Major-unit fields still drive API responses, report aggregates, arrears queries, other finance collections, and older event payloads. No production database has been inventoried or backfilled, and non-KES operating finance remains disabled. The next work must migrate the remaining money-bearing collections and readers, verify/backfill historical rows, then deliberately retire the major-unit authority.
- Verification: typecheck, lint (warnings only), tests (176 backend passed/36 opt-in skipped; 59 frontend passed), and build passed. The replica-set E2E attempt could not run because `mongodb-memory-server` began downloading a 694 MB binary and exceeded its setup timeout before any assertion. Re-run that suite with an installed/cached `mongod` binary in staging before release.

## Slice 45 - Fail-Closed Rent Rails and Coolify Deployment (2026-09-29)

- Operational checkout now applies a centralized KE/KES M-Pesa/Paystack rail policy against the organization's regional profile. It refuses unsupported country/currency/provider combinations and requires an active default organization destination matching the currency and country before a provider call. Paystack checkout must pass the configured subaccount code; M-Pesa destination shortcode must match deployment credentials. Destination setup checks the organization region before onboarding. This prevents fallback to an unscoped platform-level Paystack rent checkout.
- Added a Git-backed Coolify Compose application with private API/worker and proxied web/API services, health checks, frontend build-time public URLs, runtime secrets through Coolify variables, and no committed `.env.production`. The owner runbook records Coolify domains, variables, seed commands, and provider callbacks. The existing non-Coolify Compose reference now supplies the frontend site URL build argument.
- Phase A remains **partial**: the policy intentionally enables only KE/KES because storage and reports have not been migrated. Per-market merchant approval, additional currencies, provider settlement verification, event coverage, and canonical minor-unit storage are not complete.
- Verification: `docker compose -f docker-compose.coolify.yml config --quiet` passed with placeholder variables. Root typecheck, lint (283 backend and 24 frontend warnings, zero errors), tests (174 backend passed/35 opt-in skipped; 59 frontend passed), and build passed. The opt-in replica-set E2E suite passed 35 tests. Docker image builds could not run because the local Docker Desktop engine is unavailable; the first Coolify staging deployment must verify both images and service health.

## Slice 44 - Exact Legacy Finance Arithmetic and Phase A Inventory (2026-09-29)

- Manual/provider rent allocations, reversals, and rent-charge totals now calculate in integer KES minor units before writing through the existing major-unit schema. New rent, payment, expense, tenancy/unit, property setup, and maintenance monetary inputs reject values that cannot be represented exactly in KES cents. This reduces rounding drift but is **not** the authoritative storage migration.
- Added read-only `phase-a:inventory` for a target MongoDB database and `PHASE_A_OWNER_ACTIONS.md`. The owner reports no live finance data; this must still be verified per environment before any future storage cutover. The command never changes data.
- Remaining Phase A gates: canonical minor-unit storage and API/report conversion, multi-country/provider capability policy with merchant acceptance, broader transactional event producers/consumers, bounded legacy replay/backfill, observability, and provider-boundary review. Do not mark Phase A complete or enable non-KES finance based on this slice.
- Verification: root typecheck, lint (283 backend and 24 frontend warnings, no errors), tests and build passed; the opt-in replica-set E2E suite passed all 35 tests. No real provider or target-database inventory check was run in this slice.

## Slice 43 - Payment Event Outbox and Replay (2026-09-29)

- Payment confirmation/reversal now atomically insert a system-owned delivery job with the event, ledger, and audit. The existing worker leases/retries jobs and projects a unit-scoped `PaymentActivity` record once per event. Job success/dead-letter state is the per-consumer checkpoint; `publishedAt` indicates this consumer completed, not broker-wide delivery.
- Platform admins can replay one payment event through `POST /api/v1/jobs/domain-events/replay` with `{ "eventId": "<uuid>" }`. Replay is audited, transactional, and idempotent at the projection; it never repeats a payment or ledger transition. Ordinary job enqueue cannot claim the reserved event job/key namespace.
- Replica-set tests cover atomic outbox failure rollback, worker delivery, cross-organization refusal, and replay without duplicate activity or payment allocations. Other event types, non-transactional producers, bulk legacy backfill, delivery metrics/alerts, and independent multi-consumer checkpoints remain open. Worker deployment and replica-set MongoDB are required for delivery.
- Existing MongoDB deployments should inspect `jobs` indexes before enabling the worker. The schema now declares one unique sparse `dedupeKey` index; a previously created non-unique index with the same key may need a controlled index migration after duplicate-key review.
- Verification: root typecheck, lint (283 backend and 24 frontend warnings, no errors), tests (backend 166 passed/32 opt-in skipped; frontend 59 passed), and build passed. The opt-in replica-set E2E command passed all 32 tests.

## Slice 42 - Transactional Payment Domain Events (2026-09-29)

- Extended `EventStore.append` to join a caller's MongoDB transaction. Payment confirmation (manual or provider) and reversal now append scoped, non-secret `payment.confirmed` and `payment.reversed` events atomically with rent balances and audit. The existing `audit.view` Domain Events tab exposes these records; event and audit-log reads now restrict unit-scoped viewers to their assigned units. No new public API or permission was added.
- Replica-set tests cover sequence, duplicate-provider idempotence, audit rollback, and event-failure rollback. Event delivery to handlers is not implemented here; do not treat `publishedAt` or the event collection as a reliable broker.
- Remaining Phase A work is tracked in the delivery map above. The current finance fields still use legacy major units, so event payloads explicitly label their amount as `amountMajorUnits`.
- Verification: root typecheck, lint (282 existing backend and 24 existing frontend warnings, no errors), tests (backend 163 passed/27 opt-in skipped; frontend 59 passed), and build passed. The opt-in replica-set E2E command passed all 27 tests. A direct Vitest invocation from the wrong workspace hit a transient Windows worker `EPERM`; the backend-scoped focused test and full repository suite passed on rerun.

## Slice 41 - Paystack Refund Investigation (2026-09-29)

- Added a Finance review dialog for `SUBMISSION_UNKNOWN` and `NEEDS_ATTENTION` with investigation notes. Unknown submissions require the existing Paystack refund ID; customer bank details stay in Paystack. No review action submits a second refund or adjusts rent.
- The review API checks `financial.manage` and unit scope, fetches the provider refund, freshly verifies the original Paystack transaction and PMCC ownership metadata, and requires matching transaction ID, amount, currency, and reference. Latest reviewer/note and provider status are committed with audit in a MongoDB transaction; notes are not copied into audit metadata.
- Replica-set E2E covers missing/foreign ID, authorization, no duplicate provider POST, unchanged rent ledger, and audit-failure rollback. Existing refund records without unit scope still require controlled backfill for scoped list visibility.
- Remaining: Paystack test-merchant acceptance, secure handling of `NEEDS_ATTENTION` bank details through provider workflow, partial refunds, M-Pesa reversal, settlement reconciliation, and read-only development refund preview. This does not certify live refund processing.
- Verification: root typecheck, lint (282 existing backend and 24 existing frontend warnings, no errors), tests (backend 162 passed/24 opt-in skipped; frontend 59 passed), and build passed. The opt-in replica-set E2E command passed all 24 tests.

## Slice 40 - Supervised Paystack Refund Ledger Review (2026-09-29)

- Added a landlord Finance refund review with full-refund request, provider status refresh, distinct processed-refund ledger correction, confirmation, and responsive error/empty states. The correction control requires both `financial.manage` and `payment.reverse`; the backend remains authoritative.
- Added a bounded, organization/unit-scoped refund list and a supervised `apply-ledger` endpoint. It re-fetches Paystack status and requires `PROCESSED` before transactionally reversing the full rent allocation, recording actor/time on the refund, and auditing. The generic reversal endpoint cannot bypass this rule for Paystack payments or recorded refunds.
- Replica-set E2E tests cover pending-refund refusal, single application, audit-failure rollback, and scoped list isolation. Existing refunds without scope fields require a controlled backfill for unit-scoped list visibility.
- Remaining: manual resolution of `SUBMISSION_UNKNOWN`/`NEEDS_ATTENTION`, partial refunds, M-Pesa Daraja reversal, settlement/bank reconciliation, live Paystack staging acceptance, and a read-only refund fixture for development preview. Provider `PROCESSED` is not proof of receipt in the customer's account.
- Verification: root typecheck, lint (282 existing backend and 24 existing frontend warnings, no errors), tests (backend 162 passed/22 opt-in skipped; frontend 59 passed), and build passed. The opt-in replica-set E2E command passed all 22 tests.

## Slice 39 - Paystack Refund Tracking (2026-09-28)

- Added one full Paystack refund record per confirmed payment, a scoped `financial.manage` request/get/reconcile API, fresh verification of the original Paystack transaction and PMCC ownership metadata, and an adapter for provider create/fetch. Refund submission is not retried after an ambiguous failure.
- Signed Paystack refund events update the separate provider status only after amount/currency and provider refund ID checks; events without an ID fetch the already recorded refund. Refund request and status audits use MongoDB transactions. The rent ledger is not changed by a provider refund status.
- Remaining: a landlord-facing refund review UI; automatic or supervised ledger correction after confirmed provider processing; manual resolution for `SUBMISSION_UNKNOWN` and `NEEDS_ATTENTION`; partial refunds; Daraja reversal with initiator security credential and callbacks; settlement reconciliation. Production needs a Paystack secret/webhook setup and replica-set MongoDB. Do not enable M-Pesa refund claims on this basis.
- Verification: root typecheck, lint (existing warnings only), tests (backend 162 passed/18 opt-in skipped; frontend 59 passed), and build passed. The opt-in replica-set E2E command passed 19 tests, including refund request rollback, idempotence, signed webhook handling, and foreign-reference rejection.

## Slice 38 - Transactional Payment Reversal (2026-09-28)

- Reversal now re-reads and authorizes the confirmed payment in a MongoDB transaction, validates the entire allocation set and linked charge scope/currency/balances, and commits restored charge balances, `REVERSED` state, and an audit entry together. Historical allocations remain intact; a second reversal is rejected.
- Replica-set E2E coverage verifies success, audit-failure rollback, and refusal to reverse incomplete historical allocation data.
- This is a ledger correction only, not a Paystack or M-Pesa refund. Provider refund and settlement workflows, other multi-record finance operations, integer minor-unit migration, and durable event delivery remain open.
- Verification: root typecheck, lint (existing warnings only), tests (backend 160 passed/13 opt-in skipped; frontend 59 passed), and build passed. The isolated replica-set E2E command passed 13 tests, including reversal rollback and unauthorized access.

## Slice 37 - Transactional Payment Confirmation (2026-09-28)

- Manual and verified provider payment confirmation now re-read payment and charge state inside a MongoDB transaction. Allocation rows, charge balances, payment status, and the confirmation audit commit together; duplicate provider confirmation creates no second allocation. Provider receipt, method, and paid time survive the transactional re-read.
- Added focused session/idempotence tests and opt-in replica-set E2E coverage for successful confirmation and rollback after audit failure. Updated the existing backend contract E2E suite to use a replica set and an explicit M-Pesa query fixture; repaired the cross-platform `npm run test:e2e` command.
- Production requires replica-set or sharded MongoDB for payment confirmation. Payment reversal and other financial workflows still need transaction review. Legacy major-unit finance migration, country/provider matrices, durable event delivery, and the broader Phase A work remain open.
- Verification: root typecheck, lint (existing warnings only), tests (backend 160 passed/9 skipped; frontend 59 passed), and build passed. The opt-in replica-set E2E command passed 9 tests, including manual and provider rollback cases.

## Slice 36 - Legacy Finance Currency Guard (2026-09-28)

- Kept operational finance creation on the current KES ledger: rent charges, generated rent, payments, expenses, and service-charge assessments reject non-KES input. Paystack settlement onboarding rejects non-KES/non-KE account details before contacting the provider; crypto wallets remain pending and are not tenant checkout rails.
- Manual payment confirmation now checks all proposed allocations, including organization/tenancy scope, duplicate charge IDs, balance and currency, before the first allocation write. Provider confirmation queries only charges in the payment currency. Historical non-KES records are not rewritten and can still be reconciled only with matching currency.
- Remaining: migrate major-unit financial collections and reports to integer minor units; make manual and provider multi-record allocation transactions atomic under concurrent requests; then enable country/provider/currency matrices. Event delivery and broader Phase A work remain open.
- Verification: root typecheck, lint (existing warnings only), tests (backend 157 passed/6 skipped; frontend 59 passed), and build passed. Focused tests cover legacy currency rejection, duplicate allocation rejection, manual cross-currency preflight, and provider charge selection.

## Slice 35 - Regional Organization Profile (2026-09-28)

- Added a typed regional profile on organizations with explicit KE, KES, en-KE and Africa/Nairobi defaults for existing and newly created records. The profile carries country, base/allowed currencies, locale and IANA time zone.
- Authorized organization managers can update validated locale and time zone in Settings. Country and currency fields are rejected at the API; KES finance/provider flows and historical values are unchanged. Regional edits use the existing organization-scope authorization and before/after audit record. Development preview does not issue this write.
- Replaced inert Settings controls with navigation links and a responsive regional editor with a fixed-currency format preview. Shared currency formatting now accepts a locale and respects the currency's own fraction scale.
- Added organization defaults/schema tests and formatting tests. Remaining: apply locale/time-zone formatting across all operational screens, migrate authoritative finance data to integer minor units, add supported country/payment-provider matrices, and only then enable non-KES organization finance. Transactional outbox and event delivery from Slice 34 also remain open.
- Verification: root typecheck, lint (existing warnings only), tests (backend 153 passed/6 skipped; frontend 59 passed), and build passed. Browser viewport review could not run because the in-app browser was unavailable in this session.

## Slice 34 - Phase A Foundation (2026-09-28)

- Added a currency-aware integer-minor-unit `Money` value helper and applied it to Paystack initiation, billing plans, renewal matching, and webhook amount checks. Existing KES behavior remains; unsupported or over-precise amounts now fail before provider submission.
- Centralized domain-event append in `EventStore`. Aggregate versions advance using the existing unique index with duplicate-key retries. Events now accept schema version, source, actor role, and request ID, and reject sensitive payload keys. Audit UI exposes event sequence and trace metadata; `audit.view` remains required server-side.
- Added focused tests for currency scales, precision, event sequencing, collisions, and payload guards.
- Phase A remains **partial**: organization country/locale/time zone configuration, authoritative minor-unit financial migration, supported-currency/provider matrices, transactional outbox, durable broker/consumer replay, and broad provider abstraction review still need design and implementation. The requested Phases B-H are not implemented by this slice. Do not treat the current event collection as a reliable delivery queue or switch live organizations to non-KES money on this basis.

## Slice 33 - Guided Property Setup (2026-09-28)

- Added transactional property setup with server-side hierarchy validation, permission and entitlement checks, generated building/floor/unit audits, expanded unit categories, and custom unit-type labels.
- Added a responsive four-stage landlord setup at `/properties/setup`: property/location, structure, repeated unit layout with per-type asking rents, and editable review. Added a real property hierarchy/passport screen at `/properties/:propertyId` and preserved individual forms for later edits.
- Standalone mode creates an internal Site/Ground Floor hierarchy for existing operational references. Asking rent is stored on Unit; agreed/historical rent stays on Tenancy. Unit API reads redact rent and service charge without scoped `rent.view`. Unit edits/deactivation now audit before/after state in a transaction.
- Remaining gaps: true optional building/floor foreign keys across all downstream domains; existing list endpoints are not paginated; bulk post-onboarding move/rename/type/rent operations and map geocoding are not yet implemented. Production setup requires MongoDB transactions. The opt-in backend E2E suite could not start because mongodb-memory-server timed out downloading its 774 MB MongoDB binary; run it again after caching/provisioning MongoDB.
- Verification: backend and frontend typecheck/build passed; lint passed with pre-existing warnings (zero errors); backend 145 tests passed/6 skipped, frontend 57 passed. Browser walkthrough reached review at desktop/mobile with no horizontal overflow after a shared top-bar tooltip fix. No live database commit was performed in the development UI bypass.

## Current Objective

Maintain a production-safe frontend role workspace system with development-only role and screen preview tooling. Preview state may control navigation and route presentation only; backend RBAC, ABAC, organization scope, resource ownership, and feature entitlements remain authoritative.

## MVP Status

| MVP Capability | Status | Notes |
|---|---|---|
| Existing Landlord Command Center preserved | COMPLETE | Existing dashboard and domain routes remain available. |
| Theme system | COMPLETE | Light, dark, and system theme infrastructure exists. |
| Theme switcher | COMPLETE | Available in the application shell. |
| Role-aware navigation | COMPLETE | Centralized in `apps/frontend/src/lib/navigation.ts`. |
| Development role preview | COMPLETE | Persisted preview role drives auth context, navigation, and route presentation in development only. |
| Development screen directory | COMPLETE | `/dev/preview` lists every role workspace and configured navigation route; production requests receive 404. |
| Tenant workspace | COMPLETE | Mobile-oriented workspace and tenant navigation exist. |
| Contractor workspace | COMPLETE | Includes active work and job-history presentation. |
| Caretaker workspace | COMPLETE | Operational workspace exists. |
| Property Manager workspace | COMPLETE | Assigned-portfolio workspace exists. |
| Super Admin overview | COMPLETE | Admin workspace exists. |
| Super Admin organizations | PARTIAL | Platform UI exists; depth depends on available APIs. |
| Super Admin users | PARTIAL | Presentation exists; advanced administration remains API-dependent. |
| Super Admin roles/permissions | PARTIAL | Presentation exists; advanced administration remains API-dependent. |
| Super Admin subscriptions/plans | PARTIAL | Platform billing UI exists. |
| Super Admin integrations | PARTIAL | Health presentation exists; provider operations remain API-dependent. |
| Super Admin security | PARTIAL | Presentation exists; advanced session/security operations remain. |
| Super Admin audit | PARTIAL | Audit presentation exists; advanced filtering/export remains. |
| Shared dashboard primitives | COMPLETE | Shared cards, headers, statuses, dialogs, and query states exist. |
| Demo-data architecture | PARTIAL | Centralized typed demo provider exists; several screens still need real APIs. |
| Responsive behavior | PARTIAL | Shared responsive baseline exists; formal viewport regression coverage remains. |
| Accessibility baseline | PARTIAL | Focus, semantics, reduced motion, and shell navigation exist; full audit remains. |
| Frontend tests | PARTIAL | Role preview and route presentation now covered; broader component/E2E coverage remains. |
| Typecheck | COMPLETE | `npm run typecheck` passes as of 2026-09-24. |
| Lint | NEEDS FIX | `next lint` prompts for first-time configuration and is deprecated in Next 15. |
| Tests | COMPLETE | 15 Vitest assertions pass as of 2026-09-24. |
| Production build | COMPLETE | `npm run build` passes and generates 31 routes as of 2026-09-24. |

## Completed Slices

### Slice 14 - Rent collection and settlement onboarding

Implemented:
- Connected the tenant Pay Rent action to scoped rent charges and pending payment creation.
- Added M-Pesa STK Push initiation with phone confirmation messaging.
- Added Paystack hosted checkout selection across all documented channels, while leaving final availability to the landlord's Paystack account and country.
- Added organization-scoped settlement destinations with landlord settings authorization, audit events, masked bank storage, default uniqueness, and disable behavior.
- Added Paystack subaccount provisioning and automatic subaccount routing during checkout.
- Added M-Pesa shortcode onboarding that activates only when it matches the server's configured Daraja shortcode.
- Added crypto wallet onboarding as `PENDING_PROVIDER_SETUP`; tenant crypto checkout is intentionally blocked until verified processing, exchange-rate locking, webhook verification, and blockchain reconciliation are implemented.
- Preserved provider webhook confirmation as the only automatic success path.

Tests added:
- Paystack channel and subaccount forwarding.
- Paystack subaccount creation payload and secret non-disclosure.
- Settlement destination schema acceptance and malformed-detail rejection.
- Payment initiation channel validation.

Verification:
- Frontend typecheck: PASS.
- Focused backend tests: PASS, 3 files and 8 tests.
- Full backend typecheck: BLOCKED by pre-existing Express 5/Mongoose typing failures outside this slice; touched payment files introduce no additional filtered errors.

Remaining payment gaps:
- Connect a production crypto payment processor before exposing crypto to tenants.
- Add bank-list/account-resolution UX for Paystack instead of requiring the bank code.
- Add browser E2E coverage for STK Push and Paystack redirect return states.
- Migrate authoritative financial amounts from major-unit `Number` fields to integer minor units.

### Slice 13 - Development-only role screen preview

Completed:
- Added a dedicated persisted preview-role value that takes precedence over the configured development default.
- Added an immediate same-tab role-change event and cross-tab storage synchronization in `AuthProvider`.
- Fixed TENANT selection so `/tenant`, sidebar navigation, and route presentation all resolve from the same selected role.
- Preserved production behavior by returning no preview role in production and returning 404 from `/dev/preview` in production.
- Added `/dev/preview` with every role home and configured role-navigation route.
- Added `View workspace`, `Preview all screens`, and `Reset preview role` shortcuts to the development role box.
- Kept preview behavior presentation-only; no backend permission or entitlement checks were bypassed.
- Added Vitest and focused role-preview/navigation/route-presentation tests.

Files added:
- `apps/frontend/src/app/dev/preview/page.tsx`
- `apps/frontend/src/components/dev/dev-preview-screen.tsx`
- `apps/frontend/src/lib/auth/dev-auth.test.ts`
- `apps/frontend/src/lib/route-presentation.test.ts`
- `apps/frontend/vitest.config.mts`

Files modified:
- `apps/frontend/src/lib/auth/dev-auth.ts`
- `apps/frontend/src/context/auth-context.tsx`
- `apps/frontend/src/components/dev/dev-role-switcher.tsx`
- `apps/frontend/src/components/workspaces/shared.tsx`
- `apps/frontend/package.json`
- `apps/frontend/package-lock.json`
- `docs/CODEX_EXECUTION_TRACKER.md`

Tests:
- Preview role overrides the configured default.
- Reset behavior falls back to the configured role.
- Invalid stored values are rejected.
- Preview roles are disabled in production.
- TENANT can present `/tenant` but not `/dashboard`.
- Role navigation follows the selected role.
- Permission-labelled navigation may be shown for preview without changing API authorization.
- Every role home is presentable for its own role.
- Cross-role workspaces remain unavailable.
- Hash and query route normalization remains stable.

Verification:
- Typecheck: PASS
- Tests: PASS, 2 files and 15 assertions
- Build: PASS, 31 routes generated
- Production runtime gate: PASS, `/dev/preview` returns 404 while `/tenant` returns 200
- Lint: NEEDS FIX, deprecated interactive `next lint` script

### Slice 14 - Functional tenant resident portal

Completed:
- Replaced the static tenant workspace with authenticated, organization-scoped tenancy, rent, payment, maintenance, document, notification, unit, building, and property data.
- Restored the tenant presentation guard; development preview continues to work through its selected preview identity, while non-tenant production identities remain denied.
- Made every tenant workspace action functional: rent cards open the ledger, Pay Rent opens M-Pesa/Paystack checkout, maintenance opens request history, Report Issue creates a scoped request, documents request signed URLs, notifications support individual and bulk read state, Account supports sign-out, and Contact Management exposes configured phone/email actions.
- Added responsive resident dialogs with loading, empty, success, failure, and disabled states using the shared shadcn-style UI primitives and Lucide icons.
- Replaced the shared staff shell on `/tenant` with a dedicated authenticated tenant layout, removing the sidebar and staff topbar while retaining route presentation, the development preview switcher, and skip navigation.
- Made `AuthGuard` hydration-safe by rendering a deterministic loading boundary until browser-backed authentication has mounted, preventing the server role landing and client tenant workspace from producing different initial HTML.
- Added development fixtures for management contacts and tenant notifications, including working notification read-state mutation.
- Added pure tenant-dashboard selectors so authenticated tenant binding and resource filtering remain testable outside React.

Files added:
- `apps/frontend/src/components/tenants/tenant-dashboard.ts`
- `apps/frontend/src/components/tenants/tenant-dashboard.test.ts`

Files modified:
- `apps/frontend/src/components/tenants/tenant-workspace.tsx`
- `apps/frontend/src/lib/demo/demo-data.ts`
- `apps/frontend/src/lib/demo/demo-provider.ts`
- `apps/frontend/src/types/organization.ts`
- `docs/CODEX_EXECUTION_TRACKER.md`

Tests:
- Authenticated user selects their own tenant record when multiple active tenants are returned.
- Active tenancy is preferred over pending or notice records.
- Rent balance ignores settled charges and selects the earliest payable charge.
- Tenant documents remain limited to owner, unit, or tenant-visible property records.
- Maintenance selection includes tenant-owned and unassigned same-unit work without leaking another tenant request.
- Open maintenance and unread notification counts exclude terminal/read records.

Security considerations:
- No backend authorization is bypassed; every query and mutation uses the existing tenant-safe API endpoints.
- Document access still requires a backend-issued short-lived signed URL.
- Payment success is never inferred by the UI and remains dependent on provider confirmation.
- The client selects the authenticated user's tenant record, while the backend remains authoritative for organization and resource scope.

Remaining tenant experience gaps:
- Add a landlord-facing organization contact settings editor; production contact actions currently appear only when those settings already exist.
- Add browser-level responsive and interaction coverage when the in-app browser connection is available.

### Slice 15 - Tenant maintenance photo and video evidence

Completed:
- Added mobile camera capture for photos and videos plus multi-file device selection in the tenant maintenance form.
- Added responsive image/video previews, removal controls, upload progress, client validation, and a retry state that never creates a duplicate request after a partial upload failure.
- Added authenticated multipart `POST /maintenance/:maintenanceId/evidence` with five-file limits, strict MIME allowlisting, 10 MB photo limits, and 25 MB video limits.
- Enforced maintenance ownership/resource scope through the existing RBAC + ABAC path before accepting evidence.
- Added SHA-256 hashes, controlled storage keys, audited Evidence records, and maintenance evidence-ID linkage.
- Added local filesystem storage for non-production development and an AWS Signature V4 S3 provider for production evidence storage.
- Added demo-mode evidence uploads so camera/gallery behavior can be reviewed without a backend.

Tests:
- Frontend media policy accepts supported camera formats and rejects oversized, unsupported, or excessive selections.
- Backend media policy verifies MIME, file count, and per-kind limits.
- Focused maintenance authorization and evidence contract tests remain green.

Remaining media gaps:
- Add malware scanning/quarantine before uploaded evidence is made downloadable.
- Add a Cloudinary storage implementation if Cloudinary is selected instead of S3 in production.
- Add browser/device E2E coverage for native camera capture and interrupted upload retry.

### Slice 16 - Contractor field workspace

Completed:
- Replaced the contractor role placeholder with a responsive assigned-job workspace, workload statistics, search, workflow filters, job detail dialogs, and notification controls.
- Added working quote submission, approved-job start, final-cost/completion submission, and standalone before/during/after photo or video evidence uploads.
- Added camera, video, and gallery capture with the same governed file-count, MIME, and size policy used by tenant maintenance evidence.
- Kept verification out of contractor controls so completion is handed back for independent review.
- Corrected contractor authorization to resolve the authenticated user through their organization Contractor profile instead of comparing a Contractor record ID to a User ID.
- Restricted contractor maintenance lists at the backend query boundary to the authenticated contractor profile's assigned records.
- Preserved and de-duplicated existing evidence IDs during quote and progress updates.
- Added complete demo-mode quote/progress/evidence behavior and representative contractor jobs for screen review.

Tests:
- Contractor workspace action and filtering tests cover quote, approved, active, historical, and terminal-state behavior.
- Backend scope tests cover contractor-profile assignment, direct-user assignment, rejection of another contractor, and evidence de-duplication.

Remaining contractor gaps:
- Add scheduling/appointment negotiation and contractor-to-manager job comments when those backend domains are implemented.
- Add download/view UI for previously uploaded evidence after the evidence metadata endpoint exposes job-scoped records.
- Add browser/device E2E coverage for camera capture and the quote-to-completion lifecycle.

### Slice 17 - Property manager operations workspace

Completed:
- Replaced the static manager role landing with a responsive daily operations workspace backed by scoped production APIs.
- Added portfolio health, occupancy, rent collection, outstanding balance, attention-count, property performance, contractor capacity, tenant/tenancy, security, and notification views.
- Added a unified manager queue for maintenance triage, contractor assignment, quote approval, completion verification, closure, expense approval/rejection, arrears follow-up, and tenancy activation.
- Added working security-event acknowledgement and notification read/bulk-read actions.
- Exposed the existing backend inspection workflow through typed frontend data, query hooks, creation, draft review, and controlled completion actions.
- Repaired manager navigation so Maintenance, Finance, Reports, and Inspections lead to functioning routes or sections instead of placeholder hashes.
- Added realistic manager demo records and demo transitions for maintenance, expenses, arrears, tenancies, inspections, security events, and notifications.

Tests:
- Manager queue tests cover controlled maintenance actions and exclude non-actionable states.
- Attention counts cover maintenance, finance, arrears, and pending tenancy work.
- Occupancy calculation covers populated and empty portfolios.

Security considerations:
- All manager data continues to come from backend organization/property-scoped endpoints.
- No frontend action bypasses approval thresholds, state transitions, role permissions, or resource scope.
- Completion verification remains independent from contractor completion submission.

Remaining manager gaps:
- Inspection checklist editing, meter-reading capture, and inspection evidence upload need a richer backend update/evidence contract.
- Staff roster and assignment management need dedicated frontend APIs and screens.
- Browser-level responsive and interaction coverage remains pending while the in-app browser is unavailable.

### Slice 18 - Landlord owner command center

Completed:
- Extended the existing landlord Command Center with responsive owner controls instead of replacing its portfolio intelligence and drill-downs.
- Added a unified owner approval queue for maintenance quote approval, completion verification, final closure, and submitted expense approval or rejection.
- Added working owner notifications with individual and bulk read actions.
- Surfaced subscription status, plan capacity, and direct billing management access.
- Added landlord settlement destination setup for Paystack bank accounts, M-Pesa shortcodes, and pending crypto wallets using the existing provider-backed payment architecture.
- Added a resident contact settings editor for management phone/email, emergency line, and office hours.
- Added a validated, permission-checked, audited organization settings update service; unknown settings are rejected and no credentials are accepted.
- Added complete development-mode transitions and records for every owner approval state and destination type without bypassing backend production authorization.
- Corrected the landlord tenancies shortcut so it no longer targets a missing route.

Tests:
- Landlord queue tests cover quote approval, completion verification, closure, submitted expenses, and non-actionable states.
- Organization settings schema tests cover valid resident contacts, invalid email, and rejection of unknown sensitive-looking fields.

Security considerations:
- Owner controls call existing backend-authorized mutations; frontend role presentation is never treated as authorization.
- Organization settings require `organization.settings.manage`, are organization-scoped, and produce before/after audit records.
- Paystack account numbers are not retained after provider setup; crypto remains pending until provider verification and reconciliation exist.
- Payment success still depends on verified provider callbacks and reconciliation, never a browser claim.

Remaining landlord gaps:
- Browser-level responsive and interaction coverage remains pending while the in-app browser is unavailable.
- Full accounting exports, owner distributions, and tax reporting require dedicated backend reporting contracts.

### Slice 19 - Caretaker field operations workspace

Completed:
- Replaced the caretaker placeholder with a responsive, mobile-first on-site operations workspace.
- Added a unified action queue for maintenance triage, contractor assignment, quote capture, approved work start, completion, verification, closure, inspections, and incident transitions.
- Added scoped maintenance intake with camera photo, video, and gallery evidence plus retry-safe partial upload behavior.
- Added building/unit condition summaries, resident occupancy references, active contractor contacts, security signal monitoring, personal notifications, and incident reporting.
- Added inventory registration, condition/status updates, service dates, and service-due highlighting through the existing backend inventory contracts.
- Added complete development data and mutations for caretaker incidents, inventory, maintenance, inspections, and notifications.
- Corrected backend security collection and summary scope so building- and unit-level records cannot leak through broad property membership.
- Corrected stored security-resource authorization to validate a building-level record against the assigned building instead of only its parent property.
- Normalized the security summary response to the typed frontend contract.

Tests:
- Caretaker model tests cover maintenance actions, blocked approval state, incident transitions, and attention counts.
- Security hierarchy tests cover distinct unit, building, property, and empty-assignment query clauses.
- Focused contractor scope tests remain green after shared maintenance use.

Security considerations:
- All production data continues through backend-scoped endpoints; development preview state does not authorize backend access.
- Caretakers receive no expense approval, portfolio reporting, role administration, payment destination, CCTV playback, or evidence-export controls.
- Maintenance quote thresholds and approvals remain backend policy decisions.
- Incident transitions and inventory mutations remain permission, hierarchy, and state checked on the server.

Remaining caretaker gaps:
- The repository grants `announcement.manage` but has no announcement model/API yet; publishing notices requires that audited backend domain.
- Rich inspection checklist editing and inspection evidence upload still require expanded backend contracts.
- Browser-level responsive and camera/device E2E coverage remains pending while the in-app browser is unavailable.

## Current Slice

Name: Caretaker field operations workspace

Objective: Give caretakers a complete scoped daily field surface for repairs, inspections, incidents, assets, resident occupancy, contractors, and site updates.

Files being changed: Caretaker workspace/model/tests, inventory frontend data/hooks, security query scoping, development fixtures/provider, navigation, role/API documentation, and this tracker.

Current state: Implementation complete. Frontend typecheck, 35 tests, production build, and live `/caretaker` and `/dev/preview` route checks pass. Focused backend security and contractor-scope tests pass, and the modified security module is type-clean.

## Remaining Work

1. Replace deprecated `next lint` with a checked-in ESLint CLI configuration and non-interactive script.
2. Add browser-level tests that select each role and verify its rendered workspace and sidebar.
3. Add responsive viewport tests for tenant mobile and management desktop workspaces.
4. Add seeded links for dynamic detail routes to the preview directory where stable fixture IDs exist.
5. Continue replacing demo-backed workspace data as production APIs become available.
6. Add full accounting exports, owner distributions, and tax reporting after their backend reporting contracts are defined.

## Known Issues

- `npm run lint` launches the deprecated interactive Next.js lint configurator because no ESLint configuration is checked in.
- The preview directory enumerates role homes and configured navigation routes, but not every parameterized resource detail route.
- Hash-based workspace sections share one page and are not separate route modules.
- Development preview intentionally cannot make an unauthorized backend request succeed.
- `npm install` reports one moderate and one high dependency advisory; remediation requires a separate dependency review.

## Build / Test Status

Payment slice verification (2026-09-24):
- Frontend typecheck: PASS.
- Frontend tests: PASS, 2 files and 15 tests.
- Frontend production build: PASS, 35 routes generated.
- Focused backend payment tests: PASS, 3 files and 8 tests.
- Backend typecheck/build: FAIL on existing Express 5 parameter types, Mongoose model typing, and other modules; no errors were reported for the new payment-destination model, provider types, Paystack provider, or integration service in the filtered check.
- Full backend tests: 35 files passed, 1 skipped, 5 failed; failures include two Windows module-read `EPERM` errors and three unrelated existing assertions.
- Backend lint: BLOCKED because `typescript-eslint` is referenced by `eslint.config.js` but is not installed.
- Frontend lint: BLOCKED by the repository's deprecated interactive `next lint` configuration prompt.
- Browser verification: BLOCKED because the local in-app browser connection timed out repeatedly; production rendering was still validated by `next build` and the development `/tenant` route returned HTTP 200.
- Tenant workspace live route: PASS, development `/tenant` compiled and returned HTTP 200.
- Git review: BLOCKED because this workspace is not a Git repository.

Typecheck: PASS - `npm run typecheck`

Lint: NEEDS FIX - `npm run lint` exits at the interactive deprecated Next.js configuration prompt.

Tests: PASS - `npm test`, 4 files and 24 assertions. Focused backend media/authorization/evidence tests: PASS, 3 files and 9 assertions.

Build: PASS - `npm run build`, 31 routes generated.

Contractor workspace verification (2026-09-24):
- Frontend typecheck: PASS.
- Frontend tests: PASS, 5 files and 27 tests.
- Frontend production build: PASS, 31 static pages generated and `/contractor` emitted successfully.
- Focused backend contractor scope/media tests: PASS, 2 files and 6 tests.
- Backend touched-file typecheck filter: PASS; repository-wide backend typecheck remains blocked by existing Express 5 and Mongoose errors outside this slice.
- Frontend lint: BLOCKED by the existing deprecated interactive `next lint` prompt.
- Live development route: PASS, `GET /contractor` returned HTTP 200.
- Browser responsive inspection: BLOCKED because the in-app browser was unavailable; responsive states remain source/type/build verified rather than screenshot verified.

Property manager workspace verification (2026-09-24):
- Frontend typecheck: PASS.
- Frontend tests: PASS, 6 files and 30 tests.
- Frontend production build: PASS, 31 static pages generated and `/manager` emitted successfully.
- Frontend lint: BLOCKED by the existing deprecated interactive `next lint` prompt.
- Live development route: PASS, `GET /manager` returned HTTP 200.
- Browser responsive inspection: BLOCKED because the in-app browser remained unavailable; responsive states are source/type/build verified rather than screenshot verified.
- API/DB changes: Added typed frontend access to the existing inspection API. No backend route, schema, collection, migration, or authorization change was required.

Landlord owner command center verification (2026-09-24):
- Frontend typecheck: PASS.
- Frontend tests: PASS, 7 files and 32 tests.
- Frontend production build: PASS, 31 static pages generated and `/dashboard` emitted successfully.
- Focused backend organization settings tests: PASS, 1 file and 2 tests.
- Backend touched-file typecheck filter: PASS; repository-wide backend typecheck/build remains blocked by existing Express 5, Pino, and Mongoose typing failures outside this slice.
- Frontend lint: BLOCKED by the existing deprecated interactive `next lint` prompt.
- Backend lint: BLOCKED because `typescript-eslint` is referenced by `eslint.config.js` but is not installed.
- Live development routes: PASS, `GET /dashboard` and `GET /dev/preview` returned HTTP 200.
- Browser responsive inspection: BLOCKED because the in-app browser is unavailable; responsive states are source/type/build verified rather than screenshot verified.
- API changes: `PATCH /organizations/:organizationId` now accepts validated resident contact settings and enforces `organization.settings.manage` with auditing. No database collection or migration was added.

Caretaker field workspace verification (2026-09-24):
- Frontend typecheck: PASS.
- Frontend tests: PASS, 8 files and 35 tests.
- Frontend production build: PASS, 31 static pages generated and `/caretaker` emitted successfully.
- Focused backend security and contractor-scope tests: PASS, 2 files and 5 tests.
- Backend touched-file typecheck filter: PASS; repository-wide backend typecheck/build remains blocked by existing Express 5, Pino, and Mongoose typing failures outside this slice.
- Frontend lint: BLOCKED by the existing deprecated interactive `next lint` prompt.
- Backend lint: BLOCKED because `typescript-eslint` is referenced by `eslint.config.js` but is not installed.
- Live development routes: PASS, `GET /caretaker` and `GET /dev/preview` returned HTTP 200.
- Browser responsive inspection: BLOCKED because the in-app browser is unavailable; responsive states are source/type/build verified rather than screenshot verified.
- API/DB changes: No new backend route or collection. Added typed frontend inventory access and hardened existing security queries and summary responses.

Production preview gate: PASS - production `next start` returned 404 for `/dev/preview` and 200 for `/tenant`.

## Real APIs Still Needed

- Advanced Super Admin user, role, entitlement, session, webhook, feature-flag, and support operations.
- Some role workspace secondary actions currently identify themselves as demo or integration-required.
- Dynamic preview links should be connected to stable seeded records as those APIs and fixtures mature.

## Last Safe Resume Point

The development preview slice is complete. The selected role is stored separately, updates `AuthProvider` immediately, and drives both `Sidebar` and `RoutePresentation`. Production resolves no preview role and `/dev/preview` returns 404.

## Slice 20 - Production Readiness Baseline (2026-09-24)

- Added strict production environment validation for secure cookies, unique 64+ character JWT secrets, HTTPS origins/callbacks, non-local MongoDB, live M-Pesa, Paystack, Twilio, SendGrid, S3 and CCTV gateway configuration.
- Centralized messaging, storage and CCTV environment access in the typed backend configuration.
- Connected production login and tenant-onboarding OTP delivery to the real SMS provider and replaced non-cryptographic OTP generation.
- Changed unsigned M-Pesa callbacks into reconciliation triggers; financial confirmation now requires an authenticated Daraja STK status query.
- Added the missing `/api/v1/health/ready` database readiness probe.
- Cleared the repository-wide backend TypeScript baseline, including Express 5 route parameters, Mongoose status literals, nullable resource references and decision-automation schema drift.
- Replaced interactive/broken lint setup with checked-in frontend ESLint configuration and installed the backend TypeScript ESLint runtime.
- Added root quality commands, CI, production Dockerfiles, a reference production Compose file, frontend production API URL validation and standalone Next.js output.
- Added `docs/PRODUCTION_READINESS.md` with real-provider requirements, unsupported API paths and the complete owner go-live checklist.

Current status: code can be release-gated and containerized, but live launch remains blocked until external provider accounts/infrastructure are provisioned and the explicit unsupported integrations and assurance tasks in `docs/PRODUCTION_READINESS.md` are resolved or disabled.

Final verification (2026-09-24):
- Backend typecheck: PASS.
- Frontend typecheck: PASS.
- Backend lint: PASS with 265 warnings and 0 errors; warning cleanup remains technical debt.
- Frontend lint: PASS with 24 warnings and 0 errors; React 19 migration warnings remain technical debt.
- Backend tests: PASS, 37 files passed, 1 skipped; 114 tests passed, 4 skipped.
- Frontend tests: PASS, 9 files and 40 tests.
- Backend production build: PASS, including the compiled jobs worker.
- Frontend production build: PASS on Next.js 16.3.6, 30 static pages generated.
- Static release certification: PASS, 33 route files, 154 permissions and 6 critical paths.
- Production dependency audit: PASS, 0 known vulnerabilities in both backend and frontend runtime dependencies.
- Added a separate production worker service and corrected the development worker command filename.
- Live launch remains NOT APPROVED until the owner checklist and real-provider acceptance tests in `docs/PRODUCTION_READINESS.md` are complete.

## Next Recommended Slice

Provision and validate the staging environment with real M-Pesa, Paystack, Twilio, SendGrid, S3 and CCTV gateway credentials. Keep crypto hidden until a production processor, verified webhooks and exact-amount reconciliation are implemented.

## Slice 21 - Public Advertising Experience (2026-09-26)

- Replaced the unauthenticated root redirect with a complete public Property Command Center landing experience while preserving `/login` and every authenticated workspace route.
- Added all requested narrative chapters: fragmented operations, dependency versus control, portfolio command, rent and vacancy, maintenance, approval thresholds, property passport, onboarding, roles, CCTV, surveillance audit, incidents, evidence, contractors, remote control, intelligence, action queue, health score, connected operations, tier positioning, audience and final conversion.
- Built reusable live React demonstrations for the portfolio dashboard, financial flow, maintenance state machine, property passport, role scoping, camera wall, surveillance audit, onboarding, approvals, contractor performance, vacancy, action queue and Property Health.
- Added a generated architectural hero asset, responsive navigation, accessible demo-request dialog, metadata/social previews and vendor-neutral CTA event hooks.
- Added a typed demo-request service boundary. No lead is represented as delivered until a real API/CRM adapter is connected.
- Responsive visual inspection: PASS at 375, 430, 768, 1024, 1440 and 1920 pixel widths; no horizontal overflow detected. Maintenance, CCTV and tier sections were separately rendered and reviewed.
- Interaction verification: PASS for the demo dialog and role-selector state changes.
- Frontend typecheck: PASS.
- Frontend lint: PASS with the unchanged 24 repository warnings and 0 errors; the landing files add no warnings.
- Frontend tests: PASS, 10 files and 42 tests.
- Frontend production build: PASS, 30 static pages generated.

Remaining external integration: connect `DemoRequestService` to a protected lead endpoint or CRM, connect `pmcc:marketing` events to the approved analytics provider, and replace placeholder contact details/domain metadata with the final production brand configuration.

## Slice 22 - Landlord Password Confirmation (2026-09-26)

- Added required password confirmation with accessible mismatch feedback and new-password autocomplete.
- Matching is exact (no trimming), with the backend's 12-200 character limits. Confirmation never leaves the browser.
- Signup now blocks repeated submissions while the owner bootstrap request is pending.
- Added four validation tests covering matching, mismatches, whitespace and length boundaries.
- Frontend typecheck, lint (24 existing warnings), all 46 tests and production build passed.
- API, database, role authorization and phone step-up behavior are unchanged.
- Next: provider-backed social sign-in, organization setup, guided exploration and the animated digital-twin landing redesign.

## Slice 23 - Social Owner Onboarding and Exploration (2026-09-26)

- Added Google, Facebook and Apple authorization code entry points with server-side provider identity verification, browser-bound state, provider-subject mapping and one-use pending flows.
- New owners name their organization and verify their phone before a LANDLORD session is issued. Returning linked owners verify their registered phone; existing accounts are not linked by contact fields.
- Added social choices to login and signup, the `/welcome` setup/verification screen and `/explore` guided owner tour linking workspace pages.
- Added rate-limited public auth routes, Origin checks, redacted callback logging, transaction-backed owner creation, OpenAPI entries and optional validated provider configuration.
- Remaining: provision real OAuth application credentials and exact callback URLs, test each provider end-to-end in staging with SMS and a MongoDB replica set, then review provider policies and legal consent wording before release. Unconfigured providers remain disabled.

## Slice 24 - Interactive Digital Twin Landing (2026-09-26)

- Replaced the previous editorial split hero with a full-bleed Three.js property scene based on the supplied dark technical dashboard reference.
- Modeled three apartment buildings with visible floor interiors, original helmeted stick-figure workers, residents, mover, manager with clipboard, moving truck, landscaping and camera coverage. Camera controls switch between portfolio, interior, maintenance, move-in and security views.
- Added responsive operational indicators, animated collection visualization, attention queue, scoped access map and direct signup/demo entry points. Public numbers are explicitly illustrative.
- Added WebGL fallback, resource cleanup, reduced-motion handling and a Playwright browser check for canvas rendering, camera pixel changes, interactions and overflow across 390px, 768px and 1440px viewports.
- Existing demo request service still requires a real lead API/CRM. The scene is a product illustration and does not claim live property telemetry or CCTV feeds.

## Slice 25 - Explicit Existing-Owner Social Linking (2026-09-26)

- Added a `/welcome` choice to link a provider identity to an existing owner account without creating another organization.
- Linking requires the account email and current password, active LANDLORD membership, and an OTP sent to the registered phone. Identity creation and link audit occur only after OTP verification in a MongoDB transaction; contact matching alone never links accounts.
- Added challenge, OTP-completion and contract tests for valid credentials, wrong password, inactive owner membership, invalid phone code and rejection of injected fields.
- Backend `npm run verify:production` passed: typecheck, lint (285 warnings, no errors), 124 tests passed/4 skipped, build and static release certification. Frontend `npm run verify:production` passed: typecheck, lint (24 warnings, no errors), 46 tests and production build.
- Remaining: provision Google/Facebook/Apple applications and SMS, and test the full callback, linking and sign-in flows against a staging replica set. Unconfigured provider buttons remain disabled.

## Slice 26 - Role Workspace 3D Illustrations (2026-09-26)

- Added a roof-open furnished Three.js home with animated residents to the tenant workspace, using the supplied video as a visual reference.
- Reused the existing portfolio digital twin with role-specific camera focus for landlord, property manager, caretaker and contractor workspace bands.
- Kept all operational actions and data outside the illustrative scenes; no tenant unit details, job status or security feed are inferred from the model.
- Added responsive scene framing, offscreen animation pause, reduced-motion behavior, WebGL fallback and browser canvas checks for each role plus mobile tenant view.
- Frontend `npm run verify:production` passed: typecheck, lint (24 existing warnings, no errors), 46 tests and production build. `npm run verify:workspace-scenes -- http://localhost:3102` passed for all five roles and the 390px tenant viewport with nonblank canvas pixels, visible animation, no WebGL context loss, no page errors and no horizontal overflow.
- Remaining: test on target devices and review whether the illustrations should be personalized from approved property assets in a future, separately authorized feature.

## Slice 27 - Paystack Subscription Checkout (2026-09-27)

- Switched new organization subscriptions to Paystack hosted card checkout. A new subscription stays PENDING until a signed charge with the expected reference, minor-unit amount and currency is processed. The backend keeps provider credentials and cancellation tokens private.
- Removed Stripe from new payment, webhook, integration and billing choices. Historical Stripe records remain readable; no live Stripe customers require migration.
- Limited INTERNAL subscriptions and manual invoice settlement to platform administration. Paystack invoices cannot be manually marked paid, and Paystack plan changes are blocked until a provider-coordinated migration flow exists.
- Kept separate frontend and backend environment templates because they describe distinct deployments. Supply Paystack test/live secret, callback origin and a registered webhook URL in deployment configuration.
- Remaining: validate live merchant card recurrence, supported currency, renewal event payloads, webhook delivery and cancellation on staging; implement provider-coordinated plan migration and abandoned-checkout recovery. Historical Stripe enum values remain read-only for existing records.
- Verification: backend `npm run verify:production` passed (127 tests, 4 skipped, build and static certification); frontend `npm run verify:production` passed (46 tests and build). The Mongo-backed E2E suite could not start: mongodb-memory-server began downloading a 781 MB MongoDB binary and exceeded its setup timeout. Run it again after provisioning or caching the binary.

## Slice 28 - Paystack Billing Lifecycle Staging Preparation (2026-09-27)

- Added pending-checkout reconciliation and abandoned/failed checkout retry on the same dedicated Paystack plan, preserving prior references for late-charge review. Paid status still requires provider verification and exact amount/currency match.
- Added provider-coordinated, at-period-end plan changes. Current entitlements remain unchanged until a matching paid renewal event; in-use Paystack catalog pricing is locked against unilateral edits.
- Resolved subscription codes and private cancellation tokens from Paystack when webhook payloads contain numeric customer/plan IDs. Added cancellation, checkout recovery and renewal contract coverage plus a live staging acceptance checklist.
- Remaining: execute the checklist with a configured Paystack test merchant, public HTTPS webhook, real checkout and renewal; investigate duplicate/late charges and settlement, and run Mongo-backed E2E after the test binary is provisioned. This slice is not live-merchant certified.
- Verification: root typecheck, lint and build passed; backend suite had 129 passing tests plus one transient Windows `EPERM` import failure, and that isolated file passed all 5 tests on rerun. Frontend tests passed (46). Mongo-backed E2E and live Paystack staging remain unexecuted here.

## Slice 29 - Cinematic Demo And Content Studio (2026-09-28)

- Added isolated Acacia portfolio content, a typed 24-scene signature story, 12 reusable scenario cuts, 20 short-form campaign hooks, and deterministic playback/capture configuration.
- Added `/demo/live`, `/demo/explore`, and `/demo/studio`, plus a shared-stage teaser on the public landing page. The routes contain no production mutation path and clearly identify all portfolio/CCTV content as simulated.
- Added presenter shortcuts, 16-minute live timeline, self-guided scenario selection, four aspect ratios, duration and speed controls, captions, safe-area overlay, clean capture, visual styles, device silhouette, loop, and deterministic capture URLs.
- Added arithmetic, manifest, role-scope, playback, ratio, and query tests plus Playwright screenshots across desktop, phone, vertical Studio, and clean landscape capture. See `docs/CINEMATIC_DEMO.md` for remaining editorial and export work.
- Verification: root typecheck, lint, tests and build passed (backend 134 tests passed/6 skipped; frontend 55 passed). The final frontend `verify:production` passed with 24 existing lint warnings and no errors. `verify:cinematic-demo` passed across six viewport/format combinations with exact aspect ratios and no runtime errors, horizontal overflow, or `/api/v1` mutation requests.

## Slice 30 - Corporate Landing Themes (2026-09-28)

- Added a persistent light/dark toggle to the public navigation using the existing application theme provider.
- Retained the full-bleed property scene as a dark visual anchor while giving the public overview, operational panels, role map, demo teaser, conversion band and footer coordinated light and dark treatments. Updated chart colors to follow the active theme.
- Browser verification covers both themes at mobile, tablet and desktop widths, including canvas rendering, scene controls, demo dialog, theme persistence and horizontal overflow. All six combinations passed.
- No API, database, RBAC or production integration behavior changed. Remaining public-site work: provision the lead API/CRM and approved analytics adapter, then validate the final brand/contact metadata.

## Slice 31 - Architectural Landing Refinement (2026-09-28)

- Reworked the public landing palette around warm mineral surfaces, graphite control-room panels, restrained bronze, mineral green and slate data accents. Both themes now use the same semantic landing tokens without affecting authenticated workspaces.
- Refined the full-bleed 3D hero, editorial display typography, product-panel hierarchy, cinematic demo band, mobile spacing, and translucent navigation that remains available while scrolling. Motion and theme transitions respect reduced-motion preferences.
- Extended landing browser checks for the new light/dark section colors and fixed scrolled navigation. No API, database, RBAC, payment, or production integration behavior changed.
- Remaining: provision the marketing lead API/CRM and approved analytics adapter; confirm production brand/contact metadata and review the final copy and visuals with portfolio owners.

## Slice 32 - Executive Demo Rebuild (2026-09-28)

- Replaced the former demo scene renderer, presentation shell and CSS system. Added `/demo` as an Acacia portfolio entrance, with editorial scenario rows and live/studio entry points.
- The shared stage now composes executive portfolio, decision desk, rent flow, vacancy plan, maintenance evidence and approval, property passport, scoped role previews, Fort Knox, surveillance audit, intelligence, health and closing scenes. The existing fictional data and deterministic timeline remain the single source of demo figures and playback.
- Studio uses a narrow capture rail and exact 9:16, 16:9, 1:1 and 4:5 canvases; vertical scenes focus on one idea. Live presenter controls are hidden until opened; clean view, theme selection, seek, speed, loop, captions and keyboard controls remain available.
- Demo UI never calls payment, approval, CCTV or other production mutation APIs. Simulated decisions are explicitly marked as such. Remaining: editorial review, licensed audio/brand assets, and an optional automated recording/export pipeline.
- Verification: root typecheck, lint, tests and build passed (backend 134 passed/6 skipped; frontend 55 passed). Browser QA passed across light/dark 375, 430, 1024, 1440 and 1920px viewports; four Studio ratios, scenario navigation, scoped role changes, simulated approval, theme switch, clean mode, demo home and no production mutation requests also passed. Existing lint warnings remain outside this slice.

## Super Admin launch readiness (2026-10-01)

Continued the existing platform-control module after reconstructing the repository. No application restart, parallel admin module or live provider operation.

Implemented a bounded 12-item catalog covering business registration, payment/messaging/storage/security providers and database/security/deployment acceptance. The dashboard records onboarding/approval, manual staging review, owner, target date, next action, blocker/severity and verification summary. Configuration checks return presence status only; credentials are not copied into review records or responses. Common credential-shaped text is rejected and audit excludes free-text notes. This is not a general secret scanner.

Server-side platform administration guards reads/writes; organization roles (including a membership named SUPER_ADMIN without platform-admin status) cannot access them. Records use LAUNCH_READINESS_ENV, defaulting to NODE_ENV; explicit staging scope separates staging reviews even with production runtime mode. Coolify passes the selected review scope to API/worker.

Review mutations enforce expectedRevision, valid staging applicability and owner/verification requirements. Review and audit share a transaction. Writes fail closed if the full unique environment/key index is absent. The additive readiness:create-index command initializes that prerequisite without dropping indexes. No production index command was executed.

Readiness does not enable services, call providers or certify a release. Optional services are labelled and included in item counts. Existing production provider validation and the process/database health probes remain separate.

Verification: full configured suite passed 224 backend tests and 63 frontend tests, with 40 opt-in database tests skipped. Subsequent readiness prerequisite/environment tests passed (19 unit tests), and new authenticated HTTP security tests passed (9 tests). Frontend rendering/loading/error/access/write-projection tests passed (4). Root typecheck and full lint passed; focused lint passed with only the pre-existing env console warning. Static release certification returned CERTIFIED_STATIC. A production build succeeded before the index/environment follow-up; final build verification is recorded below.

Limitations: no usable Windows MongoDB binary was available, so the added real replica-set commit/rollback/stale-review tests remain unexecuted. No browser interaction, live provider acceptance, Docker image build, deployment, Git commit or GitHub push was performed in this slice. Earlier switch/CCTV repair changes and .continue/ were preserved.

Added:
- apps/backend/src/database/models/LaunchReadiness.ts
- apps/backend/src/modules/platform-control/launch-readiness.{catalog,schemas,service}.ts
- apps/backend/scripts/create-readiness-index.ts
- apps/backend/tests/unit/launch-readiness.test.ts
- apps/backend/tests/security/launch-readiness.api.test.ts
- apps/frontend/src/components/launch-readiness.tsx
- apps/frontend/src/lib/data/launch-readiness.ts and launch-readiness.test.ts

Modified for this slice:
- apps/backend/.env.example, package.json, src/config/env.ts
- apps/backend/src/modules/platform-control/platform-control.controller.ts and platform-control.routes.ts
- apps/backend/src/core/api/openapi.ts
- apps/backend/tests/e2e/finance.transaction.e2e.test.ts (preserved preceding switch regressions)
- apps/frontend/src/app/(dashboard)/platform/page.tsx
- apps/frontend/src/hooks/queries/use-platform-queries.ts
- apps/frontend/src/lib/data/platform.ts and query-keys.ts
- docker-compose.coolify.yml
- docs/API_SPECIFICATION.md, FEATURES.md, PRODUCTION_READINESS.md and this tracker

Final verification: root production build passed for backend/frontend with NEXT_PUBLIC_API_URL=/api/v1 supplied to the verification process. The preceding rerun without that variable correctly failed the existing frontend production configuration guard. No deployment setting was changed. Final focused HTTP-test lint and git diff --check passed. The added database index command and replica-set acceptance still require execution against a suitable target database before review writes can be certified.


## GitHub checkpoint verification (2026-10-02)

Prepared the requested existing laptop work for publication: Super Admin monitoring, launch readiness, service-switch audit atomicity, independent CCTV/NVR gates, regression tests and documentation. The unrelated .continue directory is excluded. Added environment-isolated frontend API configuration tests so a CI-supplied NEXT_PUBLIC_API_URL cannot invalidate the missing-configuration assertion; production resolver behavior is unchanged.

Verification on the laptop passed root typecheck, lint (existing warnings, no errors), tests (268 backend passed / 44 opt-in skipped; 67 frontend passed), both builds and static certification (35 route files, 154 permissions, 6 critical paths). The same requested source changes passed all 44 isolated MongoDB replica-set E2E regressions in Linux. The temporary test harness disabled MongoDB Unix sockets because this execution environment restricts them; database transactions and assertions were unchanged. That harness is not included in the commit.

Reviewed the requested diff and scanned the changed files for common credential patterns; the only match was a private-key header string in a rejection test, with no key material. No non-example environment file is included. Documented the monitoring API, records, index prerequisites, worker collection and known source limitations. This checkpoint does not approve live payments/CCTV or execute production indexes, provider calls or deployment.


## 2026-10-02 — Versioned landlord contracts and prepaid activation

Continued the existing main codebase after checkpoint 8d2fe84; no parallel organization, invoice, billing or evidence system was introduced. Added versioned templates, organization-specific commercial snapshots, typed electronic signature evidence, retained PDFs, explicit pre-payment replacements, server-calculated portfolio pricing, backend-verified activation and deferred Paystack renewal. New organization signup starts durable onboarding. Existing legacy subscriptions remain intact. The landlord screen restores backend progress; Super Admin has template/oversight controls and monitoring includes durable agreement and activation state records.

The existing prepaid request's plan/amount conflict was corrected for contract-based onboarding by omitting plan from the upfront checkout and scheduling the separate recurring subscription at paid-term expiry. Payment, receipt, activation, event and audit are atomic. Template/signature/invoice history cannot be rewritten through normal workflows. Provider-reference partial indexes fix concurrent unpaid-organization collisions.

Release/operator details and limitations: [LANDLORD_CONTRACT_WORKFLOW.md](LANDLORD_CONTRACT_WORKFLOW.md). Production requires the reviewed index migration, approved template publication and real provider staging acceptance. Paid amendments and uncertain provider submissions require explicit settlement/support review. Automated provider fixtures are not live financial or legal certification.

Certification on the final source snapshot: root typecheck, lint, tests and production build passed; backend static release audit passed (36 route files, 154 permissions). Backend unit/security tests: 281 passed, 59 opt-in tests skipped in the default command. All 59 opt-in replica-set tests passed when explicitly run, including 15 new landlord tests. Frontend: 78 tests passed. Lint: zero errors, 366 backend and 25 frontend warnings; existing warning debt remains. Contract, signed contract, invoice and receipt samples were rendered and visually inspected; retained hashes and KES 33,000 initial totals agree for the 55-unit Control fixture. Providers in automated tests are fixtures; production indexes, legal approval, live provider acceptance and deployed browser rehearsal were not performed.

Release file manifest (24 added, 35 modified):

Added:

- `apps/backend/assets/fonts/DejaVuSans.ttf`
- `apps/backend/assets/fonts/LICENSE-DejaVu.txt`
- `apps/backend/scripts/migrate-contract-indexes.ts`
- `apps/backend/src/database/models/ContractTemplate.ts`
- `apps/backend/src/database/models/OrganizationContract.ts`
- `apps/backend/src/modules/billing/prepaid-billing.service.ts`
- `apps/backend/src/modules/documents/generated-document.service.ts`
- `apps/backend/src/modules/onboarding/contract-default.ts`
- `apps/backend/src/modules/onboarding/contract-indexes.ts`
- `apps/backend/src/modules/onboarding/contract-snapshot.ts`
- `apps/backend/src/modules/onboarding/contract-template.service.ts`
- `apps/backend/src/modules/onboarding/landlord-onboarding.controller.ts`
- `apps/backend/src/modules/onboarding/landlord-onboarding.openapi.ts`
- `apps/backend/src/modules/onboarding/landlord-onboarding.routes.ts`
- `apps/backend/src/modules/onboarding/landlord-onboarding.schemas.ts`
- `apps/backend/src/modules/onboarding/landlord-onboarding.service.ts`
- `apps/backend/tests/e2e/landlord-onboarding.e2e.test.ts`
- `apps/backend/tests/unit/contract-snapshot.test.ts`
- `apps/frontend/src/components/landlord-oversight.tsx`
- `apps/frontend/src/hooks/queries/use-landlord-onboarding.ts`
- `apps/frontend/src/lib/data/landlord-onboarding-ui.test.ts`
- `apps/frontend/src/lib/data/landlord-onboarding.test.ts`
- `apps/frontend/src/lib/data/landlord-onboarding.ts`
- `docs/LANDLORD_CONTRACT_WORKFLOW.md`

Modified:

- `.github/workflows/quality.yml`
- `README.md`
- `apps/backend/Dockerfile`
- `apps/backend/package-lock.json`
- `apps/backend/package.json`
- `apps/backend/scripts/run-e2e.mjs`
- `apps/backend/src/core/api/openapi.ts`
- `apps/backend/src/core/billing/billing-provider.test.ts`
- `apps/backend/src/core/billing/billing-provider.ts`
- `apps/backend/src/database/models/Document.ts`
- `apps/backend/src/database/models/Organization.ts`
- `apps/backend/src/database/models/OrganizationSubscription.ts`
- `apps/backend/src/database/models/SubscriptionInvoice.ts`
- `apps/backend/src/modules/auth/auth.service.ts`
- `apps/backend/src/modules/auth/social.service.ts`
- `apps/backend/src/modules/billing/billing.service.ts`
- `apps/backend/src/modules/documents/document.controller.ts`
- `apps/backend/src/modules/documents/document.routes.ts`
- `apps/backend/src/modules/documents/document.service.ts`
- `apps/backend/src/modules/integrations/integration.service.ts`
- `apps/backend/src/modules/organizations/organization.service.ts`
- `apps/backend/src/modules/platform-control/platform-monitoring.snapshot.ts`
- `apps/backend/src/routes/index.ts`
- `apps/frontend/src/app/(dashboard)/platform/page.tsx`
- `apps/frontend/src/app/onboarding/page.tsx`
- `apps/frontend/src/lib/api.ts`
- `docs/API_SPECIFICATION.md`
- `docs/ARCHITECTURE.md`
- `docs/CODEX_EXECUTION_TRACKER.md`
- `docs/DATABASE_DESIGN.md`
- `docs/FEATURES.md`
- `docs/PRODUCTION_READINESS.md`
- `docs/ROLES_PERMISSIONS.md`
- `docs/SECURITY.md`
- `docs/TESTING_STRATEGY.md`

## 2026-10-02 — SUPER_ADMIN Business Intelligence and Platform Morning Brief

Audited and pulled existing main at b932baf; existing Quality jobs were green and no tracked laptop changes existed. Extended the existing control plane with authoritative Control/Fort Knox analytics, immutable audited brief snapshots, prospective atomic subscription movements, exact payment cohorts, safe drill-downs and isolated demo fixtures. Full file manifest, metric definitions, deployment implications and limitations: [SUPER_ADMIN business intelligence](SUPER_ADMIN_BUSINESS_INTELLIGENCE.md). Certification results will be recorded below before commit. Pre-existing laptop `.continue/` remains excluded.

### Certification — 2026-10-02

- Backend typecheck and frontend typecheck: pass.
- Lint: pass, zero errors; 366 existing backend warnings and 25 existing frontend warnings. New implementation/tests introduce no lint warnings.
- Backend default suites: 306 passed (63 files); the four opt-in E2E files are run separately, rather than treated as certified skips.
- Backend Mongo/HTTP/finance/onboarding/platform E2E: 79 passed (4 files), including 20 new platform tests.
- Frontend: 94 passed (21 files), including 16 new API/rendering tests.
- Real browser: one complete SUPER_ADMIN password/OTP journey passed; plan filtering, retained brief, critical action, organization drill-down, no uncaught runtime errors, desktop/mobile screenshots and mobile width assertion.
- Total: 480 passed executions (385 backend + 94 frontend + 1 browser). Added: 62 tests/journeys (13 backend unit, 12 backend authorization/schema, 20 backend E2E, 16 frontend, 1 browser). No existing tests removed, skipped anew or weakened.
- Backend and frontend production builds: pass using documented build settings; static release: CERTIFIED_STATIC, 36 route files, 154 permissions, 6 critical paths.
- Authorization: all five endpoints deny anonymous users; landlord, property manager, caretaker, contractor, tenant and an organization-only SUPER_ADMIN are denied before aggregation. Existing cross-organization landlord onboarding access remains denied. Dataset separation, safe financial/security projections, immutable snapshots, idempotency and audit rollback pass.
- Reviewed manifest: 22 added + 23 modified files. No new dependencies, production environment variables, secrets, generated artifacts or unrelated `.continue/` files. Deployment configuration is unchanged; additive reporting indexes are documented.

Laptop certification: all typecheck/lint/test/build/static gates passed again. The same isolated browser journey also passed on Windows using the installed MongoDB test binary and Chrome. Browser diagnostic paths use the OS temporary directory; production application behavior is unchanged.

## 2026-10-02 — SUPER_ADMIN dual-channel authentication

Continued the existing laptop checkout on main at 2039e51, linked to the existing GitHub remote. Audited auth, provisioning, OTP, sessions, providers/service switches, notification jobs, authorization and audit. Extended those authorities with password/email/SMS proof, temporary AdminAuthFlow, atomic privilege issuance, server session binding/expiry/revocation, protected future promotion, audited host enrollment/recovery, normal-login MFA and native step-up UI. No working ordinary-role system was replaced. Full design/configuration/index/recovery notes: [SUPER_ADMIN_AUTHENTICATION.md](SUPER_ADMIN_AUTHENTICATION.md). Final certification and file manifest follow after gate review; .continue/ remains excluded.


### Certification and reviewed file manifest

- Backend typecheck, frontend typecheck and strict operator-script typecheck: pass.
- Backend lint: zero errors, 364 existing warnings; frontend lint: zero errors, 25 existing warnings. New files introduce no lint warnings.
- Backend default suites: 312 passed in 64 files. The 128 opt-in cases are executed separately in the full E2E command, rather than counted as certified skips.
- Backend Mongo replica-set/HTTP E2E: 128 passed in five files, including 49 new administrator authentication cases.
- Frontend: 110 passed in 23 files, including 16 new MFA rendering and storage cases.
- Real Chrome browser: one complete password/email OTP/SMS OTP/dashboard/logout journey passed, including password-only and email-only direct-navigation denial, memory-only privileged token checks, Control/Fort Knox comparison, Morning Brief, priority action and organization drill-down, desktop/mobile and no uncaught runtime errors.
- Total: 551 passing executions (440 backend, 110 frontend, one browser). Added 71 test cases: six backend primitive tests, 49 backend E2E cases and 16 frontend cases. The existing browser journey was extended. Existing domain assertions were preserved; only valid administrator assurance fixtures changed.
- Backend/frontend production builds: pass. Static release: CERTIFIED_STATIC, 36 route files, 154 permissions and six critical paths.
- Anonymous, all five ordinary roles, organization-only SUPER_ADMIN and partially authenticated administrator platform access are denied. Existing cross-organization tests pass; session ownership, OTP replay, refresh replay, expiry, lockout, audit rollback and provider failure checks pass.
- Secret-pattern scan, explicit file review and whitespace review passed. No non-example environment files, dependencies, generated artifacts, personal credentials or unrelated .continue/ files are included. Generated Next.js type-file changes from verification were restored.
- No live provider acceptance, production migration, account enrollment, second administrator, Coolify deployment or payment certification was performed. Existing-account secure enrollment, reviewed indexes, provider/service-switch configuration and worker delivery acceptance remain operator prerequisites.

Reviewed release manifest: 15 added and 43 modified files.

Added:

- `apps/backend/scripts/create-admin-auth-indexes.ts`
- `apps/backend/scripts/enroll-admin-mfa.ts`
- `apps/backend/scripts/recover-admin-channels.ts`
- `apps/backend/src/database/models/AdminAuthFlow.ts`
- `apps/backend/src/modules/auth/admin-auth.controller.ts`
- `apps/backend/src/modules/auth/admin-mfa.service.ts`
- `apps/backend/src/modules/auth/admin-security.ts`
- `apps/backend/tests/e2e/admin-auth.e2e.test.ts`
- `apps/backend/tests/helpers/admin-assurance.ts`
- `apps/backend/tests/unit/admin-security.test.ts`
- `apps/frontend/src/components/auth/admin-mfa-panel.tsx`
- `apps/frontend/src/components/auth/admin-step-up.tsx`
- `apps/frontend/src/lib/auth/admin-mfa-ui.test.ts`
- `apps/frontend/src/lib/auth/auth-storage.test.ts`
- `docs/SUPER_ADMIN_AUTHENTICATION.md`

Modified:

- `README.md`
- `apps/backend/.env.example`
- `apps/backend/package.json`
- `apps/backend/scripts/run-e2e.mjs`
- `apps/backend/scripts/serve-platform-business-test.ts`
- `apps/backend/src/app.ts`
- `apps/backend/src/config/env.ts`
- `apps/backend/src/core/api/openapi.ts`
- `apps/backend/src/core/logging/logger.ts`
- `apps/backend/src/core/types/auth.ts`
- `apps/backend/src/database/models/Notification.ts`
- `apps/backend/src/database/models/OtpChallenge.ts`
- `apps/backend/src/database/models/RefreshSession.ts`
- `apps/backend/src/database/models/User.ts`
- `apps/backend/src/database/seeds/super-admin.seed.ts`
- `apps/backend/src/middleware/auth.middleware.ts`
- `apps/backend/src/middleware/error.middleware.ts`
- `apps/backend/src/modules/auth/auth.controller.ts`
- `apps/backend/src/modules/auth/auth.service.ts`
- `apps/backend/src/modules/notifications/notification.service.ts`
- `apps/backend/src/modules/users/user.service.ts`
- `apps/backend/src/routes/auth.routes.ts`
- `apps/backend/tests/e2e/landlord-onboarding.e2e.test.ts`
- `apps/backend/tests/e2e/platform-business.e2e.test.ts`
- `apps/backend/tests/security/launch-readiness.api.test.ts`
- `apps/backend/tests/security/platform-business.api.test.ts`
- `apps/backend/tests/security/platform-monitoring.api.test.ts`
- `apps/frontend/scripts/verify-platform-business.mjs`
- `apps/frontend/src/app/login/page.tsx`
- `apps/frontend/src/context/auth-context.tsx`
- `apps/frontend/src/lib/api.ts`
- `apps/frontend/src/lib/auth/auth-api.ts`
- `apps/frontend/src/lib/auth/auth-storage.ts`
- `apps/frontend/src/types/auth.ts`
- `docs/API_SPECIFICATION.md`
- `docs/ARCHITECTURE.md`
- `docs/CODEX_EXECUTION_TRACKER.md`
- `docs/DATABASE_DESIGN.md`
- `docs/FEATURES.md`
- `docs/PRODUCTION_READINESS.md`
- `docs/ROLES_PERMISSIONS.md`
- `docs/SECURITY.md`
- `docs/TESTING_STRATEGY.md`


## Pain-first sales demonstration and guided pilot (2026-10-02)

2026-10-02: Audited clean existing main at cfb82a6 before changes; added isolated sales-conversion engine, actual-activity guided pilot, validated bulk import and sales intelligence. Existing public demo, SUPER_ADMIN MFA, landlord agreement/prepaid activation preserved. Gates and final inventory are recorded in SALES_DEMO_RELEASE_REPORT.md.

2026-10-02: Fixed local Plan Performance `revenue.map` crash caused by unsupported platform business requests reaching the development preview provider's generic `{}` fallback. These routes now use authenticated backend data; simulated administrator access receives explicit guidance. Runtime response validation and cached-data guards protect overview and brief views without inventing totals. Added routing, response/render regression tests and browser malformed-response recovery coverage. Existing authentication and supported landlord previews remain in use.

Validation: 41 focused tests passed; full frontend suite 26 files / 146 tests passed; frontend lint 0 errors / 27 existing warnings; backend and frontend typechecks passed; backend and frontend production builds passed. Real SUPER_ADMIN browser E2E passed with local demo interception both disabled and enabled, including malformed-response recovery, MFA, brief generation, drill-down and mobile width. Static release certification passed (36 route files, 155 permissions, 10 critical paths). No backend source, database/model/index, production API contract or production environment configuration changed. Full diff and whitespace reviewed; generated Next declarations and browser artifacts excluded.


## SUPER_ADMIN sidebar recovery on the existing laptop checkout (2026-10-03)

Located the authorized Windows checkout through Remote Desktop Commander and fast-forwarded existing main from cfb82a6 to fceafae; prior fixes had not reached the laptop. Preserved local editor configuration and generated declarations. Confirmed both local preview flags were enabled. Extended the authenticated backend boundary to all platform-control/sales/diagnostic routes and every real SUPER_ADMIN request. Removed the generic unsupported platform `{}` payload. Added explicit preview connection guidance before privileged queries, corrected fourteen dead/ambiguous sidebar destinations to existing control-plane tabs, added query-aware active navigation and render validation for monitoring, controls and readiness. No database, backend authorization, production integration, commercial control or production API changes. Existing landlord/organization previews remain supported. Added regression coverage for shared routing, preview token suppression, sidebar destinations, malformed cached data and complete browser sidebar navigation.

Laptop quality results: backend and frontend typechecks PASS; full frontend suite 28 files / 188 tests PASS; frontend lint PASS (0 errors, 27 existing warnings); root backend/frontend production build PASS; static release certification CERTIFIED_STATIC (36 route files, 155 permissions, 10 critical paths); Git whitespace review PASS. Backend source and API contracts are unchanged, so backend unit/HTTP suites were not repeated for this frontend-only repair. Real SUPER_ADMIN browser E2E passed on Windows with local demo interception enabled (165.45 seconds) and disabled (151.22 seconds): password/email OTP/SMS OTP, partial-flow denial, every actual sidebar destination, three malformed control-plane responses followed by successful Retry recovery, plan/brief/drill-down, mobile width, privileged-token storage denial and logout. The enabled journey additionally visited every development-preview sidebar destination, verified explicit authenticated-session guidance on platform/sales pages, no platform-control requests and mobile fit. Both journeys had zero uncaught browser errors. Initial browser attempts exposed harness hydration timing and expected sales-preview access notices; assertions were corrected to wait for and verify those states, with security and no-error checks retained.

Added files:
- `apps/frontend/src/components/platform-preview-notice.tsx`
- `apps/frontend/src/lib/data/platform-control-shapes.ts`
- `apps/frontend/src/lib/data/platform-control-ui.test.ts`
- `apps/frontend/src/lib/super-admin-navigation.test.ts`

Modified files:
- `apps/frontend/scripts/verify-platform-business.mjs`
- `apps/frontend/src/app/(dashboard)/platform/page.tsx`
- `apps/frontend/src/components/launch-readiness.tsx`
- `apps/frontend/src/components/platform-controls.tsx`
- `apps/frontend/src/components/platform-monitoring.tsx`
- `apps/frontend/src/components/sidebar.tsx`
- `apps/frontend/src/lib/api-platform-business.test.ts`
- `apps/frontend/src/lib/api.ts`
- `apps/frontend/src/lib/demo/demo-config.ts`
- `apps/frontend/src/lib/demo/demo-platform-business.test.ts`
- `apps/frontend/src/lib/demo/demo-provider.ts`
- `apps/frontend/src/lib/navigation.ts`
- `docs/CODEX_EXECUTION_TRACKER.md`
- `docs/SUPER_ADMIN_BUSINESS_INTELLIGENCE.md`

Scope: no new dependencies, environment variables, database/model/index changes or backend API changes. Real platform access continues through existing backend authorization and dual-channel MFA. Dedicated raw webhook-history and session-administration views are not introduced; those sidebar labels lead to existing integration-health/security capability. Production provider certification, full load testing and independent penetration testing are outside this frontend repair.

Final root backend/frontend production build passed again against the final source (112.33 seconds), with development demo/bypass flags disabled in the build process and an HTTPS example API URL. Local `.env.local` was not edited. Full staged manifest/whitespace and changed-file secret-pattern reviews passed; only the eighteen listed files are included. Existing `.continue/` editor files and generated Next declarations are excluded. The pushed commit hash and exact post-push laptop Git status are supplied in the delivery message.


## Dapinni identity and remote ownership narrative (2026-10-03)

Audited branding on the existing laptop main at 8486747 before editing. Dapinni is now the primary product identity, with Your Property Command Center as the supporting descriptor and Your properties. Your decisions. Wherever you are. as the ownership promise. Reused existing visual tokens, layouts, themes, authentication, navigation, demos, integrations and commercial document retention. Added small per-app identity configurations and a D application icon; updated public/authentication/workspace/demo branding, metadata, newly issued verification messages, provider display descriptions and future PDF headers. Render version 2 identifies new branded artifacts while retained historical evidence stays immutable. Existing plan capabilities, routes, identifiers, authorization, commercial terms, database schemas and configuration are unchanged. Full file inventory and validation are recorded in BRANDING.md.

Validation: backend/frontend typecheck, lint (0 errors; 432/27 existing warnings), unit suites (348 backend / 188 frontend), production builds, static release certification and six responsive landing browser cases passed. Public/authentication/demo/icon routes return 200 with Dapinni identity. Latest standard backend E2E passed 138/141; three existing long-flow cases exceeded their unchanged five-second deadlines. Isolated administrator retries did not establish a green gate. Assertions, deadlines and production security were not relaxed. Commit/push are withheld under the all-gates-pass instruction; exact results and limitations are recorded in BRANDING.md.

Production cinematic verification rendered ten theme/viewport cases, four studio ratios and four home layouts without overflow/errors; role scope, theme, clean view and simulated approval passed. The unmodified verifier exited 1 because it classifies the existing anonymous authentication-refresh POST as a mutation. No operational writes were recorded, and that assertion was not removed. Production scenario query initialization passed; the development probe did not. Publication remains withheld, with details and exact Git status in BRANDING.md.

## Dapinni sales-engine continuation completed (2026-10-03)

Resumed the existing main at 8486747 and preserved all 39 staged branding files. Reused the
committed sales/pilot architecture. Completed primary Dapinni identity; added the computed
pilotPrepared commercial DTO/copy/CTA; isolated development browser caches; extended the real
sales browser journey through owner phone proof, insight/staff/repair/100% readiness and
commercial handoff; fixed the anonymous visitor verification fixture and the execution
budgets of three multi-system E2Es without changing assertions or production security.

Final quality: backend/frontend typecheck and builds PASS; lint 0 errors (432/27 existing
warnings); backend 65 files/348 tests and frontend 29 files/194 tests PASS; backend E2E
6 files/141 tests PASS; CERTIFIED_STATIC 36 routes/155 permissions/10 critical paths.
Sales browser, all SUPER_ADMIN sidebar/analytics recovery checks with interception off/on,
18 production cinematic layouts and six production landing layouts PASS. No operational API
writes/errors/overflow in public verification. Full results, requirements, files, safety,
limitations and acceptance answers are in DAPINNI_SALES_COMPLETION.md.
Earlier branding-withheld notes are historical and superseded by this completed continuation.
No schema/index/provider/dependency or production environment changes in this continuation.
The user's three .continue/rules files remain untracked and untouched.

## 2026-10-03 — Landing desktop overlap and action obstruction

Continued the existing laptop checkout on main from 85dd022, preserving editor
rules and unrelated generated state. Reproduced desktop dashboard values wider
than their metric cells and scene controls covering hero actions at 1920x650;
390x844 was unaffected. Metrics/header/health now size against their containers.
Hero copy/readout use normal grid flow; the opaque scene strip occupies its own
row, so content can grow without covering actions. Pointer gestures still reach
the 3D canvas through non-interactive copy. Existing scene/dialog/theme flows remain.

Added scripts/landing-layout-checks.mjs; modified landing-page.tsx,
digital-twin.css, demo.module.css, verify-landing.mjs, verify-cinematic-demo.mjs,
TESTING_STRATEGY.md and this tracker. No API, database, dependency or environment
file changes. Original signed documents and authenticated sales workflows untouched.

Frontend typecheck/lint (0 errors, 27 existing warnings), 29 files/194 tests and
optimized production build passed. Final cinematic gate passed all 18 layouts,
role/theme/clean-view/simulated-approval checks, plus ten dashboard text-fit cases
and square studio finance values. Final landing gate passed all 12 light/dark
viewport cases, including 1366x600, 1920x650 and 1920x1080, full action hit tests,
canvas pointer reachability, scene/dialog/navigation/theme behavior, no overflow,
no runtime errors and zero unexpected API attempts. Combined browser command
exited 0 in 219.37s. New finance assertions explicitly advance beyond its opening
and await rendered content; original assertions and security fixtures retained.

Diff/whitespace and staged secret/path review precede the release commit. The
user's dev server and .continue/rules files are preserved. Commit/push verification
and exact final status are recorded in the delivery message.
