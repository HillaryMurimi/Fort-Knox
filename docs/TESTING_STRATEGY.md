# Property Management Command Center --- Testing Strategy

## 1. Goal

Tests must prove business behavior, authorization boundaries,
integration contracts, and critical workflows---not merely increase
coverage percentages.

Primary tools: - Vitest. - Supertest. - `mongodb-memory-server` or an
isolated test MongoDB where appropriate. - Frontend component testing
tooling selected during frontend setup. - Browser E2E framework selected
during frontend phase.

## 2. Test Layers

### Unit

Pure: - Validators. - Permission policies. - State machines. - Financial
calculations. - Health-score calculations. - Utility functions. -
Provider adapters with mocked transport.

### Integration

-   Service + repository + MongoDB.
-   Express route + middleware + service.
-   Transactional workflows.
-   Index/uniqueness behavior.
-   Event handlers.

### Authorization

Dedicated adversarial tests for every sensitive module.

### Security

-   OTP abuse.
-   Token/session invalidation.
-   Rate limiting.
-   Upload validation.
-   Webhook verification.
-   Cross-tenant access.
-   CCTV access.

### E2E

Critical user journeys through frontend/API.

## 3. Backend Critical Suites

### Authentication

-   OTP request accepted.
-   OTP stored hashed.
-   Expired OTP rejected.
-   Incorrect OTP attempt counted.
-   Reused OTP rejected.
-   Rate limit works.
-   Disabled user cannot authenticate.
-   Session revocation works.
-   Step-up expires according to policy.

### Authorization

-   Tenant A cannot access Tenant B.
-   Tenant cannot mutate assigned unit.
-   Caretaker cannot access another building.
-   Caretaker cannot retrieve landlord-only financials.
-   Contractor cannot access unrelated job.
-   Manager cannot escape assigned properties.
-   Landlord cannot access another organization.
-   Super Admin privileged action is audited.
-   Feature entitlement blocks unavailable feature.
-   Direct API calls cannot bypass hidden UI.

### Property

-   Organization scoping.
-   Duplicate unit constraints.
-   Archive preserves historical references.
-   Passport aggregates authorized history correctly.

### Tenant lifecycle

-   Pre-registration.
-   Correct unit binding after OTP.
-   Unknown number creates controlled access request.
-   Approval creates safe association.
-   Move-out ends tenancy.
-   Unit vacancy transition.
-   History preserved.
-   Access reduced/revoked.

### Maintenance

-   Tenant request auto-attaches correct unit.
-   Invalid state transitions rejected.
-   Assignment scoped.
-   Quote recorded.
-   Threshold requires approval.
-   Unauthorized approval rejected.
-   Actual cost/invoice recorded.
-   Verification/closure.
-   Timeline/audit complete.

### Finance

-   Transitional rent-ledger minor fields must match legacy major values, and mismatches must abort confirmation before allocation writes. New manual/provider allocations and charge balance updates must write both representations; historical rows lacking minor fields must remain readable until backfilled.

-   Charge generation idempotent.
-   Payment webhook verified.
-   Duplicate webhook idempotent.
-   Payment allocation.
-   Manual and provider allocation commit or roll back with balances, payment status, and audit on a replica set.
-   Payment confirmation/reversal events share the finance transaction, advance aggregate sequence once, and roll back ledger and audit if event append fails; duplicate provider confirmation emits no second event.
-   Payment event delivery jobs share the finance transaction; outbox insert failure rolls back payment state. The worker refuses cross-organization jobs, projects payment activity once, and replay leaves the projection and ledger unchanged while recording an audit.
-   A unit-scoped `audit.view` member cannot read payment events or audit logs for another unit or unscoped legacy records.
-   Duplicate provider confirmation creates no additional allocation or audit record.
-   Reversal restores balances exactly once, retains allocations, rejects incomplete history, and rolls back when audit fails.
-   Refund request submits once, verifies original provider ownership and amount, rejects unauthorized or unsupported payments, quarantines ambiguous submissions, and accepts only signed matching refund events. Provider status changes must leave rent balances unchanged.
-   Refund review respects assigned-unit and organization scope; pending refunds and the generic Paystack reversal path cannot change rent. A supervised correction requires fresh processed-provider evidence, reverses exactly once, and rolls back balances and the refund marker if audit fails.
-   Manual refund review rejects missing/foreign Paystack IDs and unauthorized reviewers, never sends another provider refund POST, and rolls back review note/status when audit fails. Needs-attention notes do not imply the provider has processed the refund.
-   New non-KES operational finance writes rejected until ledger migration.
-   Cross-currency manual/provider allocation rejected before balance updates.
-   Unsupported regional payment rails and missing settlement destinations
    must fail before contacting a provider or creating an integration attempt;
    a valid Paystack checkout must carry its organization subaccount code.
-   KES cent-value allocations and reversals must not drift; over-precise
    payment input or historical balances must fail before any ledger write.
-   Reconciliation.
-   Arrears calculation.
-   Refund/reversal state.
-   Monetary calculations exact.
-   Unauthorized financial export blocked.

The backend `npm run test:e2e` command runs the contract and finance transaction
suites against an isolated one-node MongoDB replica set. Set
`MONGOMS_SYSTEM_BINARY` to a local `mongod` executable when binary download is
unavailable. The default unit-test run skips these opt-in database suites.

### CCTV

-   Unauthorized camera denied.
-   Caretaker building scope enforced.
-   Entitlement enforced.
-   Step-up enforced for export.
-   Short-lived session generated through provider abstraction.
-   Raw RTSP credential never returned.
-   Access audited.
-   Duplicate security event deduplicated.

### Documents

-   Unauthorized upload blocked.
-   MIME/size checks.
-   Cross-organization download denied.
-   Signed access expires.
-   Sensitive download audited.

## 4. Frontend Tests

Test: - Permission-aware navigation. - Route protection UX. -
Forms/validation. - Loading/skeleton states. - Empty states. - Error
states. - Dashboard filters. - Maintenance state UI. - Approval UX. -
CCTV degraded/offline UI. - Reduced-motion support. - Responsive
critical screens.

Frontend tests do not substitute for backend authorization tests.

## 5. E2E Journeys

1.  Admin creates organization/property/building/unit.
2.  Landlord assigns manager/caretaker.
3.  Staff pre-registers tenant.
4.  Tenant verifies OTP and lands in assigned unit.
5.  Tenant creates maintenance request with evidence.
6.  Caretaker triages/assigns.
7.  Contractor quotes.
8.  Cost crosses threshold.
9.  Landlord approves.
10. Contractor completes.
11. Tenant/manager verifies.
12. Job closes and appears in passport/report.

Additional: - Rent charge → payment webhook → receipt → statement. -
Tenant move-out. - CCTV live authorization. - CCTV playback/export
step-up. - Security event → incident → resolution. - Cross-role attack
attempts.

## 6. Integration Contract Tests

Every provider adapter should have a contract suite.

Payment contract: - initiate where applicable. - parse/verify webhook. -
normalize status. - idempotency reference. - failure mapping.

Notification contract: - send. - provider ID. - transient/permanent
failure mapping.

Storage contract: - upload intent. - finalize. - signed download. -
delete/retention behavior.

Streaming contract: - live session. - playback. - export. - health.

## 7. Test Data

Use factories/builders: - Organization. - User. - Membership. -
Property/building/unit. - Tenant/tenancy. - Maintenance. - Contractor. -
Payment. - Camera/security event.

Avoid shared mutable fixtures.

## 8. CI Quality Gate

A merge should run:

``` text
typecheck
lint
unit tests
integration tests
authorization/security tests
build
```

E2E may run on merge/preview or protected branches depending on runtime.

Fail CI on: - Type errors. - Lint errors. - Failed tests. - Build
failure. - Secret detection. - Critical dependency/security policy
failures according to configured threshold.

## 9. Coverage

Use coverage as a diagnostic, not the goal. Require especially strong
branch coverage around: - Authorization. - Financial calculations. -
State transitions. - Webhook idempotency. - Tenant scope. - CCTV scope.

## 10. Regression Rule

Every production defect should receive a regression test before or
alongside the fix whenever technically feasible.

Never weaken or delete a valid security/business test simply to make a
build green.

## Landlord workflow certification

`npm --prefix apps/backend run test:e2e` now also runs `landlord-onboarding.e2e.test.ts` against a MongoDB replica set. It exercises signup/owner step-up through verified activation and property access, tenant isolation, RBAC, snapshots/PDFs, duplicate/concurrent requests, failed payments, reconciliation, renewal timing, audit rollback and Super Admin oversight. Provider responses are controlled fixtures. Unit tests verify integer pricing, interpolation, consent/hash validation, calendar billing and deterministic multipage PDFs; frontend tests verify backend resume routing and signature/reconciliation requests. GitHub Quality explicitly runs the replica-set suites. Live Paystack staging and a browser rehearsal remain deployment acceptance, not inferred from fixtures.

## Platform BI certification

New unit/security/Mongo HTTP E2E suites cover Control/Fort Knox, MRR/ARR/prepaid, verified revenue, temporal cohorts, immutable briefs, transition history, priorities, unknown telemetry and organization isolation. Frontend rendering/API tests and `npm --prefix apps/frontend run verify:platform-business` add a real password/OTP desktop/mobile journey. The browser gate is included in Quality CI. Existing tests remain unchanged; totals are recorded in the execution tracker.

## Administrator authentication certification

The actual backend E2E command now includes admin-auth.e2e.test.ts. Random code delivery is captured only in test memory/private browser IPC. Coverage proves both stages, no partial session, legacy bypass denial, expiry/replay/concurrency, throttling/lockout, notification jobs, audit rollback, revocation, RBAC and owned-session isolation. Existing domain assertions remain; their admin fixtures now represent completed privileged sessions. Browser Plan Performance verification includes both channel stages, direct-navigation bypass denial, memory-only storage and logout.


## Pain-first sales demonstration and guided pilot (2026-10-02)

Sales policy/data/status/CSV tests complement real Mongo replica-set HTTP Control/Fort Knox/reset/concurrency/rollback/isolation/pilot/import/activation/commercial-conversion coverage. verify:sales-demo runs real browser workflows at desktop/tablet/mobile in light/dark with keyboard and accessible-control checks. It uses a private isolated test server, ephemeral credentials and private MFA IPC, never production integrations. Both browser journeys are included in Quality CI.

## Landing layout regressions (2026-10-03)

`verify:landing` now covers 12 light/dark viewport cases, including 1366x600,
1920x650 and 1920x1080 desktop windows. Real DOM text ranges must fit all three
embedded dashboard metric cells. Both hero actions require separation from the
scene controls and five-point hit testing after scrolling; the control strip must
have no backdrop blur. Empty hero space must still pass pointer gestures to the
3D canvas. Existing canvas, scene, dialog, navigation, theme and
API-isolation assertions remain. `verify:cinematic-demo` additionally checks the
full dashboard across ten viewport/theme cases and square studio finance values,
while retaining aspect-ratio, role-scope and simulated-approval coverage.


## Unified status and workflow presentation (2026-10-03)

`src/lib/status.test.tsx` checks domain exceptions, all persisted lifecycle enum
values, unknown-state fallback, the original Badge API, native option values,
readable/decorative status markup, current/future/completed/blocked/failed/skipped
progression, truthful optional approval and cancellation history, and all twelve
light/dark palette contrast ratios. Vitest includes both .test.ts and .test.tsx.

`npm --prefix apps/frontend run verify:status-system` runs those tests and renders
the actual shared components into an ignored browser fixture. Edge/Playwright
checks 320/390/768/1366/1440/1920 widths in both themes: computed contrast at least
4.5:1, labels, containment/wrapping, no page overflow, mobile stacking, current
outline, muted future stages and reduced-motion/static status behavior.

Authenticated `verify:sales-demo` additionally checks overdue-to-paid semantics,
maintenance transitions and security investigation/escalation/resolution against
real state-changing workflows. `verify:platform-business` checks incident and
severity badges and computed contrast in both themes during the existing private
SUPER_ADMIN journey. Existing workflow, malformed-response, sidebar, commercial
control, isolation, keyboard and responsive assertions are retained.
