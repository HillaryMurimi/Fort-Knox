# M2 — immutable subscription movements and retention

Accepted: 2026-11-06 23:44 Africa/Nairobi. All required local checks passed and hosted Quality completed successfully on the exact accepted implementation SHA below. No staging/production deployment or live outbound activation authorized or performed.

## Implemented

The existing billing and Revenue workspace now retain and display verifiable historical subscription changes. All seven movement types are represented. Payment settlement, invoice/proof, subscription state, movement and audit share transactions; monthly bridges and cohort calculations use exact integer arithmetic. Missing evidence produces unavailable results instead of fabricated zero. Reconciliation is read-only. Future M3 agents have a defined analytical evidence contract and gain no new payment, contact or autonomous-intervention authority.

Journey: a real SUPER_ADMIN opens Sales & Customer Success → Revenue, selects one currency and up to twelve Nairobi months, reviews opening/new/reactivation/expansion/contraction/churn/closing MRR and customer/gross/net retention, expands completeness issues, pages retained movements and inspects safe source references. Current cash and target workflows remain available. No second analytics system or new credentials were introduced.

## Root causes and before/after evidence

- Before: retained plan/status transitions lacked immutable recurring-value deltas, paid-term boundaries and authoritative historical event chains. After: transactionally appended SubscriptionMovement records retain exact previous/new values, source IDs, effective/recorded dates, unique source identity and sequence links.
- Before: historical MRR and retention were unavailable. After: complete verified monthly bridges reconcile exactly; unknown openings, legacy metadata-only contract links, missing proof, late boundary conflicts and open periods remain explicitly unavailable. No invoice or historical event is backfilled or changed.
- Exact-money evidence: values above Number's safe integer reconcile without loss; 1,500,001 / 1,000,001 minor units yields 149.99% under the documented truncation rule. The first browser fixture incorrectly expected 150.00%; its assertion was corrected, with a corresponding arithmetic regression test. Production math was not loosened.
- The extended browser journey exposed independent public/authentication rate-limit windows. One cooldown could clear only the first limiter. The harness now honors each bounded Retry-After, up to three attempts, while still requiring a successful real login and OTP. Production thresholds and checks were not changed or bypassed.
- Initial hosted [Quality 42239394670](https://github.com/HillaryMurimi/Fort-Knox/actions/runs/42239394670) for `8ca5da0afbb780bcba8738719846caba05a01dba` passed backend and Coolify images, but failed frontend follow-up enrollment (`409 !== 201`, browser script line 497). The Friday 18:07 Nairobi run requested contact two hours later; the unchanged weekday 08:00–20:00 policy deferred that to Monday, outside the fixture's one-day campaign/sequence window. A fixed-clock replica-set regression reproduces `FOLLOWUP_WINDOW_UNAVAILABLE` for one day, permits enrollment only after a separately reviewed seven-day policy, verifies Monday 08:00 scheduling, and asserts zero messages/notifications/provider sends. The browser fixture now reviews a seven-day campaign/sequence window; all production policy gates and success assertions remain unchanged. Follow-up regression suite: 35 passed. Backend typecheck/lint and the corrected complete sales browser journey also passed locally, with zero console errors (`ci-history-sales-browser-weekend.log`). This initial hosted failure is retained as evidence, not reported as a green release.

## API, database and security

GET `/api/v1/sales/success/revenue/history`, `/movements`, and `/movements/:movementId` use existing platform-admin authorization, SALES_ANALYTICS, no-store and audit. Demo organizations are excluded. Source responses omit raw provider payloads/credentials. Frontend queries are disabled for preview/non-admin sessions and cache keys include principal/access.

New append-only SubscriptionMovement collection has source-key and subscription/sequence unique indexes, bounded reporting indexes, and normal application mutation guards. Billing collection is independent of analytics visibility. Report reads use one replica-set snapshot and caps of 10,000 source rows per collection, twenty paginated movements and 100 displayed reconciliation issues. Limits or evidence defects fail closed. Storage remains application-level append-only, not WORM storage.

Full financial semantics, cohort population/denominators, source limitations and M3 constraints: [Subscription revenue history](../SUBSCRIPTION_REVENUE_HISTORY.md).

## Verification

Initial complete backend E2E: 397 passed / 21 suites. Initial root default tests: backend 581 passed (E2E suites intentionally skipped there), frontend 343 passed. Root typecheck and lint passed (warnings, zero errors). Static release certification passed: 39 route files, 172 permissions, 13 critical paths. Final results after review refinements, browser journeys, builds and exact-SHA hosted status are recorded in the delivery evidence below; these initial results alone do not establish acceptance.

Tests added cover all movement types, repeat and conflicting replay, concurrent/stale expiry, cancellation after expiry without duplicate churn, audit rollback, immutable model operations, same-organization source checks, exact-money/chain/currency/month/cohort invariants, production index prerequisites, admin-only HTTP/no-store/audit/switch/demo controls, UI exact/null/escaped values and real API-backed browser history/source/focus journeys. Existing signed onboarding-webhook tests additionally assert activation/renewal ledger entries and transactional rollback.

## Final local verification

Final local commands and outcomes (reviewed implementation):

| Command | Result |
| --- | --- |
| `npm run typecheck` | Backend and frontend passed |
| `npm run lint` | Passed; backend 737 warnings, frontend 27 warnings, zero errors |
| `npm test` | Backend 583 passed / 98 suites, 20 opt-in suites skipped; frontend 343 passed / 45 suites |
| `npm --prefix apps/backend run test:e2e` | Complete opt-in E2E/transaction run: 398 passed / 21 suites |
| `npm run certify:release` | CERTIFIED_STATIC: 39 route files, 172 permissions, 13 critical OpenAPI paths |
| `npm run build` | Backend TypeScript and frontend production build passed; preview/demo bypass false |
| `npm --prefix apps/frontend run verify:sales-demo` | Passed; real HTTP history/cohorts/source inspection, focus restoration, exact/null amounts, 320/390/834/1440 Revenue widths in both themes; full existing journeys and zero console errors |
| `npm --prefix apps/frontend run verify:status-system` | 66 tests plus 12 contrast/labels/responsive/reduced-motion browser cases passed |
| `npm --prefix apps/frontend run verify:platform-business` | SUPER_ADMIN authentication, bypass denial, navigation, plan/filter, retained brief/action/source drill-down and logout passed on desktop/mobile |
| `git diff --check` | Passed |
| `npm --prefix apps/backend audit --omit=dev --json` and frontend equivalent | Both production dependency trees: zero vulnerabilities on 2026-11-06; full development-tool audits still report advisories |

All database/browser verification used disposable local test databases and controlled adapters. No owner database, real payment or live outbound channel was used. Screenshots for both themes were inspected; tables scroll within their panels rather than overflowing the page. Final local logs use the ignored `ci-history-final-*`, `ci-history-build.log`, `ci-history-sales-browser-3.log`, `ci-history-status-browser.log` and `ci-history-platform-browser.log` files. They are not committed as generated artifacts.

## Files created

- `apps/backend/src/database/models/SubscriptionMovement.ts`
- `apps/backend/src/modules/billing/subscription-movement.repository.ts`
- `apps/backend/src/modules/billing/subscription-movement.service.ts`
- `apps/backend/src/modules/sales/revenue-history.calculations.ts`
- `apps/backend/src/modules/sales/revenue-history.repository.ts`
- `apps/backend/tests/e2e/subscription-movement.e2e.test.ts`
- `apps/backend/tests/unit/revenue-history.test.ts`
- `apps/backend/tests/unit/subscription-movement-indexes.test.ts`
- `apps/frontend/src/components/sales/sales-revenue-history.tsx`
- `docs/SUBSCRIPTION_REVENUE_HISTORY.md`
- This completion report.

## Files modified

- Backend scripts: `certify-release.ts`, `create-sales-indexes.ts`.
- Billing/integration: `billing.service.ts`, `prepaid-billing.service.ts`, `integration.service.ts`.
- Sales: `sales-revenue.controller.ts`, `sales-revenue.openapi.ts`, `sales-revenue.schemas.ts`, `sales-revenue.service.ts`, `sales.routes.ts`.
- Backend E2E: `landlord-onboarding.e2e.test.ts`, `sales-revenue.e2e.test.ts`, `sales-followup.e2e.test.ts` (hosted scheduling-fixture regression).
- Frontend: `scripts/verify-sales-demo.mjs`, `src/components/sales/sales-revenue.tsx`, `src/lib/data/sales-revenue.ts`, `src/lib/data/sales-revenue.test.tsx`.
- Documentation: `MASTER_CONTEXT.md`, `FEATURES.md`, `DEVELOPMENT_ROADMAP.md`, `AI_REVENUE_GROWTH_ROADMAP.md`, `API_SPECIFICATION.md`, `ARCHITECTURE.md`, `CODEX_EXECUTION_TRACKER.md`, `DATABASE_DESIGN.md`, `SALES_REVENUE_INTELLIGENCE.md`, `TESTING_STRATEGY.md`.

No files deleted. No environment files, secrets, generated artifacts or unrelated `.continue/` content included.

## Remaining risks and manual actions

1. Before a separately authorized rollout, install additive indexes with `npm --prefix apps/backend run sales:create-indexes` against the intended replica set. Required indexes gate production financial writes. No owner database was accessed or migrated here.
2. Release matching API/worker versions only with separate authorization; review Coolify automatic-deployment settings first. Existing billing writers cannot supply pre-release history. No new environment keys are required.
3. Review real provider evidence and historical gaps. Legacy openings, missing proofs and overlapping late boundaries need explicit evidence reconciliation/correction design; no automatic repair is supplied. Reports do not certify provider completeness, refunds, fees, taxes or recognized revenue.
4. NEW_MRR/historical target attribution remains uncertified. Verified activation cohorts cover only organizations with proven openings; they do not silently claim retention for the whole legacy customer population.
5. Queries above the source cap fail closed; future materialization/checkpoints need separate design. No benchmark against owner-scale live data or real-provider acceptance is claimed.
6. Leave autonomous financial/customer interventions OFF. Consent, suppression, approval, scope, spending, timing and audit gates remain independent requirements.
7. Development-tool dependency advisories and lint warnings remain maintenance work. The production-only dependency audits returned zero vulnerabilities; this is not a claim that the entire development toolchain is advisory-free.

Next connected milestone: use qualified immutable event references for M3 proposal-only Supervisor/retention triggers, then prove trigger correctness and every independent customer-contact/authorization policy before considering live activation. Deployment status: not deployed to staging or production.

## Exact-SHA delivery evidence

- Initial implementation: `8ca5da0afbb780bcba8738719846caba05a01dba`.
- Accepted implementation including the governed browser-fixture correction: **`13799b6bba043b89db82d7e813d2761f74ff98b1`**, pushed normally to `origin/main` and verified against `git ls-remote`. No force push, branch-protection bypass, clone or deployment was used. The pre-existing untracked `.continue/` folder remains untouched.
- [Quality 42289897036](https://github.com/HillaryMurimi/Fort-Knox/actions/runs/42289897036): **completed / success**, exact head SHA `13799b6bba043b89db82d7e813d2761f74ff98b1`, updated at 2026-11-06 20:44:16 UTC (23:44:16 Nairobi).
- [Backend job 128140262927](https://github.com/HillaryMurimi/Fort-Knox/actions/runs/42289897036/job/128140262927): passed typecheck, lint, 583 default tests, **399 complete E2E/transaction tests**, production build and static release certification (39 route files, 172 permissions, 13 critical paths). Default tests intentionally skip the opt-in suites; the subsequent complete E2E command executes them.
- [Frontend job 128140263222](https://github.com/HillaryMurimi/Fort-Knox/actions/runs/42289897036/job/128140263222): passed typecheck, lint, unit tests, production build, status/contrast/responsiveness, platform-business and complete sales/pilot/browser-history journeys.
- [Coolify-image job 128140263138](https://github.com/HillaryMurimi/Fort-Knox/actions/runs/42289897036/job/128140263138): passed image builds and synthetic-service smoke tests. This does not deploy an application or establish real-provider acceptance.

The documentation follow-up records this verified implementation evidence. Staging/production, real provider completeness, original legacy-history remediation and autonomous revenue interventions remain outside this acceptance.
