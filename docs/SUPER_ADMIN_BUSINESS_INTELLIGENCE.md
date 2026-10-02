# SUPER_ADMIN business intelligence and platform Morning Brief

## Audit before implementation

Baseline: main at b932baf, with both Quality jobs successful. The platform page already contains organization, billing, access, operations, security, service-switch, launch-readiness, monitoring and landlord-contract oversight tabs. Monitoring persists heartbeats, signals, alerts and operator history. OrganizationSubscription, SubscriptionInvoice, BillingEvent and signed webhook/reconciliation services are the billing authority. Organization.onboarding and immutable OrganizationContract provide activation/signature evidence. Property, Building and Unit are the actual portfolio registry. SecurityCamera stores registry status and optional observation timestamps; no durable gateway probe history exists. Incident, Evidence, Job, WebhookEvent, IntegrationAttempt, Notification and AuditLog provide operational sources. React Query, typed API clients, semantic UI components and Recharts already exist.

No implemented platform Morning Brief or landlord Morning Brief was found. The landlord Command Center already aggregates property operations and has action rules; it remains organization/property scoped. Scheduled plan changes have selected audits, but complete applied upgrade/downgrade/status history was not reliable. No historical platform MRR series existed. Existing frontend demo data is isolated preview content, not an authoritative billing seed.

The change extends the existing control plane and billing records; it does not add a second organization, invoice, payment, subscription or monitoring system.

## Architecture and boundaries

`/platform` now lands on Plan Performance and includes Platform Morning Brief. The existing control plane, organization/billing/onboarding/security screens, React Query cache, API client, UI primitives and Recharts are reused. The landlord Command Center is unchanged. Platform-wide reads require the authenticated user's `isPlatformAdmin` flag; an organization membership claiming SUPER_ADMIN is insufficient.

`PlatformBusinessRepository` functions perform bounded MongoDB aggregation over the existing authorities. `PlatformBusinessService.collect` produces the reusable, versioned operating-period payload; the HTTP facade audits reads. Brief generation retains that payload, five deterministic summaries and the ordered action queue in `PlatformBrief`. A database transaction commits the snapshot and audit together. Environment/dataset/idempotency-key uniqueness prevents duplicate snapshots; reusing a key with different filters returns 409. Historical reads verify SHA-256 and never recompute prices, states or priorities. Normal save/update/replace/delete workflows reject snapshot mutation. There is no outbound delivery or new queue infrastructure. A future scheduled Job handler, notification renderer or email renderer can consume the same service/snapshot without rewriting aggregation.

## Metric definitions

All financial aggregation uses the existing minor-unit convention (100 minor units per application currency unit), with currencies separated and no FX conversion. Stock metrics describe generation time even when a past flow period is selected. Periods use `[from, to)` UTC instants resolved from the selected IANA reporting timezone (default Africa/Nairobi). Custom input dates are inclusive local calendar dates, bounded to 366 days and clipped at generation time. Previous-period comparisons use the immediately preceding equal-duration interval; they do not claim unavailable historical stock balances.

| Metric | Authority and calculation |
| --- | --- |
| Plan segmentation | Current `OrganizationSubscription.planId → SubscriptionPlan.key`; CONTROL and FORT_KNOX are independent. Other plans and organizations without a plan remain explicit OTHER/UNASSIGNED. Invoice segmentation uses the retained invoice plan, not the organization's current tier. Movement segmentation uses the applied transition's destination tier. |
| Active organization | Organization ACTIVE, subscription ACTIVE, unexpired current period, and onboarding ACTIVE where onboarding state exists. Legacy organizations without onboarding can qualify; trials, suspended organizations and expired periods are excluded. |
| Onboarding / suspended / cancelled | Existing onboarding state not ACTIVE / organization SUSPENDED / subscription CANCELLED. These are separate dimensions and can overlap; they are not a partition of the platform. |
| Portfolio | Actual Property, Building and Unit records. Active units have registry status other than INACTIVE. Declared onboarding unit counts do not become managed inventory. Average size = units / organizations in scope. |
| MRR | Sum of persisted `subscription.metadata.commercialSnapshot.monthlyMinor` for qualifying active subscriptions, grouped by current plan and saved currency. The existing commercial snapshot already normalizes MONTH/QUARTER/YEAR cadence. Three-month prepaid cash is not multiplied into MRR. No fallback to today's plan catalog; legacy subscriptions without price snapshots are excluded and counted as missing coverage. |
| ARR | Known contracted MRR × 12 in each currency. This is contractual recurring value, not GAAP revenue recognition or a cash forecast. |
| Active subscription value | Sum of each active contract's saved `recurringMinor`, the contractual charge per billing cycle. Mixed cadences are explicitly labelled; this is distinct from MRR. |
| Invoiced | Gross saved invoice total for the selected issue-date cohort, excluding DRAFT and VOID. `issuedAt` falls back to original `createdAt` for legacy records. Taxes remain the saved invoice taxes. |
| Verified collections | Saved amountPaid on PAID invoices with sufficient payment, paidAt no later than generation, and a matching PROCESSED INVOICE_PAID BillingEvent for the same organization, provider and invoice reference; selected by paidAt. Issuance, frontend success, and unsupported manual PAID markers are insufficient. Matching uses a one-event lookup, so duplicate event rows cannot multiply revenue. |
| Outstanding / overdue | Current OPEN/PAST_DUE remaining gross invoice balance, clamped at zero; overdue additionally has dueDate before generation. Historical overdue stock is not reconstructed from today's state. |
| Collection rate | Verified collections on the selected issued cohort / issued gross cohort total. This differs from selected-period cash collections, which can settle older invoices. An empty denominator is unavailable. |
| Revenue per organization / unit | Known MRR / priced active organizations; known MRR / actual active units owned by those priced active organizations. Missing pricing coverage is disclosed. |
| Revenue contribution | A plan's known MRR / all selected plans' known MRR in the same currency. Under a single-plan filter it is 100% of that selection. |
| Growth / conversion | New organizations by createdAt, activations by onboarding.activatedAt, new subscription records by createdAt. Conversion = selected signup cohort currently active / selected signup cohort. Cohort charts group by current tier and show only recorded event days. Missing legacy activation dates are not invented. |
| Upgrades / downgrades / cancellations | New embedded append-only subscription transitions, atomically recorded with save, findOneAndUpdate and updateOne state/plan writes. CONTROL→FORT_KNOX is UPGRADE; reverse is DOWNGRADE; other plan changes are PLAN_CHANGED. Pending/scheduled changes are not applied movements. Actor, timestamp, prior/new plan and status are retained. Cancellation is recorded once per state transition. |
| Churn / historical MRR | Cancellation counts are supported from prospective tracking. Churn rate remains unavailable because complete historical opening cohorts are absent. No historical MRR curve is synthesized. Retained briefs provide truthful values known at generation time. |

Onboarding state changes now store `stateChangedAt` through the existing configuration, contract, signature, checkout and activation services. A flow unchanged for more than 72 hours is flagged. Legacy rows use updatedAt as an explicitly approximate fallback; there is no historical backfill. Existing attention codes expose payment failures, reconciliation requirements and activation intervention through organization drill-downs. The dashboard never activates an organization or bypasses signatures/payment verification.

## Fort Knox, monitoring and priority rules

Fort Knox counts actual organizations, properties, camera-enabled properties, registered cameras, recent/unresolved incidents, critical unresolved incidents, evidence events and recorded CCTV integration failures. Camera availability requires lastHeartbeatAt or lastSeenAt: absent/future observations are UNKNOWN; observations older than five minutes or reported OFFLINE are OFFLINE; fresh DEGRADED and ONLINE observations retain those states. Camera registry defaults alone do not imply connectivity. Gateway health is unavailable because no durable gateway probe source exists. No stream URLs, credentials or provider tokens are exposed.

Operations reuse Job failures/dead letters, queue age/expired leases, IntegrationAttempt failures, Notification failures, BillingEvent failures/reversed payments, failed WebhookEvent records, service-switch audit history, worker heartbeat and open/acknowledged PlatformMonitorAlert records. Organization-attributable sources follow dataset/plan isolation. Platform-global signals appear only in LIVE + ALL; tier/demo views mark unassignable global health unavailable rather than attributing it arbitrarily. Missing sources generate a degraded-data warning/action, never a green claim.

| Priority | Deterministic trigger |
| --- | --- |
| Critical | Recorded CRITICAL monitor alert, stale observed worker, unresolved CRITICAL Fort Knox incident. |
| High | Overdue invoices, paid invoices lacking settlement evidence, missing active contract prices, onboarding attention codes, observed offline cameras, noncritical unresolved incidents, failed jobs/webhooks/integrations/notifications/billing processing, unavailable source. |
| Medium | Onboarding unchanged >72 hours, fresh degraded cameras; existing LOW monitoring alerts are mapped to Medium. |
| Informational | Awaiting signature, service-switch changes. |

Queue order is severity, descending affected count, then stable rule ID. It is capped at 100, with explicit truncation; recorded monitor entries are capped at 50 with a warning. Actions retain scope/date/timezone filters and link to invoice/payment cohorts, organization onboarding, Fort Knox incident/camera records, or existing operations/monitoring controls. Entity drill-downs return safe projections and exact IDs, not raw model documents. Existing controls handle remediation and retain their existing authorization/audit requirements. Historical action links intentionally open current entity state while the historical priority text stays unchanged.

## API

All endpoints are under `/api/v1`, use the existing authenticated response/error conventions and return `Cache-Control: no-store`.

| Method / path | Behavior |
| --- | --- |
| GET `/platform-control/business-intelligence` | Aggregated overview, precise source coverage, current stocks, period flows, comparisons and priorities. |
| GET `/platform-control/business-intelligence/drill-down` | Bounded organization/invoice/verified-payment/unverified-payment/outstanding/overdue/billing-event/camera/incident/applied-movement records. Optional organizationId, page and pageSize (maximum 50). |
| POST `/platform-control/morning-briefs` | Generate retained brief with required idempotencyKey and scope/range filters; 409 on conflicting retry, 503 if the required unique index is absent. |
| GET `/platform-control/morning-briefs` | Paginated historical metadata, filtered by environment/dataset and optional plan. Historical records retain their own operating period; browsing is not restricted to today's flow range. |
| GET `/platform-control/morning-briefs/:id` | Audited, hash-verified retained snapshot within the permitted environment/dataset. |

Reusable query parameters: period TODAY/PREVIOUS_DAY/LAST_7_DAYS/LAST_30_DAYS/CURRENT_MONTH/PREVIOUS_MONTH/CUSTOM; timeZone; from/to; plan ALL/CONTROL/FORT_KNOX/OTHER/UNASSIGNED; dataset LIVE/DEMO. Strict Zod objects reject unrecognized fields and query/operator injection. Date errors are explicit. OpenAPI includes the endpoints. Every business read, sensitive drill-down, history read and brief generation produces an existing AuditLog event; audit failures fail the operation, and generation rolls back.

## Database and performance

One collection is added: PlatformBrief. OrganizationSubscription gains prospective embedded businessTransitions/businessTrackingStartedAt; Organization.onboarding gains stateChangedAt. Billing and organization authorities remain unchanged. No historical migrations manufacture prices, activations or movement.

Run `npm --prefix apps/backend run business:create-indexes` against the intended database before enabling brief generation. The script creates only declared brief indexes and explicitly named `platform_bi_*` indexes, and never synchronizes or drops unrelated indexes:

- Brief environment/dataset/idempotencyKey unique index enforces retry integrity; environment/dataset/generatedAt supports all-plan history; environment/dataset/plan/generatedAt supports filtered history.
- Organization createdAt and onboarding.activatedAt support the date-filtered growth query's OR branches.
- Subscription businessTransitions.at supports date-filtered applied movement scanning before organization joins.
- Invoice createdAt, issuedAt and paidAt support date-filtered issue/settlement cohorts; status/dueDate supports current outstanding/overdue scans.

Existing organizationId and registry indexes serve joins/portfolio grouping. Plan filtering happens before organization portfolio lookups. Date filters precede relevant invoice/growth/movement joins. Aggregation stays on the backend; the new landing page does not fetch the complete organization list. Drill-down/history are paginated (maximum 50); aggregations have 10–15 second maxTimeMS and degraded-source handling. Current stock queries necessarily examine current selected subscriptions/invoices; benchmark representative production volumes before introducing materialized rollups. No cache/database/index infrastructure is added speculatively.

## Demo, tests and deployment

`npm --prefix apps/backend run seed:platform-business-demo` extends existing billing/seed architecture. It requires an existing SUPER_ADMIN, existing Control/Fort Knox plan seeds, NODE_ENV development/test, and a database name ending in -demo or -test. The seed is idempotent and creates nine marked organizations, actual registry inventory, historical commercial snapshots, simulated INTERNAL payment evidence, open invoices, onboarding attention, failed internal operational fixtures and four explicitly simulated camera states per Fort Knox organization. It never contacts providers, sends notifications or changes production catalog records.

LIVE queries exclude the marked dataset; DEMO queries include only it. Simulated cameras are excluded from LIVE even when attached to an unmarked organization. Production rejects DEMO in the backend regardless of frontend flags; the production frontend hides the selector. Demo records and retained briefs are visibly labelled. Production charts never receive simulated fixture numbers.

`npm --prefix apps/frontend run verify:platform-business` runs a real password/OTP browser journey against an isolated in-memory Mongo replica set and temporary API/Next servers: login → dashboard → independent plan filtering → retained brief → Critical action → organization drill-down. It checks runtime errors and mobile width and captures desktop/mobile screenshots in ignored tmp storage. The test-only server rejects non-test environments and non-test databases; random fixture passwords are generated in memory. CHROMIUM_EXECUTABLE_PATH selects an already installed Chromium; PCC_BI_TEST_SINGLE_PROCESS is only a browser-harness sandbox option. No new production environment variables are required. Quality CI runs this journey after the existing frontend gates.

### Local preview and response compatibility

All `/platform-control`, `/sales` and `/operations/diagnostics` requests use the authenticated backend, including when landlord development demo data is enabled. Authenticated real SUPER_ADMIN sessions also bypass local preview interception for shared organization, billing, access and operational endpoints. The local preview provider explicitly rejects unsupported platform capabilities instead of returning a generic empty object. A simulated administrator receives setup guidance; it does not send a preview token or fabricate platform revenue. For a real local SUPER_ADMIN session, set `NEXT_PUBLIC_DEV_AUTH_BYPASS=false` and `NEXT_PUBLIC_DEV_DEMO_MODE=false`, restart the frontend, run the current backend and sign in through the existing MFA flow. If a saved development role preview remains active, leave that preview before signing in.

Overview and generated/retained brief responses are validated at the typed client boundary, including nested collections, currency and timezone. Incomplete or incompatible responses become an actionable analytics error. Render guards also protect against incompatible cached data. Missing fields are never converted to zero revenue or an empty platform. The browser journey exercises malformed-response recovery; `PCC_BI_TEST_DEV_DEMO_MODE=true` additionally verifies that local demo interception cannot override authenticated platform analytics.

The SUPER_ADMIN local preview shows connection guidance before mounting privileged control-plane queries. Other supported role and organization previews remain available. Sidebar links use existing `/platform?tab=...` destinations for access, billing, monitoring, operations, controls and security; aliases share their existing views. Raw webhook history and expanded session administration have not been added by this navigation correction. Render guards reject incompatible monitoring, controls and readiness data before iterating collections. The browser harness clicks every sidebar destination, tests malformed-response recovery in all three views and verifies that preview tokens never reach platform-control APIs. Development for this correction uses the user's existing laptop checkout through Remote Desktop Commander, synchronized with GitHub; no second repository is cloned.

Backend unit/security/E2E cover financial invariants, currency separation, prepaid/quarter/year normalization, actual plan counts, verified settlement, precise financial drill-downs, activation/onboarding timing, applied/query transitions, immutable/idempotent briefs, audit rollback, empty/degraded sources, DST/custom ranges, SUPER_ADMIN authorization and retained landlord isolation. Frontend tests cover typed API parameters and rendering/loading/retry/empty/degraded/snapshot/priority states. Existing tests are preserved.

Coolify configuration, provider adapters, deployment/service switches and landlord workflows are preserved. No production deployment or live payment credential/approval is required for development certification. Index creation is additive and should be scheduled before enabling retained briefs. Snapshot retention has no automatic TTL: briefs retain what administrators knew; deletion/export retention policy needs a deliberate audited operational procedure, not silent expiry.

Known limits: incomplete legacy contract prices and activation dates; prospective movement history only; no statistically valid churn denominator or past MRR reconstruction; no real gateway probes; organization-attributable operations cannot imply global tier health; missing integrations remain explicit; no scheduled email/notification delivery yet. The experience reports contracted gross invoice/cash intelligence, not an accounting ledger, deferred-revenue recognition or provider production certification.

## Release file manifest

### Added (22)

- `apps/backend/scripts/create-business-indexes.ts`
- `apps/backend/scripts/seed-platform-business-demo.ts`
- `apps/backend/scripts/serve-platform-business-test.ts`
- `apps/backend/src/database/models/PlatformBrief.ts`
- `apps/backend/src/modules/platform-control/platform-business.controller.ts`
- `apps/backend/src/modules/platform-control/platform-business.demo.ts`
- `apps/backend/src/modules/platform-control/platform-business.openapi.ts`
- `apps/backend/src/modules/platform-control/platform-business.repository.ts`
- `apps/backend/src/modules/platform-control/platform-business.schemas.ts`
- `apps/backend/src/modules/platform-control/platform-business.service.ts`
- `apps/backend/src/modules/platform-control/platform-business.types.ts`
- `apps/backend/tests/e2e/platform-business.e2e.test.ts`
- `apps/backend/tests/security/platform-business.api.test.ts`
- `apps/backend/tests/unit/platform-business.test.ts`
- `apps/frontend/scripts/verify-platform-business.mjs`
- `apps/frontend/src/components/platform-business.tsx`
- `apps/frontend/src/hooks/queries/use-platform-business.ts`
- `apps/frontend/src/hooks/use-platform-search.ts`
- `apps/frontend/src/lib/data/platform-business-ui.test.ts`
- `apps/frontend/src/lib/data/platform-business.test.ts`
- `apps/frontend/src/lib/data/platform-business.ts`
- `docs/SUPER_ADMIN_BUSINESS_INTELLIGENCE.md`

### Modified (23)

- `.github/workflows/quality.yml`
- `apps/backend/package.json`
- `apps/backend/scripts/run-e2e.mjs`
- `apps/backend/src/core/api/openapi.ts`
- `apps/backend/src/database/models/Organization.ts`
- `apps/backend/src/database/models/OrganizationSubscription.ts`
- `apps/backend/src/database/models/SubscriptionInvoice.ts`
- `apps/backend/src/modules/billing/prepaid-billing.service.ts`
- `apps/backend/src/modules/onboarding/landlord-onboarding.service.ts`
- `apps/backend/src/modules/platform-control/platform-control.routes.ts`
- `apps/frontend/package.json`
- `apps/frontend/src/app/(dashboard)/platform/page.tsx`
- `docs/API_SPECIFICATION.md`
- `docs/ARCHITECTURE.md`
- `docs/CCTV_ARCHITECTURE.md`
- `docs/CODEX_EXECUTION_TRACKER.md`
- `docs/DATABASE_DESIGN.md`
- `docs/DEVELOPMENT_ROADMAP.md`
- `docs/FEATURES.md`
- `docs/MASTER_CONTEXT.md`
- `docs/ROLES_PERMISSIONS.md`
- `docs/SECURITY.md`
- `docs/TESTING_STRATEGY.md`

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
