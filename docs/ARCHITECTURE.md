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
Within the legacy KES boundary, new monetary inputs must be representable in
cents. Rent totals and manual/provider allocation and reversal arithmetic
use safe integer minor units, converting back only for the existing major-unit
schema. New rent charges, payments, and allocations now also persist integer
minor-unit fields. Payment transactions verify the two representations agree
before writing and update both together. Historical records may lack the new
fields. Reports and other collections remain on major units, so this is not
yet an authoritative minor-unit cutover. A read-only Phase A inventory command
identifies collections that require a verified backfill and cutover.
The operating rail policy currently permits only KE/KES with M-Pesa or
Paystack. Checkout rechecks the organization's regional profile and requires
an active default destination matching organization, currency and country.
Paystack rent checkout always passes its subaccount code; there is no silent
platform-account fallback. This is a guarded Kenya deployment, not broad
multi-country readiness.
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
reversal now append their events and a payment-activity delivery job atomically
with balances and audit. The jobs worker leases, retries, and dead-letters this
consumer's jobs. A unique event ID makes the payment-activity projection safe
to retry or replay; the job state is its checkpoint. Only payment confirmation
and reversal are registered. Other publishers do not gain atomicity or delivery
automatically; bulk backfill, independent consumer checkpoints, and additional
consumers remain open. The worker must be deployed alongside the API.
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

## Contract-based landlord activation

The landlord workflow extends Organization, OrganizationSubscription, SubscriptionInvoice, Document/Evidence, Paystack provider/reconciliation and transactional audit/event infrastructure. Contracts add append-only template versions and rendered organization snapshots. Signature and paid activation transactions retain immutable evidence. The one-off prepaid charge is distinct from a deferred recurring subscription, preserving later plan billing cycles. See [LANDLORD_CONTRACT_WORKFLOW.md](LANDLORD_CONTRACT_WORKFLOW.md).

## SUPER_ADMIN platform intelligence

The existing control plane now includes backend Mongo aggregation and retained PlatformBrief snapshots. It reuses organization/subscription/invoice/payment/monitoring authorities; the landlord Command Center remains organization scoped. See [SUPER_ADMIN business intelligence](SUPER_ADMIN_BUSINESS_INTELLIGENCE.md) for boundaries, queries and generation architecture.

## SUPER_ADMIN authentication

The existing auth/provider/session/notification architecture now enforces password plus one selected verified email/SMS OTP for routine login, live server-bound privileged sessions and dual-channel sensitive step-up. See [architecture, threat boundaries and operator runbook](SUPER_ADMIN_AUTHENTICATION.md).


## Pain-first sales demonstration and guided pilot (2026-10-02)

Authenticated sales sessions extend the Sales module with isolated deterministic snapshots, revisioned transactional commands and append-only sales value events. Organization guided-pilot metadata supplies a bounded grant through the existing SubscriptionPlan/EntitlementService. Existing hierarchy, maintenance, import and commercial authorities remain in use. See SALES_DEMO_AUDIT.md and SALES_RUNBOOK.md.
