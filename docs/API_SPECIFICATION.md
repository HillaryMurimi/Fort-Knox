# Property Management Command Center --- API Specification

## Social owner sign-in

`GET /api/v1/auth/social/providers` reports configured providers. `POST /api/v1/auth/social/{provider}/start` returns a provider authorization URL and sets a short-lived HttpOnly flow cookie. The provider calls `GET /api/v1/auth/social/{provider}/callback`, which verifies state, code and identity, then redirects to `/welcome`. The browser uses `GET /api/v1/auth/social/session`, `POST /api/v1/auth/social/challenge` and `POST /api/v1/auth/social/finish` to complete organization setup and phone verification. For a new owner, `challenge` accepts name, email, international phone and organization name. For an existing owner linking a new provider subject, it accepts only `{ existingAccount: true, email, password }`; the OTP is sent to the phone already on that account. For an already linked owner, it accepts `{}`. `finish` sets the existing HttpOnly refresh cookie; the client calls `POST /api/v1/auth/refresh` for its access token. Provider tokens and phone codes are never returned in production responses. Social requests use the authentication rate limiter. Mutating endpoints require the configured web Origin, and signup details cannot select a role or tenancy.

## 1. Conventions

Base path:

`/api/v1`

JSON API over HTTPS.

Headers: - `Authorization: Bearer <token>` where token auth is used. -
`X-Request-Id` accepted/generated. - `Idempotency-Key` for supported
mutation/payment operations. - Correct content type.

All input validated with Zod or equivalent server-side schemas.

## 2. Standard Response Shape

Success:

``` json
{
  "data": {},
  "meta": {
    "requestId": "..."
  }
}
```

Paginated:

``` json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 100,
    "totalPages": 4,
    "requestId": "..."
  }
}
```

Error:

``` json
{
  "error": {
    "code": "MAINTENANCE_NOT_FOUND",
    "message": "Maintenance request was not found.",
    "details": []
  },
  "meta": {
    "requestId": "..."
  }
}
```

Do not leak stack traces or sensitive internals in production.

## 3. Authentication

``` text
POST /auth/otp/request
POST /auth/otp/verify
POST /auth/login
POST /auth/refresh
POST /auth/logout
POST /auth/logout-all
GET  /auth/me
GET  /auth/sessions
DELETE /auth/sessions/:sessionId
POST /auth/step-up/request
POST /auth/step-up/verify
```

OTP request should return a neutral response that limits account
enumeration.

## 4. Users / Membership / Access

``` text
GET    /users
POST   /users
GET    /users/:userId
PATCH  /users/:userId
GET    /users/:userId/memberships

GET    /organizations
POST   /organizations
GET    /organizations/:organizationId
PATCH  /organizations/:organizationId
GET    /organizations/:organizationId/members
POST   /organizations/:organizationId/members
PATCH  /organizations/:organizationId/members/:membershipId
DELETE /organizations/:organizationId/members/:membershipId

GET    /roles
POST   /roles
GET    /roles/:roleId
PATCH  /roles/:roleId
DELETE /roles/:roleId
GET    /permissions
```

`PATCH /organizations/:organizationId` accepts partial organization identity
fields and a partial `settings` object containing `managementPhone`,
`managementEmail`, `emergencyPhone`, and `officeHours`. Identity changes require
`organization.update`; resident-facing contact settings require
`organization.settings.manage`. The server merges settings, rejects unknown
fields, scopes the organization through authorization, and audits the before and
after state.
The same PATCH accepts `regionalProfile: { locale?, timeZone? }` under
`organization.settings.manage`. Both values are validated; country, base
currency, and allowed currencies are read-only and rejected on update. Existing
organizations default to KE/KES/en-KE/Africa/Nairobi. This changes presentation
preferences only, not transaction currency or historical finance records.

## 5. Properties

The implemented guided setup endpoint is `POST /api/v1/organizations/:organizationId/property-setups`. It accepts `{ property: CreatePropertyInput, structureMode: "BUILDINGS" | "STANDALONE", buildings: [{ name, code, floors: [{ name, code, level, units: [{ name, code, unitType, unitTypeLabel?, monthlyRent, serviceCharge?, bedrooms?, bathrooms?, areaSqm? }] }] }] }`. Standalone mode requires one site building and one floor. The server validates uniqueness per building and two-decimal KES amounts, limits the request to 20 buildings and 500 units, checks `property.create`, `building.create`, `floor.create`, and `unit.create` plus subscription capacity, then writes the hierarchy and audit entries in one MongoDB transaction. Response: `{ propertyId, buildingCount, floorCount, unitCount, estimatedMonthlyRent }`. A replica-set or sharded MongoDB deployment is required for transactional setup. `monthlyRent` on units is asking rent; active and historical tenancy rent remains on the tenancy. Unit read responses omit `monthlyRent` and `serviceCharge` when the caller lacks scoped `rent.view`; updating either amount also requires scoped `rent.manage`.

``` text
GET    /properties
POST   /properties
GET    /properties/:propertyId
PATCH  /properties/:propertyId
DELETE /properties/:propertyId

GET    /properties/:propertyId/buildings
POST   /properties/:propertyId/buildings

GET    /buildings/:buildingId
PATCH  /buildings/:buildingId
DELETE /buildings/:buildingId

GET    /buildings/:buildingId/floors
POST   /buildings/:buildingId/floors

GET    /buildings/:buildingId/units
POST   /buildings/:buildingId/units

GET    /units/:unitId
PATCH  /units/:unitId
DELETE /units/:unitId
GET    /units/:unitId/passport
```

DELETE may map to archive semantics.

## 6. Tenants and Tenancies

``` text
GET    /tenants
POST   /tenants/pre-register
GET    /tenants/:tenantId
PATCH  /tenants/:tenantId

POST   /tenant-access-requests
GET    /tenant-access-requests
POST   /tenant-access-requests/:id/approve
POST   /tenant-access-requests/:id/reject

GET    /tenancies
POST   /tenancies
GET    /tenancies/:tenancyId
PATCH  /tenancies/:tenancyId
POST   /tenancies/:tenancyId/activate
POST   /tenancies/:tenancyId/move-out
```

## 7. Rent / Payments / Finance

``` text
GET    /rent/charges
POST   /rent/charges
GET    /rent/arrears
GET    /rent/statements/:tenancyId

GET    /payments
POST   /payments
GET    /payments/:paymentId
POST   /payments/:paymentId/reconcile
POST   /payments/:paymentId/refund

POST   /webhooks/payments/mpesa
POST   /webhooks/payments/paystack

GET    /expenses
POST   /expenses
GET    /expenses/:expenseId
PATCH  /expenses/:expenseId
POST   /expenses/:expenseId/approve
POST   /expenses/:expenseId/reject

GET    /financial-reports/summary
GET    /financial-reports/properties/:propertyId
GET    /financial-reports/pnl
```

Provider webhook routes require provider-specific verification and
idempotency.

The implemented v1 provider endpoints are:

``` text
POST /integrations/payments/:paymentId/provider-initiate
POST /integrations/payments/:paymentId/provider-reconcile
POST /integrations/webhooks/MPESA
POST /integrations/webhooks/PAYSTACK
```

Landlord settlement destination endpoints are:

``` text
GET  /organizations/:organizationId/payment-destinations
POST /organizations/:organizationId/payment-destinations
POST /payment-destinations/:id/disable
```

They require `organization.settings.manage`. Paystack destination creation
provisions a Paystack subaccount server-side and persists only routing and
masked account details. M-Pesa destinations become active only when they
match the securely configured Daraja shortcode. Crypto destinations remain
`PENDING_PROVIDER_SETUP` until a supported processor and reconciliation
adapter are connected.
Provider initiation now fails with `PAYMENT_RAIL_UNAVAILABLE` when the
organization's regional profile does not support the selected country,
currency and rail. It fails with `PAYMENT_DESTINATION_REQUIRED` before any
provider call if there is no active default destination matching the payment
country/currency or if its routing code does not match the configured merchant.
Paystack rent checkout always includes the organization's subaccount code.
While the operational finance ledger still stores major-unit KES amounts,
new rent charges, generated rent, payments, expenses, and service-charge
assessments accept only `KES`. Paystack/M-Pesa settlement destinations must
use country `KE`, and Paystack destinations must use `KES`. Invalid currencies
or countries fail request validation before provider onboarding. Manual rent
allocation rejects a charge whose currency differs from the payment; provider
allocation only considers same-currency charges. Existing historical records
are not converted by this restriction.
KES monetary inputs now require cent precision and safe integer conversion.
Allocation and reversal calculations use integer cents internally. New rent
charges, payments, and allocations also store optional integer minor-unit
fields and reject major/minor disagreement in payment transactions. Existing
API monetary values remain major-unit numbers; additional minor fields on
records are transitional and must not be treated as a canonical client API.
This is not a multi-currency or canonical minor-unit API.
Manual and verified provider payment confirmation atomically commit the
allocation rows, charge balances, payment status, and audit record in MongoDB.
Confirmation therefore requires a replica set or sharded MongoDB deployment;
a standalone MongoDB server cannot process this write. Repeating an already
confirmed provider event does not create another allocation.
`POST /api/v1/payments/:id/reverse` requires scoped `payment.reverse` access
and a confirmed payment with a complete allocation set. It restores the rent
charge balances and marks the payment `REVERSED` in the same transaction as
its audit record. Allocation records remain as history. A second reversal is
rejected. This is an internal ledger reversal, not a Paystack or M-Pesa refund;
provider refunds and bank settlement corrections require a separate workflow.
Full Paystack refunds use `POST /api/v1/payments/:id/refund` with
`{ "reason": "..." }` (10-500 characters), `GET /api/v1/payments/:id/refund`,
`GET /api/v1/organizations/:organizationId/payment-refunds` (latest 100,
organization and assigned-unit scoped), and
`POST /api/v1/payments/:id/refund/reconcile`. All require scoped
`financial.manage`. A request is allowed only for a confirmed Paystack payment
whose server-verified transaction amount, currency, and PMCC payment and
organization metadata match. One refund record is permitted per payment;
repeating the request never sends a second provider POST. The request returns
`202` with a refund status, not a claim that money has arrived. Signed Paystack
refund webhooks and provider fetch reconcile `PENDING`, `PROCESSING`,
`NEEDS_ATTENTION`, `FAILED`, and `PROCESSED`. `SUBMISSION_UNKNOWN` requires
provider-dashboard investigation; PMCC does not retry that submission. The
payment and rent charges stay unchanged even when a refund becomes `PROCESSED`.
`POST /api/v1/payments/:id/refund/apply-ledger` requires both scoped
`financial.manage` and `payment.reverse`. It re-fetches the provider refund,
requires `PROCESSED`, then atomically reverses the full rent allocation,
marks the refund ledger-corrected, and audits the action. The generic payment
reversal endpoint cannot reverse a Paystack payment or a payment with a refund
record without this supervised action. Partial refunds and
automated M-Pesa reversals are not supported by these endpoints.

`POST /api/v1/payments/:id/refund/review` accepts
`{ "note": "...", "providerRefundId": 123 }` for a refund in
`SUBMISSION_UNKNOWN` or `NEEDS_ATTENTION` and requires scoped
`financial.manage`. Notes are 10-1000 characters. The numeric Paystack refund
ID is required for `SUBMISSION_UNKNOWN`; for `NEEDS_ATTENTION` the already
linked ID is used and any supplied ID must match. PMCC fetches the existing
refund and verifies its Paystack transaction ID, amount, currency, reference,
and original PMCC ownership metadata before recording the latest review and
auditing it. This endpoint does not submit or retry a refund, collect customer
bank details, or alter rent balances. If no provider refund can be identified,
the request remains quarantined for investigation.

Paystack initiation accepts an optional payer email override and optional
`paystackChannels`; otherwise
the server uses the pre-registered tenant email. Its response may include
`checkoutUrl` and `accessCode`. Raw provider payloads and secret keys are
never returned to clients.

Paystack support in these endpoints is for property/rent payments. It does
not change the separate platform-subscription billing provider contract.

## 8. Maintenance

``` text
GET    /maintenance
POST   /maintenance
GET    /maintenance/:maintenanceId
PATCH  /maintenance/:maintenanceId

POST   /maintenance/:id/triage
POST   /maintenance/:id/assign
POST   /maintenance/:id/quotes
POST   /maintenance/:id/request-approval
POST   /maintenance/:id/approve
POST   /maintenance/:id/reject
POST   /maintenance/:id/start
POST   /maintenance/:id/complete
POST   /maintenance/:id/verify
POST   /maintenance/:id/close
POST   /maintenance/:id/reopen

GET    /maintenance/:id/timeline
POST   /maintenance/:id/comments
POST   /maintenance/:id/evidence
```

`POST /maintenance/:id/evidence` accepts authenticated `multipart/form-data` with up to five `media` parts. Supported formats are JPEG, PNG, WebP, HEIC/HEIF, MP4, WebM, and QuickTime. Photos are limited to 10 MB and videos to 25 MB per file. The server verifies maintenance-resource scope, stores the bytes through `StorageProvider`, creates audited Evidence records, and appends their IDs to the maintenance request.

Transition endpoints should enforce valid state transitions.

The caretaker workspace uses the implemented maintenance create, evidence,
triage, assign, quote, progress, verify, and close contracts. Backend policy and
state checks remain authoritative; the UI does not expose maintenance approval.
It also uses the inspection, incident, security summary/event, notification, and
inventory endpoints. Security collection and summary queries apply unit,
building, and property scope independently so a building assignment cannot read
another building's records through a shared property ID.

The implemented contractor workspace uses `GET /organizations/:organizationId/maintenance`, `POST /maintenance/:maintenanceId/quote`, `POST /maintenance/:maintenanceId/progress`, and `POST /maintenance/:maintenanceId/evidence`. For a Contractor principal, the list and every item action are server-scoped through the authenticated user's active Contractor profile. Empty or mismatched profiles return no list records and cannot open or mutate another contractor's job. Existing evidence IDs are preserved when quote or progress payloads add evidence.

## 9. Contractors

``` text
GET    /contractors
POST   /contractors
GET    /contractors/:contractorId
PATCH  /contractors/:contractorId
GET    /contractors/:contractorId/jobs
GET    /contractors/:contractorId/performance
```

Contractor-facing `/me/jobs` may be added to reduce ID exposure.

## 10. Inspections / Assets

``` text
GET    /inspections
POST   /inspections
GET    /inspections/:id
PATCH  /inspections/:id
POST   /inspections/:id/complete

GET    /assets
POST   /assets
GET    /assets/:id
PATCH  /assets/:id
```

## 11. CCTV / Cameras

``` text
GET    /cctv/cameras
POST   /cctv/cameras
GET    /cctv/cameras/:cameraId
PATCH  /cctv/cameras/:cameraId

POST   /cctv/cameras/:cameraId/live-session
POST   /cctv/cameras/:cameraId/playback-session
POST   /cctv/cameras/:cameraId/evidence-export

POST   /webhooks/cctv/:provider/events
```

Never return raw RTSP credentials to the browser.

## 12. Security Events / Incidents

``` text
GET    /security-events
GET    /security-events/:id
POST   /security-events/:id/acknowledge
POST   /security-events/:id/escalate

GET    /incidents
POST   /incidents
GET    /incidents/:id
PATCH  /incidents/:id
POST   /incidents/:id/escalate
POST   /incidents/:id/resolve
POST   /incidents/:id/close
```

## 13. Emergency

``` text
POST /emergencies
GET  /emergencies
GET  /emergencies/:id
POST /emergencies/:id/acknowledge
POST /emergencies/:id/resolve
```

## 14. Documents / Media

Prefer direct-to-storage upload with short-lived signed upload
credentials when architecture permits.

``` text
POST   /media/upload-intents
POST   /media/:mediaId/complete
GET    /media/:mediaId
DELETE /media/:mediaId

GET    /documents
POST   /documents
GET    /documents/:documentId
POST   /documents/:documentId/download-session
```

## 15. Notifications / Announcements

``` text
GET    /notifications
POST   /notifications/:id/read
POST   /notifications/read-all

GET    /announcements
POST   /announcements
GET    /announcements/:id
PATCH  /announcements/:id
DELETE /announcements/:id
```

## 16. Reports / Intelligence

``` text
GET /reports/occupancy
GET /reports/vacancy
GET /reports/collections
GET /reports/arrears
GET /reports/maintenance
GET /reports/contractors
GET /reports/security
GET /reports/activity

GET /property-health
GET /property-health/:propertyId
GET /intelligence/insights
```

## 17. Audit

``` text
GET /audit-logs
GET /audit-logs/:auditId
GET /domain-events
```

Audit is read-only through normal product APIs.
`GET /domain-events` is organization-scoped and requires `audit.view`. It
returns append-only event records with `eventId`, aggregate identity,
aggregate `version`, `schemaVersion`, `source`, optional actor/request and
correlation/causation IDs, payload, and timestamps. Older records may omit
the newly added trace fields. No event mutation endpoint is exposed.
Platform admins may requeue one supported payment event using
`POST /jobs/domain-events/replay` with `{ "eventId": "<uuid>" }`. It returns
the event ID and `QUEUED` status, and writes an audit record. The jobs worker
must run to deliver it; replay never reconfirms or reverses a payment.

## 18. Admin

``` text
GET /admin/dashboard
GET /admin/organizations
GET /admin/users
GET /admin/subscriptions
GET /admin/integrations
GET /admin/security-events
GET /admin/audit-logs
GET /admin/feature-flags
PATCH /admin/feature-flags/:key
GET /admin/system-health
```

## 19. Paystack Billing

Paystack organization billing commands under `/api/v1/billing`:

```text
POST /organizations/:organizationId/subscription
POST /organizations/:organizationId/subscription/recover-checkout
POST /organizations/:organizationId/subscription/change-plan
POST /organizations/:organizationId/subscription/cancel
```

`recover-checkout` requires `billing.subscription.manage`. It verifies the current Paystack transaction; a confirmed payment activates through server-side verification, a pending payment retains its link, and only a provider-reported failed/abandoned payment can receive a new link. Paystack plan changes update the dedicated provider plan for the next renewal; PMCC applies the new entitlement plan only after the corresponding paid provider event.

## 20. Pagination and Filtering

Use consistent query conventions: - `page` - `pageSize` - `sort` -
`order` - `search` - domain filters such as `propertyId`, `buildingId`,
`status`, `from`, `to`

Enforce maximum page size.

## 21. HTTP Semantics

Typical: - 200 successful read/update/action. - 201 created. - 202
accepted for asynchronous work. - 204 successful no-content operation. -
400 malformed request. - 401 unauthenticated. - 403 authenticated but
unauthorized. - 404 not found or intentionally obscured inaccessible
resource. - 409 conflict/state/idempotency conflict. - 422 semantic
validation when adopted consistently. - 429 rate limited. - 500
unexpected server error.

## 22. API Documentation

Maintain an OpenAPI specification in `docs/api/openapi.yaml`. API
changes should update OpenAPI and tests in the same change.

### Camera creation default

POST /organizations/:organizationId/cctv/cameras creates camera records with status OFFLINE until connectivity is established. No new endpoint or request fields were introduced for the landlord setup forms.
