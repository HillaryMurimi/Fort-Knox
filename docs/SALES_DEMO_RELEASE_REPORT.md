# Property Command Center sales-conversion release report

Release date: 2026-10-02. Existing repository: HillaryMurimi/Fort-Knox. Existing branch: `main`. Work continued in the existing checkout, fast-forwarded from `2039e51` to `cfb82a6` before implementation. No repository was cloned. The initial working tree was clean. The commit and post-push status are reported in the delivery message; this document is part of that commit.

## Existing architecture discovered

The audit was written before major changes in [SALES_DEMO_AUDIT.md](SALES_DEMO_AUDIT.md). The application is an Express/TypeScript/Mongoose/Zod modular monolith with a Next.js App Router frontend. Existing authorities include organization and hierarchy ownership, server RBAC/ABAC, authenticated sessions, phone/account verification, SUPER_ADMIN dual-channel MFA, minor-unit financial records, provider reconciliation/refunds, maintenance approval policies, contractors, evidence/storage, audit, notifications/jobs, centralized plans/entitlements, and landlord contract/e-signature/invoice/prepaid activation.

The existing public cinematic/live/explore/studio demonstrations and development-only browser demo provider remain. Existing platform intelligence, Plan Performance and retained Morning Brief remain. SalesLead, sales requests and property setup assistance already existed. A durable pain-specific salesperson controller, resettable server simulation, prospect conversion cohorts and actual-activity guided activation workspace were missing.

## Existing functionality reused and modified

Reused SalesLead and the Sales router; authentication/MFA; scoped membership and permission catalogs; API/error/audit conventions; SubscriptionPlan and EntitlementService; existing Property/Building/Floor/Unit/User/Tenant/Tenancy/RentCharge records; staff invitations; maintenance policies and status transitions; and existing landlord agreement, signature, invoice, checkout and verified payment activation. No parallel CRM, billing, payment provider, maintenance domain or CCTV gateway was introduced.

Modified central entitlements to recognize an unexpired bounded pilot grant without creating a subscription. Billing feature checks now delegate to that existing central authority. Expired unpaid pilots become read-only through server authorization. Existing operational provider boundaries reject unpaid pilot/demo operations, including rent checkout/reconciliation/callbacks, refunds, settlement provisioning, outbound operational notifications and live/playback camera sessions. Existing signed commercial activation and account verification remain available.

Maintenance creation and transitions now record audit atomically and use optimistic concurrency. The original allowed status transitions and approval thresholds remain. Existing test fixtures were updated to supply actual organization records or the new expiry lookup; existing domain/security assertions were retained.

## New architecture

- SalesDemoSession: seller-owned SALES_DEMO profile and deterministic business snapshot, revision, reset generation and optional pilot link.
- SalesValueEvent: append-oriented, uniquely keyed command/outcome events for SALES_DEMO or PILOT activity.
- Pure simulation engine: deterministic reducer with no production finance, messaging, storage or camera dependency. It writes no live operational records.
- Guided pilot metadata on Organization: existing verified owner, lead/session, selected plan, duration, expiry and operational activation milestone.
- Validated preview/confirm CSV adapter into existing models; a scoped actual-activity readiness/value view; prospect-cohort conversion queries.

MongoDB transactions commit state, value events and audit together. Revision checks prevent stale edits. Command keys with payload hashes make retries idempotent and reject reuse for another action. Required production uniqueness indexes are checked before demo/pilot mutations.

## Demo Profile and templates

`/sales-demo` is available to SUPER_ADMIN after existing MFA, or an explicitly delegated organization-wide `sales.demo.manage` seller. Sessions are seller-owned; no ordinary role receives the permission automatically.

The company display name is required. Optional discovery fields cover contact name, estimated property/unit scale, property type/use, executive apartments, voluntary rent roll, occupancy, management method/software, spreadsheet/WhatsApp dependency, payment and maintenance processes, staff structure, security infrastructure, financial/operational/management/security frustrations, objective and selected plan. No tenant PII, identity documents or payment credentials are needed.

The selected pain determines the first storyline, investigation and attention ordering. Scale and property use influence the fictional portfolio, occupiers, rent and occupancy; scale never upgrades Control into Fort Knox. Six reusable deterministic templates cover Control 40, Control 150, Control multi-property, executive apartments, Fort Knox security-conscious and Fort Knox multi-site portfolios. Custom demo scale supports 10–2,000 units and 1–20 properties. Those are demo bounds, separate from commercial plan limits.

Nine optional stories cover rent/arrears, maintenance, expenses, portfolio visibility, staff, vacancy, executive apartments, security and full Command Center. Additional scenarios can stay linked to the same prospect. Preparing another prospect clears the prior profile/link.

## Workflow demonstrations

| Story | Experience and visible outcome |
| --- | --- |
| Control | Pain-specific question and attention queue; actionable KES totals; tenancy, work and responsibility investigations; visible outcome and retained evidence without security capabilities. |
| Rent and arrears | Rent due → expected collections/ledger → deterministic overdue clock → arrears/attention → tenancy/payment history/follow-up → simulated payment → exact reconciliation/allocation → lower outstanding/overdue count → DEMO receipt and history. |
| Maintenance | Structured leaking-pipe report → priority → simulated management notification → triage → assignment → contractor quotation → approval → IN PROGRESS → completion/cost/before-after evidence → verification → close and retained history. |
| Expense accountability | Critical pump KES 18,000 request links problem, inspection, requester, responsible person, contractor, quotation and approver to final cost and synthetic invoice/receipt/completion evidence. No transfer or real invoice occurs. |
| Vacancy | Unit B14, hierarchy, previous tenancy end, 37 vacant days, rent, transparent rent × days / 30 exposure estimate and lease expiries; assign viewing/readiness review and update priority. No occupancy guarantee. |
| Staff | Named person, assignment, assigned time, deadline, overdue status, escalation, completion evidence and completion approver. |
| Executive apartments | Fragmentation-first question; structured service request connects tenant experience, management, repair, approval, expenditure, evidence and service status. |
| Fort Knox | Control operations plus explicitly simulated 02:14 AM event, property/location/camera source, duty supervisor, notification, incident/evidence, investigation, escalation, resolution and retained audit. No actual CCTV telemetry is represented. |
| Portfolio / full | Combined operational picture prioritized around consequential problems, with direct investigation and action; no forced sequence of dashboard pages. |

The default 150-unit Control benchmark is KES 2,800,000 expected, KES 2,300,000 collected, KES 500,000 outstanding, 17 overdue tenancies, 94% occupancy, six open maintenance issues and two approvals. The first five high-impact balances total KES 180,000. Settling A01 changes outstanding to KES 464,000 and overdue count to 16. All are fictional deterministic demo values, labelled DEMO DATA. Six months of patterns and historical payment/maintenance context are included.

Semantic statuses have explicit text and icons as well as color. NEW presents PENDING; APPROVAL_REQUIRED presents AWAITING APPROVAL; active, successful, overdue and critical states remain distinguishable. The responsive interface supports light/dark themes, accessible control names, keyboard focus/actions, error/loading/conflict handling and visible status announcements. Large amounts remain dominant and actionable.

## Reset and isolation

Reset reconstructs only the selected SalesDemoSession snapshot from its stored profile. Repeated resets yield identical starting business data; command replay is idempotent. Revision/generation and append-oriented sales/audit history remain outside that reset. Real organizations and real pilot records are never reset.

Demo commands accept synthetic `demo-*` resource identifiers; live ObjectIds cannot target domain objects. Seller scope is checked on every load/mutation. Control security actions fail server-side even if a client forges them. The simulation never calls providers or inserts Payment, RentCharge, Notification, SubscriptionInvoice, OrganizationSubscription, Camera or real Incident records. It cannot contribute fictional rent or MRR/ARR to existing live BI queries. Client development demo interception cannot impersonate the privileged sales APIs.

Pilot records are a prospect's actual private workspace, not copied demo data. A pilot grant does not create paid status, a real invoice, subscription or external checkout. Operational integrations are suppressed until verified commercial ACTIVE, while normal account verification and intended commercial activation continue through existing controls. SUPER_ADMIN sales intelligence reads are audited and sent with Cache-Control: no-store.

## Guided pilot and activation

After a demonstrated outcome, the CTA completes/offers the demo and prepares a workspace for an existing verified non-admin owner. The default duration comes from centrally validated `GUIDED_PILOT_DAYS=14`; SUPER_ADMIN may deliberately choose 1–60 days. Repeated creation is idempotent. Additional scenarios for the same prospect resume the existing owner-bound pilot without extending expiry or creating another organization; a different owner is rejected.

`/pilot` guides workspace → property → units → tenancies/opening balances → staff invitation → first actual arrears/vacancy insight → existing core action → operational activation. Readiness derives from seven actual checks: configured organization, property, units, tenancies, ledger, staff invited/assigned and a completed core workflow. Account creation is insufficient. The operational milestone is recorded once and does not grant paid activation.

The value summary uses actual scoped units, tenancies, ledger entries, confirmed payment events, maintenance workflows/completions, approved requests, staff-authored audit actions, resolved attention items and insight reviews. Fort Knox can additionally show actual incidents recorded in that workspace. No ROI or savings are fabricated.

The commercial CTA continues through the existing selected plan, versioned agreement/signature, invoice, prepaid checkout and server-verified payment. HTTP E2E exercises this entire transition. Paid conversion requires retained verified activation evidence and a subscription. Subsequent cancellation does not erase historical paid conversion and cannot restore a pilot grant. Retention requires a paid invoice for a subsequent service period.

## Bulk import

Download the supplied CSV template, upload, validate, inspect preview/errors/duplicates, then explicitly confirm the exact SHA-256-bound rows. Supported fields include property/type/address, building, floor/level, unit/type, rent, new tenant names/phone, tenancy dates, deposit obligation and opening balance, with integer KES cents.

Server validation rejects malformed fields, hierarchy inconsistencies, duplicate units/phones, existing property codes and existing global identities. Confirmation revalidates current records, dates, permissions, expiry, preview digest and plan capacities, and serializes concurrent import checks. Errors roll back the entire transaction. Retry of an already imported digest is idempotent. Imported users remain unverified and use existing controlled OTP onboarding. Deposit metadata does not fabricate a deposit receipt or payment.

Verified a 300-unit batch and capacity-failure rollback. Limit: 500 rows per batch; new properties/new identities only. Existing property expansion, attaching existing tenant accounts, future leases and historical ended leases use existing controlled workflows. XLSX import is not added.

## SUPER_ADMIN sales intelligence and value events

`/sales-intelligence` shows demo runs, prospect pain/template/plan cohorts, completed demos, offered/started pilots, actual onboarding readiness and next action, activation milestones, commercial state/blockers, verified paid conversion and evidenced paid renewal. Demo → pilot and pilot → paid rates use the same prospect cohort. Attribution follows the prospect's latest demo profile; it is an association, not proof of causation. Repeated value events are deduplicated by prospect.

Meaningful events include arrears exposure, tenancy investigation, reconciled simulated payment, approval, maintenance resolution, vacancy exposure/action, staff escalation/completion, security detection/investigation/escalation/resolution, evidence retrieval, demo completion, pilot offer/start, actual insight review and activation milestone. Reset generations remain visible. List/history results are bounded; recent session evidence shows the last 100 events, with retained database history.

## Model, index, API and configuration changes

| Area | Change |
| --- | --- |
| Collections | New SalesDemoSession and SalesValueEvent; no duplicated operational collections. |
| Existing models | SalesLead optional contact/discovery/seller/pilot fields; Organization guidedPilot metadata; MaintenanceRequest optimistic concurrency. Public demo-request validation still requires its existing contact fields. |
| Indexes | Sales sessions seller/created time and lead lookup; sales events unique sessionId+commandId (`sales_demo_command_unique`) and lead/time; Organization partial unique `guided_pilot_demo_unique` and `guided_pilot_lead_unique`. |
| Sales API | GET catalog/list/view; POST prepare/commands/pilot; GET owner/admin pilot progress; POST actual insight review and import preview/confirm. Paths live under `/api/v1/sales`. |
| Platform API | GET `/api/v1/platform-control/sales-intelligence`, SUPER_ADMIN-only. |
| Contract | Strict Zod validation, revision/key conflicts, scope/plan denial, pilot expiry, import digest and confirmation. OpenAPI includes request schemas. |
| Frontend | `/sales-demo`, `/pilot`, `/sales-intelligence`, typed clients/DTOs, strict CSV parsing and semantic status component. |
| Environment | Backend `GUIDED_PILOT_DAYS`, integer 1–60, default 14. No production credential or provider setting added. |
| Scripts / CI | Add `sales:create-indexes`, `verify:sales-demo`, sales E2E suite and browser CI gate. Release certification uses `node --import tsx` and checks additional sales contracts. No dependencies added. |

Deploy through the existing release process with MongoDB replica-set transactions, active Control/Fort Knox plans and seeded existing roles/permissions. Run `npm --prefix apps/backend run sales:create-indexes` once for the intended deployment; it only adds the required indexes and does not synchronize/drop existing indexes. Production demo/pilot mutations fail closed if required uniqueness indexes are missing. Delegated sellers need an explicit permission assignment. No per-meeting engineering/reseed work is required.

## Tests and exact quality results

| Command / check | Result |
| --- | --- |
| Root `npm run typecheck` | PASS: backend and frontend strict TypeScript. |
| Root `npm run lint` | PASS, zero errors; 432 backend and 27 frontend warnings under the existing configured policy. Not warning-free. |
| Root `npm test` backend | 65 suites / 348 tests passed. Six opt-in E2E suites / 141 tests skipped in this command, then executed separately below. |
| Root `npm test` frontend | 24 suites / 121 tests passed. |
| Backend `npm run test:e2e` | Six suites / 141 tests passed, including all 13 new sales/conversion tests. |
| New backend policy suite | 36 tests, including parameterized deterministic templates/story selections. |
| New frontend contract suite | 11 tests, including semantic states, route access and strict CSV/template parsing. |
| Root `npm run build` | PASS: backend tsc and optimized Next.js production build with production URL and development bypass/demo flags disabled. |
| Root `npm run certify:release` | CERTIFIED_STATIC: 36 route files, 155 permissions, 10 critical paths. This is static release certification, not approval for live money or CCTV. |
| Frontend `npm run verify:sales-demo` | PASS: real authenticated Control payment/maintenance/evidence/reset → pilot validation/import; Fort Knox operations/security/evidence/investigation/escalation/resolution; sales intelligence. |
| Sales browser critical-view checks | Desktop 1440×1000, tablet 834×1112, mobile 390×844; light/dark; keyboard focus/action; named visible controls; no horizontal viewport spill; zero page errors. |
| Existing `npm run verify:platform-business` | PASS: SUPER_ADMIN password/email/SMS, partial-flow bypass denial/logout, plan comparison/filter, retained Morning Brief and organization drill-down; desktop/mobile. |
| Git whitespace/diff review | `git diff --check` and staged equivalent passed; full tracked/new change inventory reviewed. |

New coverage tests deterministic templates/personalization, pain ordering, Control/Fort Knox capabilities, exact financial changes, maintenance transitions/cost guards, security evidence, reset isolation/idempotency, seller/owner/org access, privileged MFA denial, command concurrency and audit rollback, provider suppression including callbacks/refunds/settlement/SMS, live metric exclusion, pilot duration/expiry/resumption, import validation/digest/replay/300-unit/capacity rollback, actual insight review/staff/workflow readiness, existing signed commercial activation, historical paid conversion and paid-renewal retention.

Test execution used private local fixture data and placeholder test secrets, ephemeral browser passwords/private MFA delivery, local Mongo replica sets and Chrome headless shell. Unix sockets are denied in this runner; test-only Mongo uses `--nounixsocket`, and the local browser used an explicit single-process flag. No security assertion was removed or weakened. Launches lacking required environment configuration were rejected by the existing startup guard; configured runs above passed.

## Security findings and remaining limitations

No unresolved critical security defect was identified in the reviewed change and exercised paths. The simulator has no production integration capability. Existing authorization, live MFA sessions, transaction/audit atomicity, synthetic identifiers, plan guards, owner checks, replay/revision checks, provider suppression and live metric exclusion were exercised. No secrets, real prospect private information, production keys, generated browser artifacts or unrelated files are part of the commit.

This is source-code delivery to the existing branch; it does not deploy the release or approve live payment/CCTV infrastructure. Existing production infrastructure/provider/contract approval gates still apply. Production-scale load and independent penetration testing are not performed here. Browser checks cover critical names, keyboard, responsive state and themes; they are not a formal WCAG certification.

Demo security/evidence uses clearly labelled fictional telemetry, text records and checksums, not a real CCTV feed or real before/after property photos. History uses a fixed deterministic scenario date. Imported balances are owner-confirmed opening data, not reconstructed historical payments. Unpaid pilots suppress operational external integrations; meaningful first action can use existing internal maintenance/approvals. A verified owner account and configured roles/plans are required to create a pilot. CSV/import and scale bounds are documented above. Historical conversion depends on authoritative commercial evidence; missing evidence is not backfilled or invented. No occupancy, savings or ROI guarantee is made.

## Acceptance answers

| Question | Answer |
| --- | --- |
| Can a salesperson personalize around actual pain without engineering intervention? | Yes, after normal deployment/index/permission setup, through the Demo Profile, templates and reset controller. |
| Does the demo demonstrate workflows rather than screens? | Yes: quantify, investigate, act, changed outcome and retained evidence. |
| Can the prospect act and watch business state change? | Yes: payment allocation, repairs/approvals, staff/vacancy priorities and security response change server-persisted demo state. |
| Does Control create an aha moment without Fort Knox? | Yes: actionable rent exposure, service/expense/accountability and portfolio outcomes are complete Control stories. |
| Does Fort Knox create a distinct security/monitoring/evidence moment? | Yes, with explicitly simulated overnight incident, source/location, response and retained evidence. |
| Can it transition directly into a guided activation pilot? | Yes, bound to a verified owner and existing commercial activation controls. |
| Are demo/production data and integrations strongly isolated? | Yes: separate snapshot/event persistence, scoped synthetic commands, server provider suppression and metric-isolation tests. |
| Can SUPER_ADMIN measure demo → pilot → activation → paid conversion? | Yes, plus pain/template/plan/value cohorts, blockers and evidenced paid renewal. |

## Added files

- `apps/backend/scripts/create-sales-indexes.ts`
- `apps/backend/scripts/serve-sales-demo-test.ts`
- `apps/backend/src/database/models/SalesDemoSession.ts`
- `apps/backend/src/modules/maintenance/maintenance.transitions.ts`
- `apps/backend/src/modules/sales/guided-pilot.service.ts`
- `apps/backend/src/modules/sales/pilot-import.service.ts`
- `apps/backend/src/modules/sales/pilot-safety.ts`
- `apps/backend/src/modules/sales/sales-demo.controller.ts`
- `apps/backend/src/modules/sales/sales-demo.engine.ts`
- `apps/backend/src/modules/sales/sales-demo.openapi.ts`
- `apps/backend/src/modules/sales/sales-demo.repository.ts`
- `apps/backend/src/modules/sales/sales-demo.schemas.ts`
- `apps/backend/src/modules/sales/sales-demo.service.ts`
- `apps/backend/src/modules/sales/sales-demo.types.ts`
- `apps/backend/src/modules/sales/sales-indexes.ts`
- `apps/backend/tests/e2e/sales-demo.e2e.test.ts`
- `apps/backend/tests/helpers/mongo-runtime.ts`
- `apps/backend/tests/unit/sales-demo.test.ts`
- `apps/frontend/scripts/verify-sales-demo.mjs`
- `apps/frontend/src/app/(dashboard)/pilot/page.tsx`
- `apps/frontend/src/app/(dashboard)/sales-demo/page.tsx`
- `apps/frontend/src/app/(dashboard)/sales-intelligence/page.tsx`
- `apps/frontend/src/components/sales/demo-status.tsx`
- `apps/frontend/src/components/sales/guided-pilot-workspace.tsx`
- `apps/frontend/src/components/sales/sales-demo-controller.tsx`
- `apps/frontend/src/components/sales/sales-intelligence.tsx`
- `apps/frontend/src/lib/data/pilot-import.ts`
- `apps/frontend/src/lib/data/sales-demo.test.ts`
- `apps/frontend/src/lib/data/sales-demo.ts`
- `apps/frontend/src/lib/data/sales-demo.types.ts`
- `docs/SALES_DEMO_AUDIT.md`
- `docs/SALES_DEMO_RELEASE_REPORT.md`
- `docs/SALES_RUNBOOK.md`

## Modified files

- `.github/workflows/quality.yml`
- `apps/backend/.env.example`
- `apps/backend/package.json`
- `apps/backend/scripts/certify-release.ts`
- `apps/backend/scripts/run-e2e.mjs`
- `apps/backend/src/config/env.ts`
- `apps/backend/src/core/api/openapi.ts`
- `apps/backend/src/core/authorization/authorization.service.ts`
- `apps/backend/src/core/authorization/resource-scope.service.ts`
- `apps/backend/src/core/billing/entitlement.service.ts`
- `apps/backend/src/core/integrations/dispatcher.ts`
- `apps/backend/src/core/types/auth.ts`
- `apps/backend/src/database/models/MaintenanceRequest.ts`
- `apps/backend/src/database/models/Organization.ts`
- `apps/backend/src/database/models/SalesLead.ts`
- `apps/backend/src/middleware/auth.middleware.ts`
- `apps/backend/src/modules/billing/billing.service.ts`
- `apps/backend/src/modules/finance/finance.service.ts`
- `apps/backend/src/modules/finance/refund.service.ts`
- `apps/backend/src/modules/integrations/integration.service.ts`
- `apps/backend/src/modules/maintenance/maintenance.service.ts`
- `apps/backend/src/modules/permissions/permission.catalog.ts`
- `apps/backend/src/modules/platform-control/platform-control.routes.ts`
- `apps/backend/src/modules/sales/sales.routes.ts`
- `apps/backend/src/modules/security/security.service.ts`
- `apps/backend/tests/e2e/finance.transaction.e2e.test.ts`
- `apps/backend/tests/security/launch-readiness.api.test.ts`
- `apps/backend/tests/security/platform-business.api.test.ts`
- `apps/backend/tests/security/platform-monitoring.api.test.ts`
- `apps/backend/tests/unit/camera-switch.test.ts`
- `apps/backend/vitest.config.ts`
- `apps/frontend/package.json`
- `apps/frontend/src/lib/api.ts`
- `apps/frontend/src/lib/navigation.ts`
- `docs/API_SPECIFICATION.md`
- `docs/ARCHITECTURE.md`
- `docs/CODEX_EXECUTION_TRACKER.md`
- `docs/DATABASE_DESIGN.md`
- `docs/DEVELOPMENT_ROADMAP.md`
- `docs/FEATURES.md`
- `docs/ROLES_PERMISSIONS.md`
- `docs/SECURITY.md`
- `docs/TESTING_STRATEGY.md`
