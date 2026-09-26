# Property Management Command Center --- Development Roadmap

## Guiding Rule

Build vertical capability on top of a secure foundation. Do not generate
the entire platform in one uncontrolled pass.

Each phase should finish with: - Implementation. - Validation. -
Authorization. - Tests. - Documentation update. - Typecheck/lint/build
passing.

## Phase 0 --- Repository and Standards

Deliver: - Monorepo/workspace. - `AGENTS.md`. - Documentation. - Git
conventions. - Environment examples. - TypeScript config. -
ESLint/Prettier. - Test config. - Docker/local infrastructure baseline.

Exit: - Clean install. - Scripts run. - CI skeleton passes.

## Phase 1 --- Backend Foundation

Deliver: - Express app/server separation. - Environment validation. -
MongoDB connection. - Graceful shutdown. - Central errors. - Request
IDs. - Structured logging. - Helmet. - CORS. - Rate limiting. -
Health/readiness endpoints. - API response helpers. - Validation
middleware.

Exit: - Foundation integration tests pass.

## Phase 2 --- Authentication and Sessions

Deliver: - Users. - OTP challenges. - Phone normalization. - OTP
provider abstraction. - OTP request/verify. - Optional password path
scaffold. - Sessions/refresh strategy. - Logout/revoke. - Step-up
authentication foundation. - Auth audit.

Exit: - Auth/security tests pass.

## Phase 3 --- RBAC + ABAC

Deliver: - Permissions. - Roles. - Organization memberships. - Scope
assignments. - Authorization policy service. - Middleware/helpers. -
Feature-entitlement hook. - Authorization test matrix.

Exit: - Cross-role and cross-organization attacks fail safely.

## Phase 4 --- Organizations and Admin Foundation

Deliver: - Organizations. - Membership management. - Platform admin
base. - Feature flags. - Plans/subscription schema. - Admin audit.

## Phase 5 --- Property Hierarchy

Deliver: - Properties. - Buildings. - Floors. - Units. - Staff
assignment. - Archival. - Unit/property passport foundation.

## Phase 6 --- Tenant and Tenancy Lifecycle

Deliver: - Tenant profiles. - Pre-registration. - Access requests. -
Unit binding. - Tenancy. - Move-in. - Inspections foundation. -
Move-out/reconciliation workflow.

## Phase 7 --- Maintenance

Deliver: - Requests. - Categories/priorities. - State machine. -
Assignment. - Quotes. - Approval threshold policy. - Costs. -
Evidence. - Timeline. - Verification/closure. - Notifications/events.

## Phase 8 --- Contractors

Deliver: - Profiles. - Trades. - Assignment. - Quotes. - Invoices. -
Performance metrics. - Contractor-facing job scope.

## Phase 9 --- Financial Core

Deliver: - Rent charges. - Payments. - Allocations. - Arrears. - Service
charges. - Expenses. - Approval controls. - Statements. - Receipts. -
P&L/reporting foundation.

## Phase 10 --- Payment Integrations

Deliver: - `PaymentProvider`. - M-Pesa adapter. - Paystack adapter. - Webhook verification. - Idempotency. - Reconciliation. -
Provider contract tests.

Never fake production success.

## Phase 11 --- Documents, Media, Evidence

Deliver: - `StorageProvider`. - Secure upload intents. - Metadata. -
Signed access. - Resource linkage. - Evidence retention. - Access audit.

## Phase 12 --- Notifications and Communication

Deliver: - Event bus/durable job strategy. - Notification templates. -
In-app. - SMS. - Email. - Push. - Announcements. - Maintenance/job
conversation.

## Phase 13 --- CCTV and Security

Deliver: - Camera registry. - `StreamingProvider`. - Gateway
integration. - Live/playback session APIs. - Camera scope. - Step-up. -
Security event ingestion. - Incident management. - Evidence export. -
CCTV audit.

## Phase 14 --- Reports and Property Health

Deliver: - Occupancy. - Vacancy/lost revenue. - Collections. -
Arrears. - Maintenance. - Contractor. - Security. - Staff activity. -
Explainable Property Health Score.

## Phase 15 --- Property Intelligence

Deliver rule/statistical intelligence first: - Maintenance cost
anomalies. - Repeat failures. - Long vacancy. - Arrears patterns. -
Expense anomalies. - Contractor anomalies. - Security/access anomalies.

Add model-driven intelligence only where it materially improves outcomes
and remains explainable/auditable.

## Phase 16 --- Frontend Foundation

Stack: - React. - TypeScript. - Tailwind CSS. - shadcn/ui. - Motion. -
Lucide. - Recharts. - TanStack Table. - React Hook Form. - Zod.

Deliver: - App shell. - Design tokens. - Dark/light themes. -
Navigation. - Auth/session. - API client. - Permission/entitlement
helpers. - Error/loading/empty patterns. - Animation primitives. -
Accessibility baseline.

## Phase 17 --- Role Experiences

Build: - Landlord Command Center. - Manager workspace. - Caretaker
workspace. - Tenant mobile-first portal. - Contractor job portal. -
Elite Super Admin panel.

Do not simply expose the same dashboard with different hidden buttons.
Each role gets task-oriented information architecture.

## Phase 18 --- Frontend Domain Features

Build: - Property passport. - Tenant onboarding. - Maintenance command
center. - Finance. - Contractor management. - Documents/evidence. -
CCTV/security. - Reports/intelligence. - Notifications.

## Phase 19 --- End-to-End Hardening

-   Full E2E journeys.
-   Cross-role tests.
-   Accessibility.
-   Responsive behavior.
-   Performance.
-   Error recovery.
-   Observability.
-   Backups.
-   Restore drill.
-   Security review.
-   Load tests for key endpoints.
-   Streaming capacity tests.

## Phase 20 --- Production Readiness

-   Production environment.
-   Secret management.
-   CI/CD.
-   Migrations/index deployment process.
-   Monitoring/alerting.
-   Incident response.
-   Data retention.
-   Customer support tooling.
-   Payment reconciliation operations.
-   CCTV deployment runbook.
-   Rollback procedure.
-   Legal/compliance review for target markets.

## Coding-Agent Working Protocol

For every implementation task:

1.  Read `AGENTS.md`.
2.  Read `docs/MASTER_CONTEXT.md`.
3.  Read relevant domain docs.
4.  Inspect current code before editing.
5.  State/record a bounded implementation plan.
6.  Implement without removing unrelated functionality.
7.  Add/update tests.
8.  Run typecheck.
9.  Run lint.
10. Run tests.
11. Run build.
12. Review diff for authorization/data leaks.
13. Update docs if architecture/API behavior changed.
14. Summarize files changed, tests, security impact, and remaining work.

## First Coding Task After Documentation

Implement **Phase 0 + Phase 1 only**. Do not jump directly into all
business modules. A stable backend foundation will make the subsequent
generated modules substantially safer and easier to review.
