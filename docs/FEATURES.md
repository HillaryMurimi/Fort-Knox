# Property Management Command Center --- Feature Specification

## 1. Portfolio Command Center

### Required

-   Portfolio summary.
-   Properties/buildings/units.
-   Occupancy/vacancy.
-   Expected vs collected rent.
-   Arrears.
-   Expenses.
-   Maintenance backlog and urgent jobs.
-   Pending approvals.
-   Security events/incidents.
-   Staff activity.
-   Property Health Score.
-   Alerts/exceptions.
-   Time-range filtering and drill-down.

### Principle

The dashboard is an attention-management system. Prioritize exceptions,
risk, approvals, and trends over decorative metrics.

## 2. Property, Building, Floor, and Unit Management

-   Create/update/archive properties.
-   Building and floor hierarchy.
-   Unit identity and status.
-   Unit category/type.
-   Rent/service-charge configuration.
-   Occupancy state.
-   Assets/inventory.
-   Meter references.
-   Unit documents.
-   Historical tenancy.
-   Maintenance history.
-   Financial history.
-   Scoped staff assignment.

Deletion of historically referenced resources should generally be
archival/soft deletion rather than destructive removal.

## 3. Digital Property Passport

For each property/unit: - Identity and hierarchy. - Tenant
history/current tenancy. - Lease documents. - Inspections. -
Maintenance. - Repair cost history. - Before/after media. - Meter
readings. - Assets. - Notes. - Payments. - Documents/evidence. -
Relevant events.

## 4. Tenant Lifecycle

### Pre-registration

Authorized staff registers: - Name. - Phone. - Email if available. -
Organization/property/building/unit. - Planned tenancy dates. -
Rent/deposit metadata.

### OTP onboarding

-   Normalize phone.
-   Verify pre-registration.
-   Issue six-digit OTP.
-   Hash OTP.
-   Enforce expiration/attempt limit.
-   Verify.
-   Create/activate user.
-   Bind tenancy automatically.
-   Establish session.
-   Audit.

### Unknown phone

-   Create access request.
-   Notify authorized staff.
-   Approve/reject.
-   Never let an unverified tenant self-assign a unit.

### Move-in

-   Lease.
-   Deposit.
-   Move-in inspection.
-   Meter readings.
-   Inventory.
-   Media/evidence.

### Move-out

-   Effective end date.
-   Reconciliation.
-   Move-out inspection.
-   Damage/deposit deductions.
-   Final readings.
-   Archive evidence.
-   Mark unit vacant.
-   Preserve history.
-   Revoke/adjust access.

## 5. Rent and Payments

-   Rent schedules/charges.
-   Payment recording.
-   Provider payments.
-   Tenant-facing M-Pesa STK Push and Paystack hosted checkout initiation.
-   Paystack hosted checkout channel selection for card, bank, bank
    transfer, mobile money, USSD, QR, Apple Pay, EFT, Capitec Pay, and
    Payattitude, subject to Paystack account/country availability.
-   Organization-scoped landlord settlement destinations. Paystack bank
    destinations are provisioned as subaccounts; matching configured
    M-Pesa shortcodes may be activated. Crypto wallets are captured as
    pending onboarding records and are not offered to tenants until a
    verified processor and reconciliation path exist.
-   Signed Paystack webhook confirmation with amount/currency matching.
-   Allocation.
-   Receipts.
-   Statements.
-   Outstanding balances.
-   Arrears.
-   Collection percentage.
-   Reconciliation.
-   Payment status.
-   Provider references.
-   Refund/reversal support when provider/business rules permit.
-   Webhook idempotency.

## 6. Service Charges and Expenses

-   Configurable service charges.
-   Expense categories.
-   Property/building allocation.
-   Supplier/contractor linkage.
-   Supporting invoice/receipt.
-   Approval status.
-   Actual payment state.
-   Reporting.

## 7. Maintenance

### Request

Capture: - Category. - Description. - Media. - Priority. - Emergency
flag. - Auto-attached tenant/unit/property/building.

### Workflow

`NEW → TRIAGED → ASSIGNED → QUOTED → APPROVAL_REQUIRED → APPROVED → IN_PROGRESS → COMPLETED → VERIFIED → CLOSED`

Also support controlled cancellation/rejection/reopen paths.

### Controls

-   Assignment.
-   Contractor quote.
-   Approval thresholds.
-   Estimated/approved/actual cost.
-   Invoice.
-   Payment state.
-   SLA/response timing.
-   Before/after evidence.
-   Comments/activity timeline.
-   Audit trail.

## 8. Contractor Management

-   Contractor profile.
-   Trade.
-   Contact.
-   Status.
-   Assigned jobs.
-   Quote history.
-   Invoice history.
-   Completion history.
-   Response time.
-   Cost variance.
-   Ratings.
-   Performance analytics.
-   Relevant compliance documents.

## 9. Inspections

-   Move-in.
-   Move-out.
-   Periodic.
-   Maintenance verification.
-   Checklist.
-   Notes.
-   Photos/video.
-   Meter readings.
-   Sign-off.
-   Actor/timestamp.
-   Immutable historical snapshot where appropriate.

## 10. Inventory and Assets

-   Unit/property assets.
-   Serial/model data.
-   Condition.
-   Purchase/installation date.
-   Warranty.
-   Maintenance history.
-   Inspection state.
-   Photos/documents.

## 11. CCTV

-   Camera registry.
-   Property/building assignment.
-   Vendor/NVR metadata.
-   Online/offline health.
-   Live stream session initiation.
-   Playback request.
-   Event clips/snapshots.
-   Camera-level permission.
-   Sensitive action auditing.
-   Step-up authentication for policy-defined actions.
-   Signed/short-lived media access.

## 12. Security Events

-   Motion.
-   Line crossing/intrusion if provider supports it.
-   Camera offline.
-   Access anomaly.
-   Manual security event.
-   Other normalized provider events.

Capture: - Source. - Camera. - Location. - Timestamp. - Severity. -
Evidence. - Status. - Acknowledgement. - Related incident.

## 13. Incident Management

Workflow: `OPEN → INVESTIGATING → ESCALATED → RESOLVED → CLOSED`

Fields: - Incident ID. - Type. - Severity. - Property/building/camera. -
Description. - Evidence. - Related people/resources. - Timeline. -
Resolution. - Notes.

## 14. Emergency Reporting

Categories: - Fire. - Break-in. - Electrical. - Water. - Medical. -
Other.

Immediate workflow: - Create emergency record. - Attach
scope/reporter/time. - Notify configured responders. - Escalate based on
policy. - Maintain event timeline. - Close with resolution.

PMCC is not a replacement for local emergency services. UX should
clearly support escalation without implying guaranteed emergency
dispatch unless a real integration exists.

## 15. Announcements and Messaging

-   Organization/property/building/unit targeting.
-   Tenant announcements.
-   Staff announcements.
-   Maintenance conversation.
-   Contractor/job conversation.
-   Read/delivery status where supported.
-   Attachments where permitted.
-   Notification fan-out.

## 16. Notifications

Channels: - In-app. - SMS. - Email. - Push. - Future WhatsApp.

Events include: - OTP. - Tenant access request. - Maintenance
created/assigned. - Approval required. - Maintenance status changes. -
Payment received. - Arrears/reminders. - Security event. - Incident
escalation. - Emergency. - Announcement. - Subscription/system notices.

Use templates and channel preferences. Critical security messages may
override non-critical marketing preferences where lawful and configured.

## 17. Documents, Media, and Evidence

-   Secure upload.
-   Metadata.
-   Resource linkage.
-   Access policy.
-   Signed delivery.
-   Versioning where needed.
-   Retention classification.
-   Audit of sensitive access/download.
-   Storage-provider abstraction.

## 18. Audit and Activity

Audit security/business-sensitive actions: - Login/logout/session
revocation. - Role/permission changes. - Property/staff assignment. -
Tenant onboarding/offboarding. - Financial approval/payment
adjustments. - Maintenance approvals. - CCTV view/playback/download. -
Incident actions. - Feature/admin configuration. - Sensitive document
access.

Audit records should be append-oriented and protected from normal user
mutation.

## 19. Reports and Analytics

-   Occupancy.
-   Vacancy duration/lost revenue.
-   Collection.
-   Arrears.
-   Expenses.
-   Maintenance costs.
-   Contractor performance.
-   Property/unit performance.
-   Service charge.
-   Security/incident.
-   Staff activity.
-   Portfolio comparison.

Exports must obey authorization and be audited when sensitive.

## 20. Property Intelligence

Potential insights: - Rising maintenance costs. - Repeat failures. -
Long vacancies. - Arrears patterns. - Expense anomalies. - Contractor
anomalies. - Security/access anomalies. - Utility anomalies.

Insights should link to supporting data and recommended next action.

## 21. Subscriptions and Entitlements

-   Plans.
-   Organization subscription.
-   Trial/status.
-   Unit limits.
-   Feature entitlements.
-   CCTV/security entitlement.
-   Usage counters.
-   Billing metadata.
-   Feature flags.

Authorization and feature entitlement are separate concepts: a user may
have permission for a feature that their organization has not purchased.

## 22. Elite Admin

-   Platform dashboard.
-   Organizations.
-   Users.
-   Roles/permissions.
-   Subscription management.
-   Feature flags.
-   Integrations.
-   Security events.
-   Audit search.
-   Support diagnostics.
-   Notification health.
-   System configuration.
-   Platform analytics.
-   Safe impersonation/support mode only if explicitly implemented with
    strict auditing and visible indication.

## 23. UX Requirements

Every major screen should define: - Loading/skeleton. - Empty state. -
Error state. - Permission-denied state. - Success feedback. - Responsive
behavior. - Keyboard/focus accessibility. - Reduced-motion behavior.

Avoid generic dashboard clutter. Make the next operational action
obvious.

## Landlord setup forms

The Properties page loads organization-scoped records and opens the property creation form. Unit counts are derived from the hierarchy; create buildings, floors and units separately. The Tenants page offers pre-registration by name, international phone number, property and vacant unit. Saving reserves the unit through the existing onboarding API; it does not complete verification or claim an SMS was delivered.

Integrations provides camera registration using a non-secret gateway reference and payment initiation for an existing pending payment through M-Pesa or Paystack. Gateway installation and provider secrets remain server-managed prerequisites. Registered cameras start OFFLINE until availability is established. Forms show backend errors and provider responses; initiating a payment does not assert settlement.

The top-bar and tenant greetings use browser local time, refresh every minute and on window focus: morning before 12:00, afternoon before 18:00, evening thereafter.

## Public Product Experience

The public cinematic demo system at `/demo`, `/demo/live`, `/demo/explore`, and `/demo/studio` uses an isolated fictional portfolio and shared scene renderer. It provides an executive scenario entrance, presenter playback, self-guided workflows, and social capture formats without calling production mutation APIs. The landing page reuses the demo stage. See `docs/CINEMATIC_DEMO.md` for the capture and safety contract.

The public `/` route presents a full-bleed, interactive Three.js digital twin of an illustrative residential portfolio. It shows apartment interiors, helmeted stick-figure contractors, residents, movers and a truck, staff consultation and camera coverage. The scene offers portfolio, unit, maintenance, move-in and security camera views. The page also presents responsive portfolio indicators, an animated collections chart, an attention queue and concise role/operations explanations. All figures and activity are labeled illustrative and do not call protected APIs. WebGL failure falls back to a generated portfolio image; reduced motion disables continuous scene animation. Camera resources are released when the page unmounts.

Demo-request CTAs open an accessible client-side form behind a typed `DemoRequestService` boundary. Until a production lead API or CRM is connected, submission only prepares a local reference and explicitly states that contact data was not delivered externally. Marketing interactions emit vendor-neutral `pmcc:marketing` browser events; no third-party analytics provider is installed.

## Owner social onboarding

Landlords can start Google, Facebook or Apple authorization when that provider is configured on the server. A one-time, browser-bound callback creates a pending flow. New owners supply their name, email, international phone and organization name, then verify the phone with an OTP before a session and LANDLORD membership are issued. Existing owners can link a new provider identity by confirming their account password and an OTP sent to their registered phone; no new organization is created. Returning linked owners also verify their registered phone. Provider identity is keyed by provider and subject; matching email alone never links an existing account. Provider secrets and tokens stay on the backend. Initial onboarding opens `/explore`, a guided owner tour with links to the workspace screens.

## Workspace 3D illustrations

The tenant workspace includes an animated, roof-open furnished home inspired by the supplied video, with residents walking through the rooms. Landlord, manager, caretaker and contractor workspaces show the existing property digital twin with portfolio, unit, security and maintenance camera framing respectively. These scenes are illustrative backgrounds, not a rendering of the authenticated user's actual unit, property inventory, CCTV, occupancy or job state. They do not affect backend authorization or operational data. Rendering pauses when offscreen, respects reduced-motion preferences, and remains separate from actionable controls.
