# Dapinni sales-engine completion

Continuation date: 2026-10-03. Existing laptop checkout:
`C:\Users\HP\Documents\Dapini\property-command-center`.
Existing branch: `main`; remote: `origin`; repository: HillaryMurimi/Fort-Knox.
Resumed HEAD: `8486747472d044b20d7704a8ecbfa330d49e221e`.
All 39 previously staged branding files were preserved. No clone, reset, clean, stash,
history rewrite or replacement project was used.

## What already existed and was reused

The Express/Mongoose/Zod backend and Next.js frontend retain authentication,
SUPER_ADMIN dual-channel MFA, organization ownership, RBAC/ABAC, hierarchy,
tenants/tenancies, finance/reconciliation, maintenance/contractors/approvals,
notifications, documents/evidence, audit, CCTV/security, entitlements,
subscriptions and signed prepaid commercial activation.

The committed sales engine, audit and runbook already exist:
[architecture audit](SALES_DEMO_AUDIT.md),
[implementation report](SALES_DEMO_RELEASE_REPORT.md),
[sales runbook](SALES_RUNBOOK.md). Existing Morning Brief and platform BI remain.
This continuation extends that implementation rather than introducing another CRM,
payment service, maintenance service, subscription system or security gateway.
The earlier platform response validation and SUPER_ADMIN sidebar isolation are retained.
## Delivered experience

| Requirement | Implementation |
| --- | --- |
| Demo Profile | Seller-owned optional discovery fields; company, scale, use/type, management processes, pain, objective and plan personalize the first story. No tenant/customer PII is needed. |
| Scenarios | Nine pain stories and six deterministic templates; custom scale 10–2,000 units / 1–20 properties. Scale never selects Fort Knox automatically. |
| Control | Complete operational attention, actionable KES amounts, hierarchy/tenancy investigation, money, repairs, expenses, vacancy, staff and evidence. |
| Rent/arrears | Due/overdue events, balance/history/follow-up, simulated allocation/reconciliation, lower arrears and changed attention/KPIs, retained receipt/audit. |
| Maintenance/expenses | Leak/pump problem, evidence, responsible person, assignment, quotation, approval, IN PROGRESS, completion/final cost and evidence/history. |
| Vacancy/staff | Vacancy days/exposure and next action; responsibility/deadline/overdue task, escalation, completion and retained evidence. |
| Executive apartments | Fragmentation-first storyline connects premium tenant service, management, repair, approval, expenditure and resolution visibility. |
| Fort Knox | Control plus explicitly simulated 02:14 event, location/source, investigation, evidence, escalation, resolution and retained audit. |
| State/reset | Transactional server snapshot, revision/key guards, atomic event/audit; reset reconstructs only this session's deterministic business state and retains sales evidence. |
| Pilot | Centrally configured duration, default 14 days; verified owner/private real workspace; existing hierarchy, import, staff, insight and maintenance populate the operation. |
| Activation | Seven actual-record readiness checks. Account creation alone is insufficient. Operational milestone never grants paid status. |
| Import | CSV template/upload/validation/preview/errors/duplicates/confirmation; SHA-bound transaction and idempotent retry; 300-unit batch exercised. |
| Intelligence | SUPER_ADMIN prospect cohorts, pain/template/plan/value moments, demo → pilot → readiness → activation → verified paid/renewal and blockers. |

The 150-unit Control benchmark is fictional: KES 2.8m expected / 2.3m collected /
500k outstanding, 17 overdue, 94% occupancy, six open repairs and two approvals.
Settling A01 changes outstanding to KES 464k and overdue count to 16.
Every important story follows problem → quantify → investigate → act → changed outcome → evidence.
## Work completed in this continuation

Dapinni is now the primary identity; “Your Property Command Center” is the supporting
descriptor. Shared backend/frontend brand constants, icon, public pages, authentication,
navigation, demonstrations, API metadata and future messages/artifacts use that hierarchy.
The remote ownership promise is “Your properties. Your decisions. Wherever you are.”

Future commercial PDFs use renderer version 2 and retained v2 metadata/keys. Existing signed
or issued artifacts remain immutable, with original bytes and hashes. Contract template
identifiers, commercial terms, plan keys/pricing, provider identifiers, cookies/storage
keys and organization records were preserved.

The existing commercial status DTO now includes a computed `organization.pilotPrepared`
boolean. Onboarding recognizes the prepared portfolio and, after verified paid activation,
opens that operation rather than asking the pilot owner to add their first property again.
CSV/PDF download filenames use Dapinni.

Browser harnesses use bounded development-only cache directories under `.next`,
so they do not share the developer server's lock/output. Five regression cases verify
default/production/test behavior, recognized fixtures and rejection of arbitrary paths.
TypeScript includes the two declared generated fixture-type locations.

The sales browser journey now also authenticates the real fixture owner through password
and phone OTP, reviews an actual insight, invites scoped staff, completes an approved real
pilot repair through authenticated HTTP and verifies visible 100% readiness/actual value.
It follows the existing commercial onboarding CTA and asserts readiness is still unpaid.
The two MFA double-proof E2Es have 15-second execution budgets and the full import/repair/
PDF/signature/payment/retention journey has 20 seconds. Other deadlines remain unchanged.
These are workflow execution budgets, not altered product expiry rules or performance claims.
No assertion, bcrypt cost, MFA channel, transaction, verification or commercial guard was removed.

The public cinematic verifier now establishes an explicit anonymous visitor fixture:
only a bodyless, cookieless, authorization-free refresh is denied locally with 401.
Full request headers are inspected. All other API attempts are blocked and fail the gate,
including authenticated refresh or operational writes. Adversarial guard cases cover methods,
cookies, authorization, body credentials and payment endpoints. Public layout/role/approval
assertions are retained; real authenticated sales checks use the separate live HTTP fixture.

## Isolation and security

Demonstration state/events use SalesDemoSession/SalesValueEvent, synthetic identifiers and
seller ownership. The pure reducer cannot invoke payment, messaging, storage or CCTV providers.
It inserts no live payment, operational invoice, subscription, camera or incident records and
cannot contribute simulated money to live MRR/ARR/financial BI.
Control security commands are denied on the server.

Pilots contain actual private owner records and bounded entitlements. Until authoritative
commercial activation, operational payment/messaging/camera integrations remain suppressed.
Account verification and the intended signed commercial payment flow retain existing controls.
All verification uses private Mongo replica sets, fictional accounts and test-only providers.
No production money, customer records, messages or cameras were exercised.

## Exact final quality results

| Gate | Result |
| --- | --- |
| Root `npm run typecheck` | PASS, backend and frontend strict TypeScript |
| Root `npm run lint` | PASS, 0 errors; 432 backend / 27 frontend existing warnings |
| Root `npm test`, backend | 65 files / 348 tests passed; 6 opt-in E2E files / 141 tests skipped here, executed separately |
| Root `npm test`, frontend | 29 files / 194 tests passed |
| Backend `npm run test:e2e` | 6 files / 141 tests passed, exit 0; 140.56s Vitest / 142.07s command |
| Root `npm run build` | PASS, backend tsc and optimized Next production build, 43 static pages |
| Root `npm run certify:release` | CERTIFIED_STATIC, 36 route files / 155 permissions / 10 critical paths |
| `verify:sales-demo` | PASS, authenticated Control/Fort Knox, evidence/reset, import, owner insight/staff/repair/100% readiness, commercial handoff and sales intelligence; 42.54s |
| `verify:platform-business`, interception off | PASS, all SUPER_ADMIN sidebar routes, malformed response recovery, MFA/bypass/logout, BI/Morning Brief, desktop/mobile; 113.68s |
| `verify:platform-business`, interception on | PASS, above plus preview routes and no privileged preview API calls; 112.72s |
| Production `verify-cinematic-demo.mjs` | PASS, 18 layout cases, role scope, theme/clean view/simulated approval; no errors or operational API attempts; 48.25s |

The five root quality commands completed sequentially with exit 0 (294.97s).
Production build processes disabled development authentication/data bypass and used an HTTPS
example API URL. Existing environment files were not edited. Browser fixtures deny anonymous
bootstrap locally or use isolated authenticated fixture servers; no example/production API
credentials or integrations were used. Script syntax and whitespace checks passed.
Critical sales views cover 1440×1000, 834×1112 and 390×844, light/dark, named controls,
keyboard action and no horizontal viewport spill. These checks are not formal WCAG certification.

## API, model and configuration impact

This continuation adds shared brand configuration and the computed commercial status boolean,
not new operational models, collections, indexes, providers, dependencies or payment endpoints.
The previously committed sales/pilot models, indexes, API contracts and `GUIDED_PILOT_DAYS`
configuration are inventoried in [the original implementation report](SALES_DEMO_RELEASE_REPORT.md).
Deploy those existing uniqueness indexes, roles and Control/Fort Knox plan records through the
existing release process. Browser-cache selection is internal to the two development test
scripts and ignored for production/test builds. No production environment change is required.

## Remaining limitations and operating requirements

The salesperson uses `/sales-demo`, the owner uses `/pilot` and SUPER_ADMIN uses
`/sales-intelligence`, with normal backend startup, seller permissions and authentication.
Development role/data preview cannot impersonate these privileged workflows. A verified owner,
configured roles/plans and Mongo replica-set transactions are required for a real pilot.

CSV is limited to 500 rows per batch, new properties/new identities and supported current
tenancies. Existing-account attachment, property expansion and historical/future leases use
the established controlled flows. Sandbox security evidence is labelled fictional telemetry
and text/checksum context, not real CCTV footage or real before/after photos.
No savings, ROI or occupancy guarantee is made. No live payment/CCTV certification,
production load test or independent penetration test was performed. No critical issue was
identified in the reviewed/exercised paths; static certification does not approve live providers.
The three `.continue/rules/` files are preserved user editor context for broader future work;
they duplicate canonical context and are outside this release, so they are not committed.

Production `verify-landing.mjs` also passed all six dark/light desktop/tablet/mobile cases
(123.41s), including exact Dapinni identity/hierarchy, theme persistence, working canvas,
camera/scene interaction, dialog, fixed navigation, no overflow, no runtime errors and
zero unexpected API attempts. Anonymous refresh is explicitly denied in the shared visitor
fixture. Both public browser gates run against the final optimized build.

## Acceptance answers

| Question | Answer |
| --- | --- |
| Personalize without engineering intervention? | Yes, through the authenticated seller's profile, pain, plan, scale/template and reset controller. |
| Demonstrate workflows rather than screens? | Yes, consequence/investigation/action/outcome/evidence drive the sales session. |
| Take actions and watch business state change? | Yes, persisted simulated payments, repairs/approvals, staff/vacancy actions and incidents change totals/status/attention/history. |
| Control independently compelling? | Yes, complete operational money/service/accountability stories require no Fort Knox capability. |
| Fort Knox distinct? | Yes, explicitly simulated detection/investigation/response/escalation and preserved security evidence extend Control. |
| Direct guided-pilot transition? | Yes, verified private owner workspace, import, actual insight/core workflow, readiness and existing signed/paid activation. |
| Production/demo strongly isolated? | Yes, separate snapshot persistence, server ownership/plan/replay guards, provider suppression and financial metric-isolation coverage. |
| SUPER_ADMIN measure conversion? | Yes, prospect-cohort demo → pilot → operational activation → evidenced paid/renewal, with pain/template/plan/value events and blockers. |

The release commit/hash, push verification and exact post-push Git status are supplied in the
delivery message; this report is included in that commit. Generated browser/build files,
environment files and the user's untracked editor rules are excluded.

## Exact file inventory for this continuation

### Added (7)

- `apps/backend/src/config/brand.ts`
- `apps/frontend/scripts/public-visitor-fixture.mjs`
- `apps/frontend/src/app/icon.svg`
- `apps/frontend/src/lib/brand.ts`
- `apps/frontend/src/lib/browser-build-config.test.ts`
- `docs/BRANDING.md`
- `docs/DAPINNI_SALES_COMPLETION.md`

### Modified (48)

- `AGENTS.md`
- `README.md`
- `apps/backend/src/app.ts`
- `apps/backend/src/core/api/openapi.ts`
- `apps/backend/src/core/billing/billing-provider.ts`
- `apps/backend/src/core/integrations/messaging-providers.ts`
- `apps/backend/src/core/integrations/mpesa.provider.ts`
- `apps/backend/src/modules/auth/admin-mfa.service.ts`
- `apps/backend/src/modules/auth/auth.service.ts`
- `apps/backend/src/modules/billing/prepaid-billing.service.ts`
- `apps/backend/src/modules/documents/generated-document.service.ts`
- `apps/backend/src/modules/integrations/integration.service.ts`
- `apps/backend/src/modules/onboarding/contract-default.ts`
- `apps/backend/src/modules/onboarding/landlord-onboarding.service.ts`
- `apps/backend/src/modules/onboarding/onboarding.service.ts`
- `apps/backend/tests/app.test.ts`
- `apps/backend/tests/e2e/admin-auth.e2e.test.ts`
- `apps/backend/tests/e2e/landlord-onboarding.e2e.test.ts`
- `apps/backend/tests/e2e/sales-demo.e2e.test.ts`
- `apps/frontend/next.config.ts`
- `apps/frontend/scripts/verify-cinematic-demo.mjs`
- `apps/frontend/scripts/verify-landing.mjs`
- `apps/frontend/scripts/verify-platform-business.mjs`
- `apps/frontend/scripts/verify-sales-demo.mjs`
- `apps/frontend/src/app/demo/page.tsx`
- `apps/frontend/src/app/explore/page.tsx`
- `apps/frontend/src/app/layout.tsx`
- `apps/frontend/src/app/login/page.tsx`
- `apps/frontend/src/app/onboarding/page.tsx`
- `apps/frontend/src/app/page.tsx`
- `apps/frontend/src/app/signup/page.tsx`
- `apps/frontend/src/components/marketing/cinematic-demo/demo-experience.tsx`
- `apps/frontend/src/components/marketing/cinematic-demo/demo-stage.tsx`
- `apps/frontend/src/components/marketing/cinematic-demo/demo.module.css`
- `apps/frontend/src/components/marketing/demos/product-demos.tsx`
- `apps/frontend/src/components/marketing/landing/digital-twin.css`
- `apps/frontend/src/components/marketing/landing/landing-page.tsx`
- `apps/frontend/src/components/sales/guided-pilot-workspace.tsx`
- `apps/frontend/src/components/sidebar.tsx`
- `apps/frontend/src/components/topbar.tsx`
- `apps/frontend/src/lib/cinematic-demo/content.ts`
- `apps/frontend/src/lib/data/landlord-onboarding-ui.test.ts`
- `apps/frontend/src/lib/data/landlord-onboarding.ts`
- `apps/frontend/tsconfig.json`
- `docs/API_SPECIFICATION.md`
- `docs/CODEX_EXECUTION_TRACKER.md`
- `docs/FEATURES.md`
- `docs/MASTER_CONTEXT.md`
