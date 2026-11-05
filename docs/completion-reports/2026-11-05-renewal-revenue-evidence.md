# Protected renewal evidence for Revenue

M2 continuation, 2026-11-05, Africa/Nairobi. Verification in progress; publication and hosted acceptance will be recorded below.

## Outcome and connection to the Quality repair

The prerequisite repair is accepted on `82079fbe1d36843aea3e57cbcf8687358236f33b`: [Quality 42053908041](https://github.com/HillaryMurimi/Fort-Knox/actions/runs/42053908041) passed frontend, backend and Coolify images. This continuation addresses an actual M2 source gap: modern renewals already retained exact price snapshots, but their contract link lived only in mutable metadata, so Revenue excluded their cash.

New renewal settlements resolve a same-organization SIGNED contract and its same-subscription PAID activation invoice. They retain top-level originContractId as a protected invoice field and include it in the billing event. The existing transaction still commits invoice, PDFs/evidence, period, event and audit together. Missing evidence fails with RENEWAL_CONTRACT_EVIDENCE_REQUIRED for reconciliation. No provider call, authorization, cancellation, timing or amount guard is bypassed.

Revenue now accepts that protected renewal link with a commercial snapshot and retains all existing provider, organization, currency, payment, signed-contract and integer-money gates. Activation contractId remains unique; renewal originContractId is not unique. Mutable metadata is not promoted into proof. Historical records are not rewritten and catalog edits do not recalculate retained prices.

## API, database and access

No new route or Revenue response shape. Generated Revenue OpenAPI clarifies its source contract. SubscriptionInvoice adds optional originContractId, also present in authorized invoice-list JSON for new renewals; no new collection, index, dependency, environment variable or migration. Existing metadata remains for compatibility but is not analytics authority. API and worker should use the same release. SUPER_ADMIN, SALES_ANALYTICS, no-store and fresh-assurance target controls remain unchanged. No AI authority or service switch changes.

## Files

Created: this report.

Modified:
- apps/backend/src/database/models/SubscriptionInvoice.ts
- apps/backend/src/modules/billing/prepaid-billing.service.ts
- apps/backend/src/modules/sales/sales-revenue.repository.ts
- apps/backend/src/modules/sales/sales-revenue.openapi.ts
- apps/backend/tests/e2e/landlord-onboarding.e2e.test.ts
- apps/backend/tests/e2e/sales-revenue.e2e.test.ts
- docs/DATABASE_DESIGN.md
- docs/API_SPECIFICATION.md
- docs/LANDLORD_CONTRACT_WORKFLOW.md
- docs/SALES_REVENUE_INTELLIGENCE.md
- docs/AI_REVENUE_GROWTH_ROADMAP.md
- docs/TESTING_STRATEGY.md
- docs/CODEX_EXECUTION_TRACKER.md
- docs/completion-reports/2026-11-05-quality-repair.md (records the completed prerequisite CI result)

Deleted: none. Unrelated `.continue/`, local logs and generated files excluded.

## Verification and publication

Added coverage: real renewal settlement into Revenue, catalog independence, exact cash/current MRR, replay, invoice-link immutability, missing/unsigned/foreign/wrong-subscription evidence, transactional audit rollback and projection rejection of metadata-only or unprotected links.

Local checks so far:

| Command | Result |
| --- | --- |
| Root `npm run typecheck` | Backend/frontend passed |
| Root `npm run lint` | Passed, zero errors; existing 725 backend and 27 frontend warnings |
| Root `npm test` | 577 backend passed, 381 E2E tests skipped by default; 341 frontend passed |
| Focused `RUN_E2E=1` landlord-onboarding + sales-revenue replica-set suites | 40 passed |
| Root `npm run build` with production/CI public configuration | Backend and frontend production builds passed |
| Root `npm run certify:release` | CERTIFIED_STATIC, 39 route files / 172 permissions / 10 critical paths |
| Complete `npm --prefix apps/backend run test:e2e` rerun | All 388 cases across 20 files passed in 723.17s, including the previously timed-out onboarding journey |

The first build invocation accidentally inherited NODE_ENV=test from the check runner and omitted NEXT_PUBLIC_API_URL; Next's production configuration assertion correctly stopped prerendering. This was a harness configuration error. The clean production rerun passed using the same synthetic HTTPS API URL and disabled development bypasses as hosted CI.

The first full E2E run passed 387/388 cases in 862.17s; the existing anonymous-demo-to-first-value onboarding case exceeded its unchanged 5000ms timeout (reported duration 8417ms). It passed in the focused 40-case run. All new renewal regressions passed. Available Windows memory was below 350 MB when investigating the result, consistent with resource contention. The complete rerun passed 388/388 with no code, assertion or timeout changes. Exact-commit publication/hosted results remain pending.

## Remaining work and owner actions

No credentials or manual migration are added by this increment. In an explicitly approved deployment, update API and worker together; older workers would continue creating excluded metadata-only renewals. Existing sales index/switch rollout and genuine Paystack acceptance/reconciliation actions remain as documented. Do not treat fixture proof as provider completeness.

Remaining M2 work: immutable historical MRR movement/snapshot evidence, retained-customer cohorts, provider/source reconciliation, exclusive monetary attribution and measured expenses/profitability. Older metadata-only renewals need a separately designed, evidence-backed reconciliation path; do not patch historical invoices or reconstruct prices from today's catalog. M3 must not claim unavailable financial outcomes.

Deployment status: not deployed to staging or production. No live outbound or owner-database mutation.
