# Property Management Command Center --- Master Context

## 1. Purpose

This document is the canonical product context for the **Property
Management Command Center (PMCC)**. Any AI coding agent, engineer,
reviewer, or architect working on this repository must read this file
before making architectural or feature-level changes.

PMCC is not intended to be a generic CRUD property-management
application. It is a premium operational command center for landlords
and property operators: a system for controlling money, people, property
operations, maintenance, evidence, security, communications, and
portfolio intelligence from one auditable platform.

### Core positioning

> You don't need to be everywhere. You just need to be connected to
> everything that matters.

> Stop managing your properties from WhatsApp. Start commanding them
> from one system.

> We're not giving you another app. We're giving you a command center
> for your bricks and mortar.

The product should make an owner feel that their physical portfolio has
a digital control plane.

------------------------------------------------------------------------

## 2. Product Transformation

PMCC should move property operations from:

-   Blind → Visible
-   Scattered → Centralized
-   Dependent → In control
-   Manual → Automated
-   Reactive → Proactive
-   Unverified → Auditable
-   Unlimited access → Role-based access
-   "Trust me" → "Check the system"
-   CCTV footage → Security intelligence
-   Tenant complaints → Trackable service requests
-   Vacancy → Quantified lost revenue
-   Raw operational data → Property intelligence
-   Being physically present → Remote control
-   Managing buildings → Managing a portfolio
-   Property management → Property command

The major despised-state → better-state transformations include:

1.  Dependency on staff updates → direct operational visibility.
2.  WhatsApp chaos → one source of truth.
3.  "Which house?" → automatic unit identification.
4.  Tenant onboarding mistakes → controlled onboarding.
5.  "He said, she said" → timestamped evidence.
6.  Maintenance calls → structured maintenance workflow.
7.  Uncontrolled spending → configurable approval controls.
8.  Caretaker dependency → caretaker accountability.
9.  Unlimited access → scoped role-based access.
10. Hidden finances → portfolio financial visibility.
11. Operational blind spots → command center.
12. Late discovery of problems → early warnings.
13. CCTV as a separate system → security command center.
14. Unaccountable CCTV access → audited surveillance access.
15. Lost footage → retrievable incident evidence.
16. Password headaches → phone/OTP-first access.
17. Stolen-device exposure → session controls and step-up
    authentication.
18. Paper property files → digital property passport.
19. Disputes → digital evidence trail.
20. Contractor claims → measurable contractor performance.
21. Vacancy as a count → vacancy as quantified lost revenue.
22. Raw data → property intelligence.
23. Reactive management → proactive management.
24. Individual buildings → portfolio-level control.
25. Another app → property operating system.
26. Physical presence → remote control.
27. Trusting people → verifying operations.
28. Information overload → exception-based attention.
29. Being everywhere → being connected.
30. Property management → property command.

------------------------------------------------------------------------

## 3. Product Tiers

### Control 🎛️

Designed to organize and automate property operations.

Indicative commercial model: - Up to 20 units: approximately KES
6,000--8,000/month. - Up to 50 units: approximately KES 10,000/month. -
Up to 100 units: approximately KES 17,500--20,000/month. - 100--250
units: approximately KES 30,000--40,000/month. - Larger portfolios:
custom pricing. - Additional units may be priced around KES
150--200/unit/month. - Example annual price for 50 units: approximately
KES 108,000.

### Fort Knox 🏰

Designed to control operations, security, financial exposure, staff
accountability, and remote oversight.

Indicative commercial model: - Up to 50 units: approximately KES
30,000/month or KES 324,000/year. - Up to 100 units: approximately KES
45,000--50,000/month. - 100--250 units: approximately KES
65,000--80,000/month. - 250--500 units: approximately KES
100,000--150,000+/month. - 500+ units: custom pricing. - CCTV hardware,
installation, networking, storage, and integration are separate costs.

Possible founding-client offer: - Fort Knox at KES 20,000/month for the
first 12 months instead of the standard KES 30,000/month starting tier,
in exchange for structured feedback and, if satisfied, a case
study/reference.

Tier entitlements must be implemented as configurable feature
entitlements, not scattered hard-coded checks.

------------------------------------------------------------------------

## 4. Core Product Pillars

### Money

Rent collection, expected rent, arrears, service charges, expenses,
maintenance expenditure, receipts, payment history, statements, approval
controls, reconciliation, P&L, anomalies, and property/unit performance.

### People

Landlords, managers, caretakers, tenants, contractors, security
personnel, and platform administrators. Actions must be attributable to
an actor, time, organization, property/building/unit, and relevant
resource.

### Property

Every property/unit develops a durable digital history: tenancy,
inspections, maintenance, assets, documents, meter readings, payments,
evidence, and events.

### Security

CCTV live viewing, playback, motion/security events, incidents, camera
permissions, access logs, evidence handling, and step-up authentication
for sensitive actions.

### Communication

Structured announcements, notifications, maintenance conversations,
incident communications, and role-aware workflows that replace
fragmented WhatsApp operations.

------------------------------------------------------------------------

## 5. Primary Experiences

### Landlord Command Center

Must surface: - Properties and portfolio. - Units, occupancy, and
vacancy. - Expected, collected, and outstanding rent. - Arrears. -
Expenses and maintenance spend. - P&L and property performance. -
Open/urgent maintenance. - Approvals awaiting action. - Security events
and incidents. - Staff activity. - Alerts and exceptions. - Property
Health Scores. - Actionable intelligence.

The interface should prioritize **what needs attention**, not maximize
the amount of data shown.

### Property Health Score

A configurable score, e.g. 87/100, derived from signals such as: -
Occupancy. - Collection performance. - Arrears. - Maintenance
backlog/severity. - Security incidents. - Tenant/service indicators. -
Expense anomalies.

The scoring algorithm must be explainable and versionable. Never present
opaque AI output as unquestionable truth.

### Digital Property Passport

Per unit/property, maintain: - Property/building/unit identity. -
Current tenancy. - Tenant history. - Lease documents. - Move-in/out
inspections. - Maintenance history. - Repair costs. - Before/after
media. - Meter readings. - Assets/inventory. - Documents. - Notes. -
Payment history. - Operational/security events where appropriate.

------------------------------------------------------------------------

## 6. Roles

### Super Admin

Platform-level administration: - Organizations. - Users. - Roles and
permissions. - Plans/subscriptions. - Integrations. - Feature flags. -
Audit/security oversight. - Platform configuration. -
Support/diagnostics. - Platform analytics.

Super Admin activity is still audited.

### Landlord / Owner

Scoped to owned/authorized organization and portfolio: - Portfolio-wide
property data. - Financials. - Maintenance. - Approvals. - CCTV/security
where entitled. - Reports. - Staff activity. - Audit records. -
Configuration permitted by organization policy.

### Property Manager

Scoped to assigned organizations/properties: - Operational management. -
Assigned financial capabilities. - Tenant/tenancy operations. -
Maintenance and contractor workflows. - Reports as permitted. - Security
access only when explicitly permitted.

### Caretaker

Scoped to assigned property/building: - Relevant tenants. -
Maintenance. - Contractors/jobs. - Announcements. - Basic occupancy. -
Explicitly permitted CCTV/security. - No portfolio-wide landlord
financials, service-charge surplus, P&L, or unrestricted rent balances
unless explicitly granted.

### Contractor

Scoped to assigned jobs: - Job details. - Quotes. - Status. - Work
evidence/media. - Invoices. - Job communication. - No unrelated
tenant/property/financial data.

### Tenant

Scoped to own active/historical tenancy as policy permits: - Own
tenancy/unit. - Rent information. - Payments/receipts. - Maintenance
requests. - Announcements. - Documents. - Emergency reporting. -
Utilities/meters where supported.

------------------------------------------------------------------------

## 7. Authorization Model

Authorization is enforced server-side and combines:

**ROLE + PERMISSION + RESOURCE OWNERSHIP + ORGANIZATION SCOPE +
PROPERTY/BUILDING SCOPE + ACTION + FEATURE ENTITLEMENT**

Frontend visibility is never authorization.

Representative permissions: - `property.view`, `property.create`,
`property.update`, `property.delete` - `unit.view`, `unit.create`,
`unit.update`, `unit.assign` - `tenant.view`, `tenant.create`,
`tenant.update`, `tenant.offboard` - `rent.view`, `rent.manage`,
`rent.approve` - `maintenance.view`, `maintenance.create`,
`maintenance.assign`, `maintenance.approve`, `maintenance.close` -
`cctv.view`, `cctv.playback`, `cctv.download`, `cctv.manage` -
`financial.view`, `financial.manage` - `audit.view` - `staff.manage` -
`reports.view`

Permissions should be data-driven and seedable. Scope checks belong in
reusable authorization policies/services.

------------------------------------------------------------------------

## 8. Tenant Onboarding

Preferred flow:

1.  Authorized staff pre-register tenant phone number.
2.  Staff assigns organization/property/building/unit and tenancy
    metadata.
3.  Tenant enters phone number.
4.  Backend normalizes phone number and checks pre-registration.
5.  System issues a six-digit OTP through an abstract notification
    provider.
6.  OTP is hashed, expires, is attempt-limited, and cannot be reused.
7.  After successful verification, tenant account/session is
    established.
8.  Tenant is automatically bound to the assigned tenancy/unit.
9.  Tenant must not manually select or mutate their unit.

If phone is not pre-registered: - Create an access request. - Notify
responsible caretaker/manager/landlord. - Authorized user
approves/rejects. - Approval must create/associate the appropriate
tenancy safely.

### Move-out

-   Mark tenancy inactive/ended.
-   Preserve historical records.
-   Unit becomes vacant according to effective date.
-   Perform reconciliation.
-   Record move-out inspection.
-   Record damage/deposit deductions.
-   Capture final meter readings.
-   Archive documents/evidence.
-   Revoke or reduce tenant access according to policy without
    destroying history.

------------------------------------------------------------------------

## 9. Maintenance Command Center

Tenant request includes: - Category. - Description. - Photos/video. -
Priority/emergency indication.

Backend attaches: - Tenant. - Organization. - Property. - Building. -
Unit. - Timestamp. - Request actor/source.

Workflow:

`NEW → TRIAGED → ASSIGNED → QUOTED → APPROVAL_REQUIRED → APPROVED → IN_PROGRESS → COMPLETED → VERIFIED → CLOSED`

Some transitions may be skipped when policy permits, but transitions
must be validated and audited.

Categories: - Plumbing. - Electrical. - Structural. - Security. -
Cleaning. - Appliances. - Other.

Priorities: - Emergency. - High. - Medium. - Low.

Financial fields: - Estimated cost. - Quote. - Approval threshold. -
Approved amount. - Actual amount. - Contractor. - Invoice. - Payment
status.

Example configurable policy: - Spend ≤ KES 5,000 may be handled by
caretaker/manager. - Spend \> KES 5,000 requires landlord approval.

This is configuration, not a universal hard-coded rule.

------------------------------------------------------------------------

## 10. Contractor Management

Maintain: - Identity/contact. - Trade/specialization. - Assigned jobs. -
Quotes. - Invoices. - Completion history. - Response times. -
Ratings/feedback. - Cost history. - Performance metrics. - Compliance
documents if later required.

Performance metrics should be derived from real job records.

------------------------------------------------------------------------

## 11. Financial System

Support: - Rent schedules/charges. - Expected rent. - Payments. -
Allocations. - Outstanding balances. - Arrears. - Collection
percentage. - Service charges. - Expenses. - Maintenance expenditure. -
Receipts. - Statements. - P&L/reporting. - Property/unit performance. -
Reconciliation. - Approval controls. - Financial audit events.

Payments must use provider abstractions:

`PaymentProvider → M-Pesa / Paystack / Stripe / Bank / future provider`

Production requirements: - No fake payment-success logic. - Webhook
verification. - Idempotency. - Provider reference storage. -
Reconciliation. - Immutable/auditable financial event history where
appropriate. - Monetary values stored safely using integer minor units
or an explicitly chosen decimal strategy; never binary floating point
for authoritative money calculations.

------------------------------------------------------------------------

## 12. CCTV and Security

Target integrations: - Hikvision. - Dahua. - ONVIF-compatible
cameras/NVRs. - Future vendor adapters.

Do not assume browsers consume raw RTSP.

Production media path:

`Camera/NVR → secure network/integration → streaming gateway → browser-compatible WebRTC/HLS as appropriate → authenticated PMCC client`

Landlord capabilities may include: - All authorized cameras. - Live
view. - Playback. - Camera selection. - Motion/security events. -
Incident review.

Caretaker: - Assigned property/building cameras only. - Only explicitly
granted capabilities.

Sensitive CCTV controls: - Camera-level permissions. - Property/building
scope. - Audit every sensitive access. - Record
actor/session/time/camera/action/outcome. - Step-up authentication for
high-risk actions such as evidence download where policy requires it. -
Signed/short-lived media access where possible.

Example audit event:

`Caretaker James | VIEW_CAMERA | Block A Entrance | 03:12 | SUCCESS`

### Security events

Camera/NVR or integration:
`event/webhook → backend normalization → security event → notification → dashboard`

Store: - Camera. - Organization/property/building. - Timestamp. - Event
type. - Severity. - Media/evidence references. - Status. -
Source/provider metadata.

### Incidents

Store: - Incident ID. - Property/building. - Camera. - Timestamp. -
Description. - Evidence. - Related users. - Status. - Resolution. -
Notes.

Workflow: `OPEN → INVESTIGATING → ESCALATED → RESOLVED → CLOSED`

------------------------------------------------------------------------

## 13. Emergency System

Tenant/staff may report: - Fire. - Break-in. - Electrical hazard. -
Water emergency. - Medical emergency. - Other.

Attach: - Reporter. - Tenant/unit where relevant. - Property/building. -
Timestamp. - Description. - Media. - Severity/category.

Notify responsible personnel using event-driven notification channels.

------------------------------------------------------------------------

## 14. Communication and Notifications

Support: - In-app notifications. - Email. - SMS. - Push. - Future
WhatsApp integration. - Property/building/tenant-specific
announcements. - Maintenance conversations. - Security/incident
notifications. - Approval notifications.

Use an event-driven notification architecture. Delivery failure must not
silently corrupt business transactions.

------------------------------------------------------------------------

## 15. Evidence, Documents, and Media

Evidence types include: - Lease documents. - Inspection records. -
Photos/videos. - Receipts. - Invoices. - Maintenance evidence. -
Security evidence. - Move-in/out evidence. - Property documents.

Use a storage abstraction:

`StorageProvider → S3 / Cloudinary / compatible provider`

Store metadata and ownership/scope in the application database. Use
secure uploads, MIME/type validation, size limits, malware scanning
integration readiness, signed access where applicable, and audit trails
for sensitive evidence.

------------------------------------------------------------------------

## 16. Authentication

Primary: - Phone number + OTP.

Optional: - Password for selected/power users. - Future passkeys or
additional MFA.

Requirements: - Secure session/token model. - Refresh token/session
rotation if token-based. - Device/session management. - Verification
state. - Rate limiting. - Login monitoring. - MFA/step-up
authentication. - OTP expiry. - OTP attempt limits. - OTP reuse
prevention. - Hashed OTPs/passwords. - Session revocation. - Account
deactivation enforcement.

------------------------------------------------------------------------

## 17. Admin Panel

The admin experience should feel elite and operational, not like an
unmodified generic template.

Capabilities: - Organizations. - Users. - Roles. - Permissions. -
Plans/subscriptions. - Properties. - Integrations. - Audit logs. -
Security events. - Feature flags. - System configuration. -
Notifications. - Support tooling. - Platform analytics. - Operational
diagnostics.

All privileged admin actions should be attributable and auditable.

------------------------------------------------------------------------

## 18. Frontend Direction

Preferred stack: - React. - TypeScript. - Tailwind CSS. - shadcn/ui. -
Motion. - Lucide. - Recharts. - TanStack Table. - React Hook Form. -
Zod.

Experience: - Premium. - Calm. - Secure. - Precise. - Modern. -
Trustworthy. - Responsive. - Mobile-first for tenants. - Desktop-first
command-center experience for landlords/admin/operators.

Animation should communicate state: - Page transitions. - Staggered
dashboard cards. - Number transitions. - Status changes. -
Drawers/modals. - Hover/focus feedback. - Progress. - Notifications. -
Timelines. - CCTV/security indicators.

Respect `prefers-reduced-motion`.

------------------------------------------------------------------------

## 19. Backend Direction

Stack: - Node.js. - Express. - TypeScript strict mode. - MongoDB. -
Mongoose. - Zod. - Vitest/Supertest.

Layering:
`route → controller → service → repository/data access → model`

Cross-cutting: - Authentication. - Authorization. - Validation. -
Logging. - Audit. - Events. - Notifications. - Security. - Integrations.

Vendor SDKs must remain behind interfaces/adapters.

API base: `/api/v1`

Representative route groups: - `/auth` - `/users` - `/organizations` -
`/properties` - `/buildings` - `/units` - `/tenants` - `/tenancies` -
`/payments` - `/maintenance` - `/contractors` - `/cctv` -
`/security-events` - `/incidents` - `/notifications` - `/documents` -
`/reports` - `/audit-logs` - `/admin`

------------------------------------------------------------------------

## 20. Engineering Principles

-   Strict TypeScript.
-   Centralized environment validation.
-   Centralized error handling.
-   Structured logging.
-   Request IDs/correlation IDs.
-   Input validation at trust boundaries.
-   Rate limiting.
-   CORS and secure headers.
-   Intentional database indexes.
-   Pagination/filter/sort/search.
-   Transactions where consistency requires them.
-   Idempotent webhooks.
-   API versioning.
-   Secure upload controls.
-   Audit logs.
-   Principle of least privilege.
-   Tenant/organization data isolation.
-   No secrets committed to source.
-   No hard-coded production identities.
-   No placeholder integrations masquerading as real behavior.
-   No deletion of functionality merely to make tests pass.

------------------------------------------------------------------------

## 21. AI / Property Intelligence

Later intelligence features may identify: - Rising maintenance costs. -
Repeat-problem units. - Arrears patterns. - Long vacancies. - Unusual
expenses. - Contractor anomalies. - Access anomalies. - Utility
anomalies.

AI-generated insights must: - Be grounded in authorized data. - Respect
tenant/organization isolation. - Be explainable where consequential. -
Distinguish observation from recommendation. - Never silently execute
financial/security actions without explicit policy/authorization.

------------------------------------------------------------------------

## 22. Repository Philosophy

The repository is the durable source of truth for the product. This
document and the companion architecture/specification files should allow
a new engineer or coding agent to continue development without
reconstructing product decisions from chat history.

When implementation and documentation disagree: 1. Determine whether the
implementation reflects an explicitly approved newer decision. 2. If
yes, update documentation in the same change. 3. If no, treat the
documented product/security requirement as authoritative and raise the
discrepancy.
