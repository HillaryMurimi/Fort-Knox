# Property Management Command Center --- Architecture

## 1. Architectural Goals

The architecture must support: - Multi-organization property
portfolios. - Strong server-side authorization. - Auditable business
operations. - Replaceable third-party integrations. - Real
payment/CCTV/notification/storage providers. - Incremental scaling. -
Testability. - Reliable financial and security workflows. - A premium
React command-center frontend.

Initial implementation is a modular monolith. Do not prematurely split
business domains into microservices. Modules must nevertheless have
explicit boundaries so high-load capabilities can later be extracted.

## 2. Repository

``` text
property-command-center/
├── AGENTS.md
├── README.md
├── .env.example
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
├── docs/
│   ├── MASTER_CONTEXT.md
│   ├── ARCHITECTURE.md
│   ├── FEATURES.md
│   ├── ROLES_PERMISSIONS.md
│   ├── DATABASE_DESIGN.md
│   ├── API_SPECIFICATION.md
│   ├── SECURITY.md
│   ├── CCTV_ARCHITECTURE.md
│   ├── TESTING_STRATEGY.md
│   └── DEVELOPMENT_ROADMAP.md
├── apps/
│   ├── backend/
│   └── frontend/
├── packages/
│   ├── shared-types/
│   ├── validation/
│   ├── permissions/
│   └── config/
└── infrastructure/
    ├── docker/
    ├── nginx/
    ├── monitoring/
    └── deployment/
```

## 3. Backend Structure

``` text
apps/backend/
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   ├── core/
│   │   ├── errors/
│   │   ├── http/
│   │   ├── logging/
│   │   ├── pagination/
│   │   ├── response/
│   │   └── types/
│   ├── middleware/
│   ├── database/
│   │   ├── models/
│   │   ├── repositories/
│   │   ├── indexes/
│   │   └── seed/
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── roles/
│   │   ├── permissions/
│   │   ├── organizations/
│   │   ├── properties/
│   │   ├── buildings/
│   │   ├── floors/
│   │   ├── units/
│   │   ├── tenants/
│   │   ├── tenancies/
│   │   ├── onboarding/
│   │   ├── move-outs/
│   │   ├── payments/
│   │   ├── rent/
│   │   ├── arrears/
│   │   ├── service-charges/
│   │   ├── expenses/
│   │   ├── financial-reports/
│   │   ├── maintenance/
│   │   ├── contractors/
│   │   ├── inspections/
│   │   ├── inventory/
│   │   ├── cctv/
│   │   ├── cameras/
│   │   ├── security-events/
│   │   ├── incidents/
│   │   ├── documents/
│   │   ├── media/
│   │   ├── evidence/
│   │   ├── notifications/
│   │   ├── announcements/
│   │   ├── messaging/
│   │   ├── reports/
│   │   ├── analytics/
│   │   ├── property-health/
│   │   ├── intelligence/
│   │   ├── audit/
│   │   ├── subscriptions/
│   │   ├── billing/
│   │   ├── feature-flags/
│   │   └── admin/
│   ├── integrations/
│   │   ├── payments/
│   │   ├── notifications/
│   │   ├── storage/
│   │   ├── streaming/
│   │   └── maps/
│   ├── events/
│   ├── jobs/
│   ├── routes/
│   └── utils/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── authorization/
│   ├── security/
│   └── e2e/
└── scripts/
```

A feature module should normally contain its
route/controller/service/repository/model/schema/types/policies/events/tests
as appropriate.

## 4. Request Flow

Typical synchronous request:

``` text
Client
  ↓
Edge / reverse proxy
  ↓
Express middleware
  ↓
Authentication
  ↓
Authorization + scope resolution
  ↓
Validation
  ↓
Route
  ↓
Controller
  ↓
Domain service
  ↓
Repository / provider abstraction
  ↓
MongoDB / external provider
  ↓
Domain event / audit
  ↓
Response
```

Controllers translate HTTP to application calls. Business rules belong
in services/domain policies. Repositories encapsulate persistence
queries. Vendor integrations implement provider interfaces.

## 5. Multi-Tenancy

Use an organization-centric tenancy model. Organization-scoped documents
should carry `organizationId` where appropriate.
Property/building/unit-scoped resources must also be constrained through
their ownership chain.

Never trust `organizationId`, `propertyId`, `buildingId`, or `unitId`
merely because the client submitted it. Resolve accessible scope from
the authenticated principal and verify resource membership server-side.

Use compound indexes beginning with `organizationId` for high-volume
organization-scoped queries when query patterns justify them.

## 6. Authorization Architecture

Create a reusable authorization service/policy layer.

Conceptual input:

``` ts
authorize({
  principal,
  permission: "maintenance.approve",
  resource,
  scope,
  context
})
```

Evaluation should account for: - Account state. - Organization
membership. - Role. - Permission. - Property/building assignment. -
Resource ownership/relationship. - Feature entitlement. - Step-up
authentication when required. - Resource state/business invariants.

Never encode authorization only as UI conditions.

## 7. Integration Boundary

Business services depend on interfaces, not vendor SDKs.

``` text
PaymentProvider
├── MpesaPaymentProvider
├── PaystackPaymentProvider
└── BankPaymentProvider

NotificationProvider
├── SmsProvider
├── EmailProvider
├── PushProvider
└── FutureWhatsAppProvider

StorageProvider
├── S3StorageProvider
└── CloudinaryStorageProvider

StreamingProvider
├── WebRtcGatewayProvider
└── VendorGatewayProvider
```

Vendor webhook payloads are normalized into internal events before
business logic consumes them.

## 8. Event Architecture

Use domain/application events for side effects that should not be
tightly coupled to HTTP controllers.

Examples: - `TenantPreRegistered` - `OtpVerified` - `TenancyActivated` -
`MaintenanceCreated` - `MaintenanceApprovalRequired` -
`MaintenanceApproved` - `PaymentReceived` - `PaymentReconciled` -
`SecurityEventCreated` - `IncidentEscalated` - `TenantMovedOut`

Use a durable queue when delivery must survive process restarts. The
initial in-process event bus may be acceptable for non-critical local
development, but production-critical notifications/webhook processing
should migrate to durable jobs.

## 9. Financial Consistency

Store authoritative monetary amounts as integer minor units unless a
documented currency-specific decimal strategy is required.

Payment webhooks: 1. Authenticate/verify provider message. 2. Persist
provider event ID. 3. Enforce idempotency. 4. Normalize event. 5.
Reconcile against expected payment/account. 6. Persist financial records
atomically where possible. 7. Emit business event. 8. Return
provider-appropriate acknowledgement.

Never mark payment successful based solely on a frontend callback.

Paystack amounts cross the provider boundary in currency minor units.
The shared `core/money/money.ts` conversion validates currency precision and
safe integer limits at the Paystack boundary. This does not migrate the legacy
major-unit financial fields. Do not enable a new operating currency until
those fields, reports, provider rails, and historical records are converted
and verified together.
Organizations now have a typed regional profile with KE/KES defaults. Locale
and IANA time zone can be changed independently of financial identity;
currency and country cannot yet be edited through the product API. Saved
display preferences do not convert stored amounts or change provider routing.
The operational finance API now rejects non-KES writes at validation while the
legacy ledger remains in place. Allocation must match payment and charge
currencies, including the provider-confirmation path. This is a migration
guard, not a multi-currency implementation.
PMCC verifies the signed `charge.success` payload, transaction reference,
amount, and currency before applying a payment. M-Pesa success callbacks
must match the server-initiated amount and KES currency before allocation.
Manual and provider payment confirmation now re-read payment and charges in a
MongoDB transaction. Allocations, charge balances, payment status, and the
confirmation audit entry commit together. Duplicate provider confirmation is
idempotent. These paths require a replica-set or sharded MongoDB deployment;
standalone MongoDB cannot confirm payments. Ledger reversal uses a separate
transaction for charge balances, payment status, and audit, preserving the
original allocations as history. It does not issue a provider refund. Other
financial workflows are not yet covered by these transaction boundaries.
Paystack refund requests use a separate `PaymentRefund` record. The request
and its audit commit before the external POST; an ambiguous provider response
is quarantined as `SUBMISSION_UNKNOWN` rather than retried. Status updates
are checked against the expected integer-minor-unit amount and currency and
audited transactionally. Provider `PROCESSED` is not a rent-ledger reversal.
The Finance review UI separates provider status from the ledger marker. A
supervised action re-fetches `PROCESSED` status and reverses the full allocation
with the refund marker and audit in one transaction; the generic Paystack
reversal path is blocked. Refund lists use organization and assigned-unit scope.
Ambiguous submissions can be linked only by fetching a dashboard refund ID and
matching its Paystack transaction ID to a freshly verified PMCC payment. A
review note and provider status change commit with audit in one transaction;
no recovery path issues a second refund POST or changes the rent ledger.
M-Pesa operator-credential reversal and settlement correction are not yet
automated.

This adapter handles operational property payments. Platform subscription
billing remains a separate boundary because Paystack recurring billing
requires an initial customer authorization and provider plan code before a
subscription can become active.

Domain events are appended through `EventStore`, which allocates an aggregate
sequence using the existing unique aggregate/version index and retries
concurrent version collisions outside transactions. Events carry schema
version, source, actor and correlation fields. With a MongoDB session, append
uses the caller's transaction and treats a version collision as a conflict
that aborts the write. Manual/provider payment confirmation and payment
reversal now append their events atomically with balances and audit. Other
publishers do not gain atomicity automatically. This is not yet a complete
transactional outbox: durable delivery, consumer checkpoints, replay, and
backfill remain open.
Scoped event and audit-log reads require `audit.view` and restrict
non-portfolio members to records carrying an allowed unit ID. Older records
without unit scope remain visible only to portfolio-wide viewers until a
validated backfill is planned.

## 10. Frontend Architecture

``` text
apps/frontend/src/
├── app/
├── assets/
├── components/
│   ├── ui/
│   ├── layout/
│   ├── navigation/
│   ├── forms/
│   ├── tables/
│   ├── charts/
│   ├── maps/
│   ├── property/
│   ├── maintenance/
│   ├── finance/
│   ├── security/
│   └── cctv/
├── features/
│   ├── auth/
│   ├── landlord/
│   ├── caretaker/
│   ├── tenant/
│   ├── contractor/
│   ├── admin/
│   ├── properties/
│   ├── maintenance/
│   ├── finance/
│   ├── security/
│   ├── cctv/
│   └── intelligence/
├── pages/
├── hooks/
├── lib/
├── services/
├── api/
├── stores/
├── schemas/
├── types/
├── animations/
├── permissions/
├── constants/
└── utils/
```

Use feature-oriented composition. Keep generic UI primitives separate
from domain components.

## 11. Observability

Production readiness should include: - Structured JSON logs. -
Request/correlation IDs. - Actor IDs when safe. - Audit events for
privileged actions. - Metrics for HTTP latency/error rate. - Queue
metrics. - Payment webhook/reconciliation metrics. - Notification
delivery metrics. - CCTV gateway health. - Database health. - Alerting
hooks.

Do not log OTPs, passwords, access tokens, refresh tokens, sensitive
media URLs, or excessive PII.

## 12. Deployment

Target containerized deployment: - Reverse proxy/load balancer. -
Backend instances. - Frontend/static delivery. - MongoDB/managed
MongoDB. - Redis/queue infrastructure when introduced. - Object/media
storage. - Streaming gateway isolated from core API. - Secret
manager/environment injection. - Centralized monitoring/logging.

Use health/readiness endpoints and graceful shutdown.
