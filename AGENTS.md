# Property Management Command Center — Codex Engineering Instructions

## 1. Mission

You are working on the **Property Management Command Center (PMCC)**.

PMCC is a production-oriented, multi-tenant property operations platform. It is not a tutorial application, demo CRUD system, or generic property-management dashboard.

The system gives landlords and authorized operators centralized control over:

* Properties, buildings, floors, and units
* Tenants and tenancies
* Tenant onboarding and move-out
* Rent and payments
* Expenses and service charges
* Maintenance
* Contractors
* Inspections
* Documents and evidence
* Notifications and communication
* CCTV and security events
* Incidents and emergencies
* Staff accountability
* Audit trails
* Reports
* Property Health Scores
* Property intelligence
* Subscriptions and feature entitlements
* Platform administration

The core product principle is:

> You don't need to be everywhere. You just need to be connected to everything that matters.

The repository documentation is the durable source of truth.

---

# 2. Mandatory Context Loading

Before making architectural or implementation changes, read:

1. `docs/MASTER_CONTEXT.md`
2. `docs/ARCHITECTURE.md`
3. `docs/FEATURES.md`
4. `docs/ROLES_PERMISSIONS.md`
5. `docs/DATABASE_DESIGN.md`
6. `docs/API_SPECIFICATION.md`
7. `docs/SECURITY.md`
8. `docs/TESTING_STRATEGY.md`
9. `docs/DEVELOPMENT_ROADMAP.md`
10. `docs/CODEX_EXECUTION_TRACKER.md`

For CCTV/security work also read:

10. `docs/CCTV_ARCHITECTURE.md`

Do not implement a feature based only on a user prompt when its behavior is already specified in these documents.

Before editing:

* Inspect the existing implementation.
* Inspect related tests.
* Inspect existing types/interfaces.
* Inspect existing database models.
* Inspect existing authorization policies.
* Inspect existing provider abstractions.
* Check whether the requested functionality already partially exists.

Do not create duplicate architectures, services, models, utilities, or competing abstractions.

---

# 3. Source-of-Truth Priority

When requirements conflict, use this order:

1. Explicit current user instruction
2. Security requirements
3. `MASTER_CONTEXT.md`
4. Relevant domain specification
5. `ARCHITECTURE.md`
6. Existing implementation

If a newer approved implementation changes architecture or behavior, update the relevant documentation in the same change.

Do not silently allow documentation and implementation to diverge.

---

# 4. Repository Architecture

Expected high-level structure:

```text
property-command-center/
├── AGENTS.md
├── README.md
├── .gitignore
├── .editorconfig
├── .env.example
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
│
├── docs/
│
├── apps/
│   ├── backend/
│   └── frontend/
│
├── packages/
│   ├── shared-types/
│   ├── validation/
│   ├── permissions/
│   └── config/
│
└── infrastructure/
    ├── docker/
    ├── nginx/
    ├── monitoring/
    └── deployment/
```

Do not flatten the application into one unstructured directory.

---

# 5. Backend Technology

Backend stack:

* Node.js
* Express
* TypeScript
* MongoDB
* Mongoose
* Zod
* Vitest
* Supertest

Use strict TypeScript.

Avoid `any` unless unavoidable and documented.

Preferred request architecture:

```text
route
  ↓
middleware
  ↓
controller
  ↓
service
  ↓
repository
  ↓
model/database
```

Cross-cutting systems include:

* Authentication
* Authorization
* Validation
* Logging
* Audit
* Events
* Jobs
* Notifications
* Security
* Integrations

---

# 6. Module Architecture

Business domains belong under:

```text
apps/backend/src/modules/
```

Expected domains include:

```text
auth
users
roles
permissions
organizations

properties
buildings
floors
units

tenants
tenancies
onboarding
move-outs

rent
payments
arrears
service-charges
expenses
financial-reports

maintenance
contractors
inspections
inventory

cctv
cameras
security-events
incidents

documents
media
evidence

notifications
announcements
messaging

reports
analytics
property-health
intelligence

audit
activity

subscriptions
billing
feature-flags

admin
```

Do not create empty modules merely to make the directory tree look complete.

Create a module when implementing or preparing an immediate dependency for real functionality.

---

# 7. Controller Rules

Controllers must remain thin.

Controllers may:

* Parse validated request data.
* Access authenticated principal information.
* Call application/domain services.
* Map service results to HTTP responses.

Controllers must not contain:

* Authorization business logic.
* Database queries.
* Financial calculations.
* Complex workflow transitions.
* Vendor API calls.
* CCTV integration logic.
* Payment reconciliation logic.

---

# 8. Service Rules

Services contain business behavior.

Examples:

* Tenant onboarding.
* Tenancy activation.
* Move-out.
* Maintenance state transitions.
* Maintenance approval.
* Payment reconciliation.
* Incident escalation.
* Property Health Score calculation.

Services should depend on abstractions where external infrastructure is involved.

---

# 9. Repository Rules

Repositories encapsulate persistence operations.

Never spread arbitrary request query objects directly into MongoDB queries.

Bad:

```ts
Model.find(req.query)
```

Good:

* Validate allowed filters.
* Build explicit query.
* Apply organization scope.
* Apply resource scope.
* Apply pagination.
* Apply safe sorting.

Organization isolation must be obvious at the data-access boundary.

---

# 10. Multi-Tenant Isolation

PMCC is multi-tenant.

Organization-owned records must be scoped using `organizationId` where appropriate.

Never trust an organization ID supplied by a client simply because it is syntactically valid.

Authorization must establish that the authenticated principal belongs to or may administer the requested organization.

Resource hierarchy:

```text
Organization
    ↓
Property
    ↓
Building
    ↓
Floor
    ↓
Unit
    ↓
Tenancy
```

Every query for sensitive resources must respect the appropriate hierarchy.

---

# 11. Authorization

PMCC uses RBAC + ABAC.

Authorization combines:

```text
ROLE
+
PERMISSION
+
ORGANIZATION MEMBERSHIP
+
RESOURCE OWNERSHIP
+
PROPERTY / BUILDING SCOPE
+
ACTION
+
FEATURE ENTITLEMENT
+
RESOURCE STATE
```

Frontend permissions are UX only.

The backend is authoritative.

Never write code where hiding a button is the only protection against an operation.

---

# 12. Roles

Primary roles:

* Super Admin
* Landlord / Owner
* Property Manager
* Caretaker
* Contractor
* Tenant

Do not assume all users with the same role have identical resource scope.

---

# 13. Critical Authorization Rules

Tenant:

* Own tenancy only.
* Own unit only.
* Own payment/rent information.
* Own maintenance requests.
* Authorized documents/announcements.
* Cannot select or change assigned unit.

Caretaker:

* Assigned properties/buildings only.
* Relevant operational data only.
* No unrestricted landlord financial data.
* No unrestricted CCTV.
* Spending limits controlled by policy.

Contractor:

* Assigned jobs only.
* Minimum property information required to complete job.
* No unrelated tenant or portfolio data.

Property Manager:

* Assigned properties only unless explicitly granted broader scope.

Landlord:

* Authorized organization/portfolio only.

Super Admin:

* Platform-level capability.
* Still audited.

---

# 14. Feature Entitlements

Authorization and subscription entitlement are separate.

Example:

A landlord may have:

```text
cctv.view
```

but their organization's Control plan may not include CCTV.

The request must therefore fail because the feature entitlement is unavailable.

Do not hard-code plan checks throughout controllers.

Create a centralized entitlement system.

---

# 15. Authentication

Primary authentication:

```text
Phone Number
     ↓
OTP
     ↓
Verification
     ↓
Session
```

Requirements:

* Normalize phone numbers.
* Generate OTP securely.
* Store only OTP hash.
* Expire OTP.
* Limit attempts.
* Prevent reuse.
* Apply resend cooldown.
* Rate limit requests.
* Prevent easy account enumeration.
* Audit suspicious behavior.

Never:

* Store plaintext OTP.
* Log OTP.
* Return OTP from production APIs.
* Hard-code OTP bypasses.

Testing may use an explicitly configured test provider.

---

# 16. Sessions

Support:

* Login.
* Refresh/session continuation.
* Logout.
* Logout all.
* Session/device list.
* Session revocation.
* Account deactivation.
* Step-up authentication.

Do not store unnecessary sensitive information inside JWT claims.

---

# 17. Tenant Onboarding

Tenant onboarding must follow the documented controlled workflow.

Authorized staff pre-register:

```text
tenant
+
phone
+
organization
+
property
+
building
+
unit
```

Tenant verifies phone.

The backend automatically binds the tenant to the pre-assigned tenancy/unit.

The tenant must not manually choose a house.

Unknown phone numbers enter an access-request workflow.

---

# 18. Maintenance Workflow

Use an explicit state machine.

Primary workflow:

```text
NEW
↓
TRIAGED
↓
ASSIGNED
↓
QUOTED
↓
APPROVAL_REQUIRED
↓
APPROVED
↓
IN_PROGRESS
↓
COMPLETED
↓
VERIFIED
↓
CLOSED
```

Allow documented controlled alternate transitions.

Do not permit arbitrary status updates.

Every transition must:

* Validate current state.
* Validate actor permission.
* Validate resource scope.
* Record actor.
* Record timestamp.
* Create timeline/audit data.
* Emit relevant domain event.

---

# 19. Financial Controls

Money must not use JavaScript binary floating-point values as the authoritative representation.

Prefer integer minor units.

Example:

```text
KES 5,000.00
```

stored as:

```text
500000
```

if minor-unit precision is being used.

All financial operations must be auditable.

Never silently mutate historical payment records to correct accounting mistakes.

Use explicit adjustments/reversals.

---

# 20. Payment Architecture

Business code depends on:

```ts
PaymentProvider
```

Implementations may include:

```text
MpesaPaymentProvider
StripePaymentProvider
BankPaymentProvider
```

Never call provider SDKs directly from controllers.

Payment success must not depend on frontend claims.

Production payment confirmation comes from verified provider responses/webhooks and reconciliation.

Webhooks require:

* Verification.
* Idempotency.
* Deduplication.
* Provider event storage.
* Normalization.
* Safe retries.

---

# 21. Notifications

Use:

```ts
NotificationProvider
```

Possible channels:

* In-app
* SMS
* Email
* Push
* Future WhatsApp

Business transactions should not become corrupted because notification delivery fails.

Use events/jobs for delivery.

---

# 22. Storage

Use:

```ts
StorageProvider
```

Possible implementations:

* S3
* Cloudinary
* compatible providers

Never expose storage credentials.

Sensitive files should use controlled short-lived access.

Validate:

* MIME type.
* Size.
* Resource ownership.
* Authorization.
* Allowed content type.

Maintain malware-scanning integration readiness.

---

# 23. CCTV

Read:

```text
docs/CCTV_ARCHITECTURE.md
```

before modifying CCTV functionality.

Never send raw RTSP credentials to browsers.

Architecture:

```text
Camera / NVR
      ↓
Secure network
      ↓
Streaming Gateway
      ↓
WebRTC / browser-compatible stream
      ↓
Authenticated PMCC client
```

Every stream/playback/export request requires server authorization.

---

# 24. CCTV Audit

Audit:

* Live view.
* Playback.
* Evidence export.
* Camera management.

Include:

* Actor.
* Session.
* Camera.
* Property/building.
* Action.
* Outcome.
* Timestamp.
* Request ID.

Sensitive actions may require recent step-up authentication.

---

# 25. Audit Logs

Audit records are security/business evidence.

Normal users must not modify or delete audit records.

Audit:

* Authentication events.
* Role changes.
* Permission changes.
* Tenant onboarding.
* Tenant move-out.
* Staff assignment.
* Financial approval.
* Payment adjustment.
* Maintenance approval.
* CCTV access.
* Incident activity.
* Sensitive exports.
* Admin configuration.

Never store passwords, OTPs, access tokens, or secrets in audit metadata.

---

# 26. External Integrations

Vendor integrations belong under:

```text
apps/backend/src/integrations/
```

Examples:

```text
integrations/
├── payments/
├── notifications/
├── storage/
├── streaming/
└── maps/
```

Domain code must depend on interfaces.

Avoid vendor lock-in in core business logic.

---

# 27. Environment Configuration

All environment variables must be centrally validated at startup.

Application must fail fast when required production configuration is invalid.

Never scatter:

```ts
process.env.SOMETHING
```

through business modules.

Use centralized typed configuration.

---

# 28. Error Handling

Use typed application errors.

Examples:

```text
ValidationError
AuthenticationError
AuthorizationError
NotFoundError
ConflictError
RateLimitError
IntegrationError
```

Central middleware maps errors to safe API responses.

Production responses must not expose:

* Stack traces.
* Database internals.
* Provider secrets.
* Filesystem paths.
* Internal credentials.

---

# 29. Logging

Use structured logging.

Include where useful:

* Request ID.
* User ID.
* Organization ID.
* Resource ID.
* Event.
* Outcome.

Never log:

* OTP.
* Password.
* Access token.
* Refresh token.
* Secret.
* Raw camera credential.
* Sensitive permanent media URL.

---

# 30. API

Base path:

```text
/api/v1
```

Follow:

```text
docs/API_SPECIFICATION.md
```

Use consistent:

* Responses.
* Errors.
* Pagination.
* Filtering.
* Sorting.
* Search.
* HTTP status semantics.

Update OpenAPI whenever externally visible API behavior changes.

---

# 31. Frontend Stack

When frontend development begins, use:

* React
* TypeScript
* Tailwind CSS
* shadcn/ui
* Motion
* Lucide
* Recharts
* TanStack Table
* React Hook Form
* Zod

Do not introduce another major UI framework without explicit approval.

Avoid generic Bootstrap/admin-template aesthetics.

---

# 32. UI Philosophy

The application should feel:

* Premium.
* Calm.
* Secure.
* Precise.
* Modern.
* Expensive.
* Trustworthy.

The landlord experience is a command center.

The tenant experience is mobile-first and simple.

The management/admin experience is desktop-first but responsive.

---

# 33. Animation

Use animation intentionally.

Suitable:

* Page transitions.
* Dashboard card entrances.
* Number transitions.
* Status changes.
* Drawers.
* Dialogs.
* Notifications.
* Timelines.
* CCTV event indicators.
* Loading transitions.

Avoid animation that slows operational work.

Always respect:

```text
prefers-reduced-motion
```

---

# 34. UX States

Every significant asynchronous UI must consider:

* Initial loading.
* Skeleton.
* Empty.
* Error.
* Permission denied.
* Offline/degraded where relevant.
* Success.
* Retry.
* Partial data.

Do not leave users staring at blank screens.

---

# 35. Accessibility

Implement:

* Semantic HTML.
* Keyboard navigation.
* Visible focus.
* Accessible labels.
* Dialog focus management.
* Sufficient contrast.
* Reduced-motion support.
* Screen-reader-friendly status changes.

Do not sacrifice accessibility for visual effects.

---

# 36. Testing Requirements

Read:

```text
docs/TESTING_STRATEGY.md
```

Every business-critical feature requires tests.

At minimum test:

* Happy path.
* Validation failure.
* Authentication failure.
* Authorization failure.
* Cross-organization access.
* Resource scope.
* Relevant state transitions.
* Important edge cases.

---

# 37. Mandatory Security Tests

Never consider authorization complete until tests demonstrate:

```text
Tenant A cannot access Tenant B.

Tenant cannot change assigned unit.

Caretaker cannot access another building.

Caretaker cannot access unauthorized landlord financials.

Contractor cannot access unrelated jobs.

Manager cannot escape assigned properties.

Landlord A cannot access Landlord B's organization.

Unauthorized CCTV access is blocked.

Unauthorized CCTV playback is blocked.

Unauthorized CCTV export is blocked.

Expired OTP is rejected.

Reused OTP is rejected.

Revoked session is rejected.

Frontend manipulation cannot bypass backend authorization.
```

---

# 38. Test Integrity

Never:

* Delete a valid test merely because it fails.
* Weaken assertions to make implementation pass.
* Disable security tests.
* Mock away the behavior being tested.
* Replace a failing production path with hard-coded fake data.

Fix the underlying defect.

---

# 39. Required Quality Commands

Before declaring implementation complete, run the relevant repository commands equivalent to:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

If workspace scripts differ, use the repository's actual scripts.

Do not claim they passed unless they were actually executed successfully.

If a command cannot run, report:

* Command.
* Error.
* Likely reason.
* Remaining action.

---

# 40. Dependencies

Before adding a package:

1. Check whether an existing dependency solves the problem.
2. Determine whether the package is maintained.
3. Avoid unnecessary dependencies.
4. Install in the correct workspace.
5. Update lockfile.
6. Use the dependency rather than leaving it unused.

Do not introduce multiple libraries solving the same concern without justification.

---

# 41. Database Changes

For every new collection/schema:

Consider:

* Organization ownership.
* Validation.
* Required fields.
* Indexes.
* Unique constraints.
* Historical preservation.
* Audit requirements.
* Query patterns.
* Retention.
* Authorization implications.

Do not add indexes indiscriminately.

---

# 42. Pagination

List APIs must not return unbounded collections.

Use bounded pagination.

Set a maximum page size.

High-volume tables must support server-side filtering/sorting/search as appropriate.

---

# 43. Performance

Avoid:

* N+1 query patterns.
* Unbounded queries.
* Loading huge documents unnecessarily.
* Repeated authorization database calls where safe caching is appropriate.
* Expensive dashboard aggregation on every request without considering aggregation strategy/caching.

Optimize after establishing correctness and observable bottlenecks.

---

# 44. Transactions and Idempotency

Use MongoDB transactions when multiple writes must succeed/fail together and the deployment supports them.

Use idempotency for:

* Payment webhooks.
* External provider callbacks.
* Charge generation.
* Retryable jobs.
* Selected user commands where duplicate submission is dangerous.

---

# 45. No Fake Production Integrations

It is acceptable to implement:

```text
FakePaymentProvider
FakeNotificationProvider
FakeStorageProvider
FakeStreamingProvider
```

for automated tests/local development when explicitly named and isolated.

It is not acceptable to make production code pretend:

* A payment succeeded.
* SMS was delivered.
* CCTV is online.
* A file was uploaded.
* A push notification was sent.

Production integrations must report their real state.

---

# 46. Comments

Comments should explain:

* Why.
* Security assumptions.
* Non-obvious invariants.
* Provider quirks.
* Architectural constraints.

Do not narrate obvious code line by line.

---

# 47. Documentation

When behavior changes, update relevant documentation.

Potential files:

```text
MASTER_CONTEXT.md
ARCHITECTURE.md
FEATURES.md
ROLES_PERMISSIONS.md
DATABASE_DESIGN.md
API_SPECIFICATION.md
SECURITY.md
CCTV_ARCHITECTURE.md
TESTING_STRATEGY.md
DEVELOPMENT_ROADMAP.md
```

Documentation is part of the implementation.

---

# 48. Git Discipline

Keep changes bounded to the requested phase/feature.

Do not perform unrelated refactors during feature implementation unless necessary.

Before completion inspect:

```bash
git status
git diff
```

Check for:

* Secrets.
* Debug code.
* Generated junk.
* Accidental deletions.
* Unrelated modifications.
* `.env` files.
* Sensitive fixtures.

Do not commit unless explicitly instructed.

---

# 49. Development Phases

Follow:

```text
docs/DEVELOPMENT_ROADMAP.md
```

Current intended sequence:

```text
0. Repository and standards
1. Backend foundation
2. Authentication
3. RBAC + ABAC
4. Organizations/admin foundation
5. Properties/buildings/floors/units
6. Tenant/tenancy lifecycle
7. Maintenance
8. Contractors
9. Financial core
10. Payment integrations
11. Documents/media/evidence
12. Notifications/communication
13. CCTV/security
14. Reports/property health
15. Property intelligence
16. Frontend foundation
17. Role experiences
18. Frontend domain features
19. E2E hardening
20. Production readiness
```

Do not skip directly to later phases unless explicitly requested.

---

# 50. Coding Task Protocol

For every task:

## Step 1 — Understand

Read required documentation.

Inspect repository.

Identify dependencies and affected modules.

## Step 2 — Plan

Produce a concise implementation plan.

Identify:

* Files to create.
* Files to modify.
* Database impact.
* API impact.
* Authorization impact.
* Security impact.
* Tests required.

## Step 3 — Implement

Implement the smallest coherent production-quality change.

Do not leave TODO placeholders for functionality included in the current task.

## Step 4 — Test

Add tests.

Run relevant suites.

## Step 5 — Verify

Run:

```text
typecheck
lint
tests
build
```

## Step 6 — Review

Review the diff for:

* Authorization bypasses.
* Cross-tenant leaks.
* Sensitive logging.
* Missing validation.
* Missing indexes.
* Broken error handling.
* Race/idempotency problems.
* Unintended feature removal.

## Step 7 — Report

At completion report:

```text
IMPLEMENTED
FILES CREATED
FILES MODIFIED
TESTS ADDED
COMMANDS EXECUTED
SECURITY CONSIDERATIONS
API/DB CHANGES
REMAINING WORK
```

Do not claim functionality that was not implemented.

---

# 51. Definition of Done

A feature is not complete merely because it compiles.

It is complete when:

* Required behavior exists.
* Validation exists.
* Authorization exists.
* Scope isolation exists.
* Errors are handled.
* Audit exists where necessary.
* Tests exist.
* Typecheck passes.
* Lint passes.
* Tests pass.
* Build passes.
* Documentation is synchronized.
* No known critical security defect remains.

---

# 52. Final Rule

This repository represents a real property operations and security product.

Optimize for:

```text
correctness
security
auditability
maintainability
testability
clarity
user experience
```

before optimizing for how quickly code can be generated.

Never trade tenant isolation, financial correctness, CCTV security, or auditability for implementation convenience.
