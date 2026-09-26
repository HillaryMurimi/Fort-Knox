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
-   occupancy status
-   rent configuration
-   service charge configuration
-   metadata
-   timestamps

Recommended uniqueness: - organization/property/building + unit code.

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

### payment_allocations

-   paymentId
-   chargeId
-   amount minor units
-   timestamps

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
