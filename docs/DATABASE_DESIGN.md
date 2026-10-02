# Property Management Command Center --- Database Design

## 1. Database Strategy

Primary database: MongoDB via Mongoose.

The schema should favor explicit references for high-value business
entities, denormalize only where read performance or immutable snapshots
justify it, and preserve historical records.

All organization-owned records should include `organizationId` unless
the entity is truly platform-global.

Use: - `createdAt`, `updatedAt`. - `createdBy`/`updatedBy` where
useful. - Archival/status fields instead of destructive deletion for
business history. - Compound indexes matching real query patterns. -
Transactions for multi-document operations that require atomic
consistency.

The existing `domain_events` collection uses a unique aggregate type/ID/version
index. Selected finance transactions now append events using the same MongoDB
session as ledger and audit writes. Registered payment events also insert a
deduplicated `Job` in that session. Event rows remain immutable business
history; `publishedAt` marks payment-activity projection completion, while
the job state is this consumer's durable checkpoint.

## 2. Identity and Access Collections

### users

-   `_id`
-   `phoneNormalized` unique where applicable
-   `emailNormalized`
-   `passwordHash` optional
-   `status`
-   `phoneVerifiedAt`
-   `emailVerifiedAt`
-   `lastLoginAt`
-   `profile`
-   timestamps

Indexes: - unique phone normalized - email normalized sparse/unique if
product policy requires

### organizations

-   `_id`
-   `name`
-   `slug`
-   `status`
-   `ownerUserIds`
-   `settings`
-   `defaultCurrency`
-   `timezone`
-   `regionalProfile` with country code, base currency, allowed currencies,
    locale, and IANA time zone. Existing records hydrate to KE/KES/en-KE/
    Africa/Nairobi; the financial identity is fixed until the ledger migration.
-   timestamps

### memberships

Represents user membership in organization. - `organizationId` -
`userId` - `roleIds` - `status` - `propertyIds` - `buildingIds` - custom
permission grants/denials if supported - timestamps

Unique: organization + user.

### roles

-   `organizationId` nullable for system role templates
-   `name`
-   `code`
-   `permissions[]`
-   `isSystem`
-   timestamps

### permissions

Optional catalog if permissions are persisted rather than
code-defined. - `code` - `resource` - `action` - description

### sessions

-   `userId`
-   `tokenFamilyId`/session ID
-   hashed refresh credential if applicable
-   device metadata
-   IP metadata as policy permits
-   assurance level
-   `stepUpVerifiedAt`
-   `expiresAt`
-   `revokedAt`
-   timestamps

### otp_challenges

-   normalized destination
-   purpose
-   `otpHash`
-   `expiresAt`
-   attempts
-   maxAttempts
-   `consumedAt`
-   request metadata
-   timestamps

TTL/index strategy should remove expired challenge data according to
retention policy.

## 3. Property Collections

### properties

-   `organizationId`
-   name
-   code
-   address
-   geo location
-   status
-   manager assignments
-   settings
-   timestamps

### buildings

-   `organizationId`
-   `propertyId`
-   name/code
-   address/geo override
-   status
-   timestamps

### floors

-   `organizationId`
-   `propertyId`
-   `buildingId`
-   name/number
-   timestamps

### units

-   `organizationId`
-   `propertyId`
-   `buildingId`
-   `floorId`
-   unit number/code
-   type
-   optional `unitTypeLabel` for organization-specific labels when type is `OTHER`
-   occupancy status
-   rent configuration
-   service charge configuration
-   metadata
-   timestamps

Recommended uniqueness: - organization/property/building + unit code.

Current implementation requires building and floor references on every unit. Guided standalone setup creates a Site building and Ground Floor compatibility hierarchy. The current `Unit.monthlyRent` is a KES asking/default rent (major-unit number), while `Tenancy.monthlyRent` preserves the agreed lease amount; historical charges derive from the tenancy, never retroactively from the unit. A future money migration to integer minor units must be coordinated across finance and existing records, not applied only to setup. Property setup writes property, buildings, floors, units and audit records in a single MongoDB transaction. `Property.metadata.structureMode` records whether the setup was presented as buildings or standalone.

## 4. Tenant and Tenancy Collections

### tenant_profiles

-   `organizationId`
-   `userId`
-   identity/contact metadata
-   emergency contact
-   status
-   timestamps

### tenant_pre_registrations

-   `organizationId`
-   phone normalized
-   property/building/unit
-   proposed tenancy metadata
-   status
-   approved/created by
-   expires if desired
-   timestamps

### access_requests

-   normalized phone
-   organization/property hints where available
-   status
-   requestedAt
-   reviewedBy
-   review reason
-   timestamps

### tenancies

-   `organizationId`
-   `tenantUserId`
-   `propertyId`
-   `buildingId`
-   `unitId`
-   start/end dates
-   status
-   rent amount minor units
-   deposit amount minor units
-   billing frequency
-   lease document IDs
-   move-in inspection ID
-   move-out inspection ID
-   timestamps

Never overwrite a historical tenancy to represent a different tenant.

## 5. Finance Collections

### rent_charges

-   organization/property/building/unit/tenancy
-   period
-   due date
-   amount minor units
-   currency
-   status
-   outstanding amount
-   timestamps

Unique/idempotent charge key should prevent duplicate monthly charges.

### payments

-   organization
-   payer/tenant
-   tenancy/unit
-   provider
-   provider transaction ID
-   amount minor units
-   currency
-   status
-   receivedAt
-   raw/normalized provider metadata with sensitive fields filtered
-   timestamps

Provider transaction ID should be unique within provider/account
context.

### payment_destinations

-   organization
-   provider (`PAYSTACK`, `MPESA`, or `CRYPTO`)
-   status (`PENDING_PROVIDER_SETUP`, `ACTIVE`, or `DISABLED`)
-   default flag, currency, and country
-   Paystack subaccount code and masked bank details
-   M-Pesa shortcode and public account reference
-   crypto asset/network/public wallet address
-   provider verification timestamp
-   creator/updater and timestamps

Only one default destination per organization/provider is allowed. API
credentials, passkeys, private keys, and complete bank account numbers are
never stored in this collection.

### domain_events

The existing `DomainEvent` collection is append-only through the application
API. `eventId` is unique; `{ aggregateType, aggregateId, version }` remains a
unique aggregate sequence. New events have `schemaVersion` (default 1),
`source`, `actorRole`, and `requestId` alongside existing correlation and
causation IDs. Existing records without these new fields remain readable;
the audit UI presents schema version 1 and application source for them.
Payment confirmation/reversal events require a transaction and atomically queue
`domain-event.payment-activity` jobs keyed by event ID. The worker projects
`payment_activities` with unique `eventId`, organization/payment/property/
building/unit references, event name, legacy major-unit amount, currency, and
event time. A platform-admin replay requeues one event without changing the
projection or ledger twice. Other event types and historical unqueued events
still require a broader delivery/backfill design.
The `jobs.dedupeKey` index must be unique and sparse. Existing databases may
hold an older non-unique index on that key and need a controlled index migration
after checking for duplicate values.

Financial collections still contain legacy major-unit Number fields. New
`rent_charges` and `payments` also store optional integer minor-unit fields;
new `payment_allocations` store `amountMinor`. Current writes populate both
representations. Transactional confirmation and reversal verify parity and
reject drift, while old rows without minor fields use validated conversion.
Reports and other finance collections still read major-unit values, so this
is a transitional dual-write contract, not a completed storage cutover. The
read-only `phase-a:inventory` command reports which target collections contain
records before a planned backfill and cutover.

### payment_allocations

-   paymentId
-   chargeId
-   amount (legacy major units) and optional amountMinor (integer minor units)
-   timestamps

### payment_refunds

The implemented `payment_refunds` collection keeps one full Paystack refund
request per payment (`paymentId` unique), organization ownership, original
transaction reference, integer minor-unit amount and currency, provider refund
ID, current provider status, requested-by actor, reason, and timestamps. New
records also snapshot property/building/unit scope and store ledger reversal
actor/time separately from provider status. The scope fields are optional for
records created before this change; older records need a controlled backfill
before unit-scoped reviewers can see them in the list. It
does not mutate or replace historical payment allocations. `SUBMISSION_UNKNOWN`
is a manual-review state, not permission to retry a provider POST.
The latest manual investigation stores reviewer, time, and a bounded note;
each review action also has an audit entry without copying the note into
audit metadata.

### expenses

-   organization/property/building
-   category
-   description
-   estimated/approved/actual amount
-   currency
-   status
-   contractor/vendor
-   invoice/document IDs
-   approval metadata
-   timestamps

### service_charges

Model definitions and/or generated charges depending on product
accounting design.

### financial_adjustments

Explicit auditable adjustments; never silently mutate financial history.

## 6. Maintenance Collections

### maintenance_requests

-   organization/property/building/unit
-   tenant/reporter
-   category
-   description
-   priority
-   emergency flag
-   status
-   assigned staff/contractor
-   estimated/quoted/approved/actual cost
-   approval metadata
-   media IDs
-   invoice IDs
-   timestamps
-   closedAt

### maintenance_transitions

Append-oriented workflow timeline: - requestId - fromStatus - toStatus -
actor - reason - metadata - timestamp

### quotes

-   maintenance request
-   contractor
-   amount
-   currency
-   line items
-   document
-   status
-   timestamps

## 7. Contractors

### contractors

-   organization
-   name/company
-   contacts
-   trades
-   status
-   documents
-   rating summary derived/cache
-   timestamps

### contractor_assignments

-   contractor
-   maintenance/job
-   assignment state
-   response timestamps
-   completion timestamps

## 8. Inspections and Inventory

### inspections

-   organization/property/building/unit/tenancy
-   type
-   checklist snapshot
-   readings
-   notes
-   media
-   inspector
-   status
-   completedAt

### assets

-   organization/property/building/unit
-   name/category
-   serial/model
-   condition
-   purchase/install date
-   warranty
-   status
-   media/documents

## 9. CCTV and Security

### cameras

-   organization/property/building
-   name
-   provider
-   provider camera ID
-   NVR/gateway reference
-   capabilities
-   status
-   sensitivity classification
-   timestamps

Never store raw vendor passwords in plaintext fields. Use a secret
manager/reference.

### security_events

-   organization/property/building/camera
-   provider event ID
-   type
-   severity
-   occurredAt
-   evidence/media
-   status
-   normalized metadata
-   timestamps

Deduplicate provider events.

### incidents

-   organization/property/building/camera optional
-   incident number
-   type/severity
-   description
-   status
-   evidence
-   related user/resource IDs
-   resolution
-   timestamps

### cctv_access_events

Append-oriented: - actor - session -
organization/property/building/camera - action - outcome -
purpose/reason if required - timestamp - metadata

## 10. Documents and Media

### media

-   organization
-   storage provider
-   object key
-   media type
-   MIME
-   size
-   checksum
-   uploader
-   resource type/id
-   sensitivity
-   scan status
-   timestamps

### documents

-   organization
-   type
-   title
-   storage/media reference
-   resource linkage
-   version
-   retention classification
-   timestamps

## 11. Notifications

### notifications

-   organization/user
-   event type
-   title/body/template key
-   channel states
-   readAt
-   timestamps

### notification_deliveries

-   notification
-   channel
-   provider
-   provider message ID
-   status
-   attempts
-   failure code
-   timestamps

## 12. Audit

### audit_logs

-   organization nullable for platform action
-   actor user
-   actor role/membership snapshot
-   action
-   resource type/id
-   property/building scope
-   outcome
-   request/correlation ID
-   IP/device metadata as policy permits
-   safe change summary
-   timestamp

Audit logs should not contain secrets and should be protected from
ordinary mutation.

## 13. Subscription and Entitlement

### plans

-   code
-   name
-   limits
-   entitlements
-   active

### subscriptions

-   organization
-   plan
-   status
-   start/end/renewal
-   unit allowance
-   billing metadata

### feature_flags

-   key
-   environment/organization targeting
-   enabled/configuration
-   audit metadata

## 14. Indexing Guidelines

Common patterns: - `{ organizationId: 1, status: 1, createdAt: -1 }` -
`{ organizationId: 1, propertyId: 1, status: 1 }` -
`{ organizationId: 1, buildingId: 1, status: 1 }` -
`{ organizationId: 1, unitId: 1, createdAt: -1 }` -
`{ tenantUserId: 1, status: 1 }` -
`{ provider: 1, providerTransactionId: 1 }` unique -
`{ cameraId: 1, occurredAt: -1 }` -
`{ actorUserId: 1, timestamp: -1 }` -
`{ resourceType: 1, resourceId: 1, timestamp: -1 }`

Validate indexes against actual query plans before adding excessive
indexes.

## 15. Data Retention

Define retention by category: - Financial/audit/legal records. -
OTP/security telemetry. - CCTV metadata/clips. - General documents. -
Notifications. - Logs.

Retention must be configurable to applicable law, contract, and customer
policy. Deletion/archival workflows must respect legal holds and
referential integrity.


## 16. Platform Readiness and Monitoring Records

LaunchReadiness stores one review per environment/key with a unique compound index, optimistic revision, onboarding/staging status, responsible owner, next action, blocker/severity, verification note/time and last actor. Configuration presence is derived from server configuration; credential values are not copied into reviews. Review and audit commit together.

PlatformMonitoring.ts declares five models:

- PlatformMonitorSignal: environment, minute bucket, kind, organization/platform scope, optional switch subject, counts and first/last timestamps; a unique bucket/kind/scope/subject index deduplicates updates. expiresAt has a TTL index, with seven-day retention assigned by the recorder.
- PlatformHeartbeat: environment/instance uniqueness, API/WORKER/COLLECTOR kind, first/last/stopped timestamps and three-day TTL. Collector lease token/expiry and last success/error timestamps support collection ownership.
- PlatformMonitorAlert: unique environment/fingerprint, area/scope/code, severity, OPEN/ACKNOWLEDGED/RESOLVED status, owner, observed value, first/last timestamps and optimistic revision. Acknowledgement/resolution retain actor/time.
- PlatformMonitorHistory: alert/environment, action, actor/time, bounded note, before/after status and owner. History commits with alert changes and audit.
- PlatformMaintenanceWindow: environment, area, organization or PLATFORM scope, start/end, reason, owner and creator. Active/pending windows are bounded to 100; writes serialize capacity checks and share an audit transaction.

Initialize declared indexes through readiness:create-index and monitoring:create-indexes. Neither command drops existing indexes or changes review/alert records. Revision and full unique-index prerequisites fail closed. Use a replica set or sharded MongoDB for transactional writes. These platform records are restricted to platform administrators, and alert/history retention requires a separate operational policy.

## Versioned landlord activation records

ContractTemplate adds append-only commercial versions and audited availability status. OrganizationContract adds organization/generation uniqueness, template/rendered/commercial snapshots, typed signature evidence and PDF references. Organization.onboarding records durable state, revision, authoritative legal/portfolio details, contract/invoice links and activation times. SubscriptionInvoice adds historical commercial/minor-unit snapshots and contract/invoice/receipt document links; OrganizationSubscription adds private reusable authorization and renewal schedule status. Document retains immutable generated bytes/hash/render version; Evidence links each artifact. Four sparse compound provider-reference indexes are replaced with partial string-reference uniqueness; run the explicit reviewed migration described in [LANDLORD_CONTRACT_WORKFLOW.md](LANDLORD_CONTRACT_WORKFLOW.md). No mass backfill or historical mutation.

## Platform business snapshots and transition evidence

Added immutable PlatformBrief snapshots with unique environment/dataset/idempotency keys and history indexes. OrganizationSubscription stores prospective atomic plan/status transitions; onboarding stores stateChangedAt. Reporting indexes are additive through `business:create-indexes`; no legacy metrics are invented. See [index rationale and metric authorities](SUPER_ADMIN_BUSINESS_INTELLIGENCE.md).

## Administrator authentication evidence

AdminAuthFlow stores temporary hashed password-bound workflows; User/OtpChallenge/RefreshSession extend existing security authorities. Platform security Notification/Job rows are transactionally queued without a fabricated organization. Explicit index repair and retention rationale: [SUPER_ADMIN authentication](SUPER_ADMIN_AUTHENTICATION.md).
