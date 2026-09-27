# Property Management Command Center - Codex Execution Tracker

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
