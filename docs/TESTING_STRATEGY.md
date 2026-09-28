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

-   Charge generation idempotent.
-   Payment webhook verified.
-   Duplicate webhook idempotent.
-   Payment allocation.
-   Manual and provider allocation commit or roll back with balances, payment status, and audit on a replica set.
-   Duplicate provider confirmation creates no additional allocation or audit record.
-   Reversal restores balances exactly once, retains allocations, rejects incomplete history, and rolls back when audit fails.
-   Refund request submits once, verifies original provider ownership and amount, rejects unauthorized or unsupported payments, quarantines ambiguous submissions, and accepts only signed matching refund events. Provider status changes must leave rent balances unchanged.
-   New non-KES operational finance writes rejected until ledger migration.
-   Cross-currency manual/provider allocation rejected before balance updates.
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
