# Status and lifecycle visual system

## Audit before implementation — 3 October 2026

Baseline: main at f9419a5. Working functionality and backend contracts are preserved.

The application already has shared Badge/Alert components in components/ui.tsx, light/dark semantic surface variables in globals.css, hierarchy/tenancy/onboarding badges, workspace Status, and a separate sales DemoStatus. These use independent tone decisions. Archived hierarchy records incorrectly appear red; pending tenancies appear blue; subscription and camera states share ad hoc rules; shared badges/alerts have fixed light colors. Property setup and commercial onboarding trackers give previous/current steps nearly identical emphasis. Pilot checklist uses independent colors. Status filters already exist on operational domain lists and monitoring; they must retain backend values.

Sources inspected: database/models (all status/state/stage/condition/grade/mode/decision enums), frontend resource-types and domain DTOs, all Badge/Status/DemoStatus consumers, property setup, commercial onboarding, pilot, maintenance, platform monitoring/control, sales stories, finance and security.

Architecture decision: extend the existing UI layer with a domain-aware semantic registry and theme tokens; reuse Badge/Alert surfaces. Introduce one reusable ordered WorkflowPipeline with explicit completed/current/upcoming/blocked/failed/skipped positions. This is presentation only: no API, database, enum, authorization, provider or transition changes.

Work orders use MaintenanceRequest; e-signature uses OrganizationContract and organization onboarding; evidence follows Document and evidence chains. Control/Fort Knox are capability tiers, not health states. A configured integration is not proof of live provider health. Unknown/new states retain their label with neutral styling rather than implying success.

Known contract differences: NEW means a new maintenance report but also a new inventory condition; OPEN means unpaid finance, an open financial period, or unresolved incident; ACTIVE means healthy tenancy/subscription/hierarchy but operational work in serving/security contexts. PENDING approval must be review-colored while a pending payment is waiting-colored. Tenant onboarding VERIFIED and COMPLETED are separate; maintenance COMPLETED is not yet VERIFIED/CLOSED. Sales simulation includes ESCALATED incidents and RECONCILED payments; do not add these to production enums. InventoryItem.condition includes DISPOSED in both the frontend and persisted Mongoose enum; the create API deliberately accepts only NEW/GOOD/FAIR/POOR/DAMAGED initial conditions. Preserve that input restriction. Maintenance QUOTED is declared, but the quote action moves directly to APPROVAL_REQUIRED or APPROVED; a quotation milestone represents the recorded quote, not an invented persisted transition.

The complete backend inventory and resolved visual mapping are appended below during implementation.

## Complete default status mapping

Domain exceptions in the next table take precedence. Unknown states remain neutral and retain their readable label.

| Semantic | Color family | Existing states / presentation aliases |
| --- | --- | --- |
| neutral | Slate | INFO, UNKNOWN, DRAFT, NOT_STARTED, NOT_TESTED, NOT_CONFIGURED, UNCONFIGURED, NOT_DEPLOYED, NOT_SCHEDULED, PROSPECT, PRE_REGISTERED, ACCOUNT_CREATED, UNSUBSCRIBED |
| pending | Warm amber | PENDING, QUEUED, AWAITING, REQUESTED, SCHEDULED, RESERVED, DUE, OPEN, RECEIVED, INVOICED, ASSESSED, PAYMENT_PENDING, INVOICE_ISSUED, AWAITING_DOCUMENTS, PENDING_PROVIDER_SETUP, OTP_SENT, EMAIL, SMS |
| processing | Blue | IN_PROGRESS, PROCESSING, RUNNING, SUBMITTING, STARTED, INITIATED, ASSIGNED, TRIAGED, RETRYING, SCHEDULING, CHECKING, UNDER_REPAIR, INVESTIGATING, ACKNOWLEDGED, CONTACTED, SENT, ORGANIZATION_CONFIGURED, PLAN_SELECTED, CONTRACT_GENERATED, TRIALING, CANARY, ACTIVE_WORK |
| review | Violet | SUBMITTED, UNDER_REVIEW, REVIEW, APPROVAL_REQUIRED, AWAITING_APPROVAL, PENDING_SIGNATURE, CONTRACT_PENDING_SIGNATURE, INSPECTION_PENDING, RECONCILIATION_PENDING, CANDIDATE, CHALLENGED |
| attention | Amber/orange | WARNING, WATCH, AT_RISK, NEEDS_ACTION, NEEDS_ATTENTION, REQUIRES_ATTENTION, DEGRADED, SUBMISSION_UNKNOWN, NOTICE, VACANT, PROMISED, FAIR, MODERATE, MEDIUM, HIGH, URGENT, INSUFFICIENT_DATA, QUOTED |
| blocked | Restrained red | BLOCKED, OVERDUE, CRITICAL, EMERGENCY, PAST_DUE, OFFLINE, MISSING, QUARANTINED, BLACKLISTED, ESCALATED, DEAD_LETTER, DAMAGED, POOR, ROLLBACK |
| failed | Restrained red | FAILED, REJECTED, ERROR, DENIED, INVALIDATED, UNCOLLECTIBLE |
| success | Green | APPROVED, VERIFIED, HEALTHY, SUCCESSFUL, CONFIRMED, VALIDATED, PROMOTED, ACTIVE, OCCUPIED, ONLINE, ON, ENABLED, CONFIGURED, PASSED, READY, EXCELLENT, GOOD, LOW, NONE, NORMAL, GRANTED, ACCEPTED, SIGNED, CONTRACT_SIGNED, PAYMENT_VERIFIED, CONTAINED, KEEP |
| completed | Teal/green | COMPLETED, RESOLVED, PAID, CLOSED, SUCCEEDED, PROCESSED, RECONCILED, DELIVERED, READ, CONSUMED, OBSERVED |
| paused | Muted amber/gray | PAUSED, SUSPENDED, ON_HOLD, MAINTENANCE |
| inactive | Neutral gray | CANCELLED, DISABLED, INACTIVE, DEACTIVATED, REMOVED, REVOKED, VOID, DISMISSED, FALSE_ALARM, NOT_APPLICABLE, IGNORED, REVERSED, EXPIRED, DISABLE |
| archived | Low-emphasis slate | ARCHIVED, RETIRED, HISTORICAL, MOVED_OUT, TERMINATED, DISPOSED, WRITTEN_OFF, CENSORED |

Additional defaults: NEW → pending; PARTIALLY_PAID → attention; SHADOW → neutral; OFF → inactive; REVIEW_REQUIRED → review; VALID/PASS → success; WARN → attention; FAIL → failed.

## Domain exceptions

| Domain | Backend state → semantic |
| --- | --- |
| onboarding | PAYMENT_FAILED → failed; CHECKOUT_PREPARATION_FAILED → failed; PAYMENT_RECONCILIATION_REQUIRED → review; RENEWAL_REQUIRES_ATTENTION → attention |
| unit | VACANT → attention; MAINTENANCE → paused |
| tenancy | NOTICE → attention; MOVED_OUT → archived; TERMINATED → inactive |
| maintenance | NEW → pending; CLOSED → completed; QUOTED → review |
| inventory | NEW → success |
| rent | OPEN → pending; PARTIALLY_PAID → attention |
| payment | ACTIVE → processing |
| reconciliation | PENDING → review |
| expense | SUBMITTED → review |
| approval | PENDING → review; EXPIRED → inactive |
| period | OPEN → success; CLOSED → archived; LOCKED → paused |
| incident | OPEN → attention; ACTIVE → attention; CLOSED → completed |
| alert | OPEN → attention; ACTIVE → attention |
| integration | MAINTENANCE → paused; OFF → inactive; MISSING → neutral; PARTIAL → attention |
| subscription | ACTIVE → success; EXPIRED → attention |
| billing | OPEN → pending |
| monitoring | OPEN → attention |
| automation | OPEN → attention |
| predictive | LOW → success; HIGH → attention |
| serving | ACTIVE → processing; SHADOW → neutral; CANARY → processing |
| sales | NEW → pending; OPEN → attention; PILOT → processing; DEMO_PREPARED → pending; DEMO_COMPLETED → completed; PILOT_STARTED → processing; ACTIVATED → success; PAID_ACTIVE → success; RETAINED → success |

## Persisted backend workflow inventory

This inventory was generated from the existing Mongoose enum declarations; it is not a new set of transitions. Optional steps must be marked skipped where the record proves they did not occur. Financial periods use archived CLOSED; maintenance/incidents use completed CLOSED.

| Model / field | Domain | State → semantic |
| --- | --- | --- |
| AccessEvent.decision | general | GRANTED → success; DENIED → failed; UNKNOWN → neutral |
| AccessPoint.status | integration | ACTIVE → success; OFFLINE → blocked; DISABLED → inactive; MAINTENANCE → paused |
| AdminAuthFlow.stage | auth | EMAIL → pending; SMS → pending; VERIFIED → success; COMPLETED → completed; INVALIDATED → failed |
| ArrearsCase.status | alert | OPEN → attention; CONTACTED → processing; PROMISED → attention; ESCALATED → blocked; RESOLVED → completed; WRITTEN_OFF → archived |
| BillingEvent.status | billing | RECEIVED → pending; PROCESSED → completed; FAILED → failed; IGNORED → inactive |
| Building.status | entity | ACTIVE → success; INACTIVE → inactive; ARCHIVED → archived |
| ContractTemplate.status | contract | DRAFT → neutral; ACTIVE → success; RETIRED → archived |
| Contractor.status | contractor | ACTIVE → success; INACTIVE → inactive; SUSPENDED → paused |
| DecisionAutomationRun.status | job | RUNNING → processing; SUCCEEDED → completed; FAILED → failed |
| Document.status | document | ACTIVE → success; ARCHIVED → archived; QUARANTINED → blocked |
| Expense.status | expense | DRAFT → neutral; SUBMITTED → review; APPROVED → success; PAID → completed; REJECTED → failed; VOID → inactive |
| FinancialPeriod.status | period | OPEN → success; CLOSED → archived; LOCKED → paused |
| Floor.status | entity | ACTIVE → success; INACTIVE → inactive; ARCHIVED → archived |
| IdempotencyRecord.status | general | PROCESSING → processing; COMPLETED → completed |
| Incident.severity | incident | LOW → success; MEDIUM → attention; HIGH → attention; CRITICAL → blocked |
| Incident.status | incident | OPEN → attention; INVESTIGATING → processing; CONTAINED → success; RESOLVED → completed; CLOSED → completed; FALSE_ALARM → inactive |
| Inspection.status | inspection | DRAFT → neutral; IN_PROGRESS → processing; COMPLETED → completed; VOID → inactive |
| Inspection.overallCondition | inspection | EXCELLENT → success; GOOD → success; FAIR → attention; POOR → blocked; DAMAGED → blocked |
| Inspection.condition | inspection | EXCELLENT → success; GOOD → success; FAIR → attention; POOR → blocked; DAMAGED → blocked; NOT_APPLICABLE → inactive |
| IntegrationAttempt.status | integration | STARTED → processing; SUCCEEDED → completed; FAILED → failed; RETRYING → processing |
| IntelligenceAlert.severity | alert | INFO → neutral; LOW → success; MEDIUM → attention; HIGH → attention; CRITICAL → blocked |
| IntelligenceAlert.status | alert | OPEN → attention; ACKNOWLEDGED → processing; RESOLVED → completed; DISMISSED → inactive |
| InventoryItem.condition | inventory | NEW → success; GOOD → success; FAIR → attention; POOR → blocked; DAMAGED → blocked; DISPOSED → archived |
| InventoryItem.status | inventory | ACTIVE → success; MISSING → blocked; UNDER_REPAIR → processing; DISPOSED → archived |
| Invitation.status | onboarding | PENDING → pending; ACCEPTED → success; REVOKED → inactive; EXPIRED → inactive |
| Job.status | job | QUEUED → pending; RUNNING → processing; SUCCEEDED → completed; FAILED → failed; CANCELLED → inactive; DEAD_LETTER → blocked |
| LandlordAction.status | automation | OPEN → attention; ACKNOWLEDGED → processing; IN_PROGRESS → processing; RESOLVED → completed; DISMISSED → inactive |
| LaunchReadiness.severity | monitoring | NONE → success; LOW → success; HIGH → attention; CRITICAL → blocked |
| MaintenanceRequest.status | maintenance | NEW → pending; TRIAGED → processing; ASSIGNED → processing; QUOTED → review; APPROVAL_REQUIRED → review; APPROVED → success; IN_PROGRESS → processing; COMPLETED → completed; VERIFIED → success; CLOSED → completed; CANCELLED → inactive |
| ModelActivationApproval.mode | serving | CANARY → processing; ACTIVE → processing |
| ModelActivationApproval.status | approval | PENDING → review; APPROVED → success; REJECTED → failed; EXPIRED → inactive; REVOKED → inactive |
| ModelDeployment.mode | serving | SHADOW → neutral; CANARY → processing; ACTIVE → processing |
| ModelMonitoringSnapshot.driftStatus | monitoring | HEALTHY → success; WARNING → attention; CRITICAL → blocked |
| ModelMonitoringSnapshot.performanceStatus | monitoring | HEALTHY → success; WARNING → attention; CRITICAL → blocked |
| ModelMonitoringSnapshot.overallStatus | monitoring | HEALTHY → success; WARNING → attention; CRITICAL → blocked |
| ModelMonitoringSnapshot.recommendation | monitoring | KEEP → success; REVIEW → review; ROLLBACK → blocked; DISABLE → inactive |
| ModelSafetyIncident.severity | incident | LOW → success; MEDIUM → attention; HIGH → attention; CRITICAL → blocked |
| ModelSafetyIncident.status | incident | OPEN → attention; ACKNOWLEDGED → processing; RESOLVED → completed; DISMISSED → inactive |
| ModelServingPolicy.mode | serving | SHADOW → neutral; CANARY → processing; ACTIVE → processing |
| ModelTrainingRun.status | job | RUNNING → processing; SUCCEEDED → completed; FAILED → failed; INSUFFICIENT_DATA → attention |
| MoveOut.status | onboarding | INITIATED → processing; INSPECTION_PENDING → review; RECONCILIATION_PENDING → review; COMPLETED → completed; CANCELLED → inactive |
| MoveOut.condition | onboarding | EXCELLENT → success; GOOD → success; FAIR → attention; POOR → blocked; DAMAGED → blocked |
| Notification.status | notification | QUEUED → pending; SENT → processing; DELIVERED → completed; READ → completed; FAILED → failed; CANCELLED → inactive |
| Organization.status | onboarding | ACTIVE → success; SUSPENDED → paused |
| Organization.state | onboarding | ACCOUNT_CREATED → neutral; ORGANIZATION_CONFIGURED → processing; PLAN_SELECTED → processing; CONTRACT_GENERATED → processing; CONTRACT_PENDING_SIGNATURE → review; CONTRACT_SIGNED → success; INVOICE_ISSUED → pending; PAYMENT_PENDING → pending; PAYMENT_VERIFIED → success; ACTIVE → success |
| OrganizationContract.status | contract | PENDING_SIGNATURE → review; SIGNED → success |
| OrganizationMembership.status | entity | ACTIVE → success; SUSPENDED → paused; REMOVED → inactive |
| OrganizationSubscription.status | subscription | PENDING → pending; TRIALING → processing; ACTIVE → success; PAST_DUE → blocked; PAUSED → paused; CANCELLED → inactive; EXPIRED → attention |
| OrganizationSubscription.renewalState | subscription | NOT_SCHEDULED → neutral; SCHEDULING → processing; SCHEDULED → pending; REQUIRES_ATTENTION → attention |
| OtpChallenge.deliveryStatus | auth | PENDING → pending; SENT → processing; FAILED → failed |
| Payment.status | payment | PENDING → pending; CONFIRMED → success; FAILED → failed; REVERSED → inactive |
| PaymentDestination.status | integration | PENDING_PROVIDER_SETUP → pending; ACTIVE → success; DISABLED → inactive |
| PaymentRefund.status | refund | SUBMITTING → processing; SUBMISSION_UNKNOWN → attention; PENDING → pending; PROCESSING → processing; NEEDS_ATTENTION → attention; FAILED → failed; PROCESSED → completed |
| PlatformMonitoring.severity | monitoring | LOW → success; HIGH → attention; CRITICAL → blocked |
| PlatformMonitoring.status | monitoring | OPEN → attention; ACKNOWLEDGED → processing; RESOLVED → completed |
| PlatformSwitch.mode | integration | ON → success; OFF → inactive; MAINTENANCE → paused |
| PredictiveModel.status | predictive | CANDIDATE → review; VALIDATED → success; PROMOTED → success; RETIRED → archived |
| PredictiveObservation.labelStatus | predictive | PENDING → pending; OBSERVED → completed; CENSORED → archived |
| Property.status | entity | ACTIVE → success; INACTIVE → inactive; ARCHIVED → archived |
| PropertyHealthSnapshot.grade | monitoring | EXCELLENT → success; GOOD → success; WATCH → attention; AT_RISK → attention; CRITICAL → blocked |
| PropertyOnboardingRequest.status | onboarding | REQUESTED → pending; SCHEDULED → pending; IN_PROGRESS → processing; COMPLETED → completed; CANCELLED → inactive |
| RentCharge.status | rent | OPEN → pending; PARTIALLY_PAID → attention; PAID → completed; OVERDUE → blocked; VOID → inactive |
| SecurityCamera.status | integration | ONLINE → success; OFFLINE → blocked; DEGRADED → attention; MAINTENANCE → paused; DISABLED → inactive |
| SecurityEvent.severity | alert | INFO → neutral; LOW → success; MEDIUM → attention; HIGH → attention; CRITICAL → blocked |
| SecurityEvent.status | alert | OPEN → attention; ACKNOWLEDGED → processing; ESCALATED → blocked; RESOLVED → completed; DISMISSED → inactive |
| ServiceChargeAssessment.status | rent | ASSESSED → pending; INVOICED → pending; PAID → completed; VOID → inactive |
| SocialAuthFlow.status | auth | STARTED → processing; VERIFIED → success; CHALLENGED → review; CONSUMED → completed |
| SubscriptionInvoice.status | billing | DRAFT → neutral; OPEN → pending; PAID → completed; PAST_DUE → blocked; VOID → inactive; UNCOLLECTIBLE → failed |
| Tenancy.status | tenancy | DRAFT → neutral; PENDING → pending; ACTIVE → success; NOTICE → attention; MOVED_OUT → archived; TERMINATED → inactive |
| Tenant.status | entity | PROSPECT → neutral; ACTIVE → success; INACTIVE → inactive; BLACKLISTED → blocked |
| TenantArrearsRisk.grade | predictive | LOW → success; MODERATE → attention; HIGH → attention; CRITICAL → blocked |
| TenantOnboarding.status | onboarding | PRE_REGISTERED → neutral; OTP_SENT → pending; VERIFIED → success; COMPLETED → completed; REJECTED → failed; EXPIRED → inactive |
| Unit.status | unit | VACANT → attention; OCCUPIED → success; RESERVED → pending; MAINTENANCE → paused; INACTIVE → inactive |
| User.status | entity | ACTIVE → success; SUSPENDED → paused; DEACTIVATED → inactive |
| WebhookEvent.status | integration | RECEIVED → pending; PROCESSED → completed; FAILED → failed; IGNORED → inactive |

Audited 75 persisted lifecycle/condition fields, 323 enum entries. Additional computed DTO states include HEALTHY/NEEDS_ACTION/BLOCKED/NOT_CONFIGURED monitoring, MISSING/PARTIAL/CONFIGURED/NOT_APPLICABLE readiness configuration, NOT_STARTED/AWAITING_DOCUMENTS/SUBMITTED/APPROVED launch onboarding, NOT_TESTED/PASSED/FAILED/NOT_APPLICABLE staging, and simulated RECONCILED/ESCALATED sales states.


## Shared implementation

`src/lib/status.ts` is the sole domain-aware state registry. `normalizeStatus` accepts existing underscore, space and hyphen labels without modifying API values. Unknown values stay neutral. `StatusBadge` retains text, adds a decorative semantic icon and exposes domain/semantic metadata. `StatusSelect` retains native option values, keyboard behavior and existing handlers. The original `Badge` API remains available for categories and numeric summaries; `Alert` shares the themed tokens.

`WorkflowPipeline` uses an ordered list, explicit position labels, decorative icons and `aria-current="step"`. Current/blocked/failed stages have an inset outline; completed steps use a quieter surface; future/skipped stages use dashed borders. Connectors reflect completion. Desktop/laptop/tablet tracks scroll inside their container and reveal the current step without moving the page; mobile tracks stack vertically. The rail is keyboard focusable. Statuses do not animate, including archived/failed/completed states, and existing reduced-motion behavior remains.

`orderedWorkflow` renders wizard progress; `lifecycleWorkflow` renders an authoritative current state on an established path. Cancellation/unknown branches say `History not inferred` rather than manufacturing completed history. `maintenanceWorkflow` skips approval only after a recorded quotation confirms auto-approval; the default pre-quote false flag does not skip a future stage. These trackers describe progression; existing audit/evidence records remain the source of event timestamps and decisions.

Reused hierarchy/tenancy/onboarding/workspace/demo badge wrappers now delegate to the registry. Applied to finance/rent/arrears/payments/refunds/reconciliation, maintenance/expenses/contractors, properties/buildings/floors/units/passports, tenants/tenancies, inspection/inventory role workspaces, documents/evidence, security incidents/events/cameras/access, notifications/jobs, subscription/commercial onboarding, integrations, model serving/approval/monitoring, intelligence, launch readiness, platform control/business drill-downs and sales conversion views.

Pipelines are integrated into property setup, landlord commercial activation, administrator MFA, contractor work orders, sales repair/security stories and guided pilot readiness. Existing status/severity/mode filters use themed native selects; the generic record list now combines real status filtering with search. Simple labeled badges need no additional legend. Control/Fort Knox remain product capabilities, not workflow health states.

## Extending the system

1. Keep the backend state and transition contract unchanged.
2. Add the state to a default semantic group, or a domain exception when its meaning differs.
3. Render `StatusBadge`/`StatusSelect` with the appropriate domain; avoid local tone branches.
4. Describe pipeline positions from saved state and known optional-path facts. Do not infer event timestamps or approvals from appearance.
5. Run enum coverage, component/contrast tests and the affected browser workflow.

No new dependency, API, database, index, persisted status, environment file or commercial/authentication/provider behavior was introduced.

## Light/dark status tokens

All rows have an opaque, lightly tinted surface; foreground contrast is tested at 4.5:1 or better. Pipeline history uses quieter existing panel surfaces.

| Semantic | Light background / text / border | Dark background / text / border |
| --- | --- | --- |
| neutral | #f0f2f3 / #475467 / #d0d5dd | #252d38 / #b8c3d1 / #455263 |
| pending | #fff9ed / #845414 / #e8d7b8 | #342d22 / #e5c58e / #615239 |
| processing | #edf4fb / #315a86 / #c5d7e8 | #202f41 / #adcbea / #425b75 |
| review | #f3f0fa / #655086 / #d9cfe9 | #302b40 / #c9bade / #57496d |
| attention | #fff4e9 / #965522 / #ebd2ba | #392e23 / #e9bb8c / #6b5139 |
| blocked | #fbeeee / #9b3e3f / #e7caca | #3b282d / #edb2b4 / #705057 |
| failed | #faeceb / #9f3730 / #e9c8c4 | #3d2828 / #f1b0a9 / #75504b |
| success | #edf6f0 / #356948 / #c8decf | #24372f / #add6b8 / #456650 |
| completed | #e7f3ef / #216651 / #bdd8cd | #20372f / #9ed5bf / #3f6756 |
| paused | #f3f0e9 / #6c6147 / #dcd5c5 | #302e29 / #cfc6b0 / #595448 |
| inactive | #f0f1f2 / #626b76 / #d4d8dd | #282d33 / #b2bac5 / #48515e |
| archived | #f3f4f6 / #667085 / #dde1e7 | #242a32 / #a6b2c2 / #3d4857 |


## Validation and release review

| Gate | Final result |
| --- | --- |
| Backend typecheck/build | PASS |
| Backend lint | PASS: 0 errors, 432 existing warnings |
| Backend unit tests | PASS: 65 files, 348 tests; six opt-in E2E files excluded here and run separately |
| Backend replica-set/HTTP E2E | PASS: 6 files, 141 tests, 225.49 seconds |
| Static release certification | CERTIFIED_STATIC: 36 route files, 155 permissions, 10 critical paths |
| Frontend typecheck/build | PASS |
| Frontend lint | PASS: 0 errors, 27 existing warnings |
| Frontend tests | PASS: 30 files, 248 tests, 6.81 seconds |
| New status suite | PASS: 54 tests, including persisted enum coverage, context exceptions, retained Badge API, selected option values, pipeline semantics and twelve palette contrast pairs |
| Status browser verification | PASS: 12 cases; light/dark at 320, 390, 768, 1366, 1440 and 1920 pixels; labels, contrast, reduced motion, container fit and pipeline positions |
| Sales browser verification | PASS: real MFA, Control rent/repair transitions, Fort Knox incident/evidence/response, reset/isolation, pilot validation/import, owner activation milestone, commercial handoff and sales intelligence; both themes; 1440/834/390 pixels; keyboard; zero runtime errors |
| SUPER_ADMIN browser verification | PASS: authenticated sidebar/routes, recovery from malformed analytics, scope/logout/MFA and preview isolation; real INVESTIGATING incident semantics and computed contrast in both themes |
| Production public regressions | PASS: 12 landing cases and 18 cinematic cases; action hit tests, text fit, scene reachability, keyboard/role/theme/approval behavior, no overflow/runtime errors/unexpected operational writes |

The backend E2E runner requires a startup MongoDB URI before its private in-memory fixture takes over. Verification supplied isolated process configuration; application environment files and customer databases were not changed. Baseline lint warnings were retained; no test assertion, security control or gate was weakened.

## Remaining lifecycle considerations

- Healthy ACTIVE access points use integration semantics (success); ACTIVE alerts/incidents use attention semantics. Regression cases retain this distinction.
- Backend NEW, OPEN, ACTIVE and PENDING intentionally have different meanings by domain; the explicit exceptions above preserve those contracts.
- Maintenance QUOTED is declared although the existing quotation action advances directly to APPROVAL_REQUIRED/APPROVED. A quotation milestone represents saved quotation data, not an invented new transition.
- Inventory DISPOSED is persisted/readable but not accepted as an initial create condition; that existing input restriction remains.
- Free-form or future states keep their label and neutral styling until their domain meaning is registered. The persisted-enum coverage test guards known enum additions.
- Progress trackers describe the current known path. They do not manufacture timestamps, evidence, approvals or historical branch completion; existing audit/evidence screens remain the source of detailed history.
- Provider/CCTV configuration is separate from health. These presentation checks do not certify a live provider or hardware connection.

## Files changed

Added 6 files; modified 67 existing files. Generated Next types, ignored test artifacts and the three .continue/rules files are excluded.

| Change | File |
| --- | --- |
| Added | `apps/frontend/src/lib/status.ts` |
| Added | `apps/frontend/src/lib/status.test.tsx` |
| Added | `apps/frontend/src/components/workflow-pipeline.tsx` |
| Added | `apps/frontend/scripts/status-visual-checks.mjs` |
| Added | `apps/frontend/scripts/verify-status-system.mjs` |
| Added | `docs/STATUS_VISUAL_SYSTEM.md` |
| Modified | `.github/workflows/quality.yml` |
| Modified | `apps/frontend/package.json` |
| Modified | `apps/frontend/scripts/verify-platform-business.mjs` |
| Modified | `apps/frontend/scripts/verify-sales-demo.mjs` |
| Modified | `apps/frontend/src/app/(dashboard)/billing/page.tsx` |
| Modified | `apps/frontend/src/app/(dashboard)/buildings/[buildingId]/page.tsx` |
| Modified | `apps/frontend/src/app/(dashboard)/dashboard/page.tsx` |
| Modified | `apps/frontend/src/app/(dashboard)/decision-automation/page.tsx` |
| Modified | `apps/frontend/src/app/(dashboard)/documents/[documentId]/page.tsx` |
| Modified | `apps/frontend/src/app/(dashboard)/documents/page.tsx` |
| Modified | `apps/frontend/src/app/(dashboard)/finance/page.tsx` |
| Modified | `apps/frontend/src/app/(dashboard)/floors/[floorId]/page.tsx` |
| Modified | `apps/frontend/src/app/(dashboard)/integrations/page.tsx` |
| Modified | `apps/frontend/src/app/(dashboard)/intelligence/page.tsx` |
| Modified | `apps/frontend/src/app/(dashboard)/maintenance/page.tsx` |
| Modified | `apps/frontend/src/app/(dashboard)/model-serving/page.tsx` |
| Modified | `apps/frontend/src/app/(dashboard)/notifications/page.tsx` |
| Modified | `apps/frontend/src/app/(dashboard)/operations/page.tsx` |
| Modified | `apps/frontend/src/app/(dashboard)/platform/page.tsx` |
| Modified | `apps/frontend/src/app/(dashboard)/predictive-intelligence/page.tsx` |
| Modified | `apps/frontend/src/app/(dashboard)/properties/[propertyId]/page.tsx` |
| Modified | `apps/frontend/src/app/(dashboard)/security/page.tsx` |
| Modified | `apps/frontend/src/app/(dashboard)/tenants/[tenantId]/page.tsx` |
| Modified | `apps/frontend/src/app/(dashboard)/tenants/page.tsx` |
| Modified | `apps/frontend/src/app/(dashboard)/units/[unitId]/page.tsx` |
| Modified | `apps/frontend/src/app/dev/certification/page.tsx` |
| Modified | `apps/frontend/src/app/globals.css` |
| Modified | `apps/frontend/src/app/onboarding/page.tsx` |
| Modified | `apps/frontend/src/components/auth/admin-mfa-panel.tsx` |
| Modified | `apps/frontend/src/components/caretakers/caretaker-workspace.tsx` |
| Modified | `apps/frontend/src/components/contractors/contractor-workspace.tsx` |
| Modified | `apps/frontend/src/components/integrations/setup-forms.tsx` |
| Modified | `apps/frontend/src/components/landlord-oversight.tsx` |
| Modified | `apps/frontend/src/components/landlords/landlord-control-panel.tsx` |
| Modified | `apps/frontend/src/components/launch-readiness.tsx` |
| Modified | `apps/frontend/src/components/list-page.tsx` |
| Modified | `apps/frontend/src/components/managers/manager-workspace.tsx` |
| Modified | `apps/frontend/src/components/payments/pay-rent-dialog.tsx` |
| Modified | `apps/frontend/src/components/payments/payment-destinations.tsx` |
| Modified | `apps/frontend/src/components/payments/payment-refund-review.tsx` |
| Modified | `apps/frontend/src/components/platform-business.tsx` |
| Modified | `apps/frontend/src/components/platform-controls.tsx` |
| Modified | `apps/frontend/src/components/platform-monitoring.tsx` |
| Modified | `apps/frontend/src/components/properties/building-card.tsx` |
| Modified | `apps/frontend/src/components/properties/floor-card.tsx` |
| Modified | `apps/frontend/src/components/properties/hierarchy-status-badge.tsx` |
| Modified | `apps/frontend/src/components/properties/property-card.tsx` |
| Modified | `apps/frontend/src/components/properties/property-form.tsx` |
| Modified | `apps/frontend/src/components/properties/property-passport.tsx` |
| Modified | `apps/frontend/src/components/properties/property-setup-wizard.tsx` |
| Modified | `apps/frontend/src/components/properties/unit-card.tsx` |
| Modified | `apps/frontend/src/components/sales/demo-status.tsx` |
| Modified | `apps/frontend/src/components/sales/guided-pilot-workspace.tsx` |
| Modified | `apps/frontend/src/components/sales/sales-demo-controller.tsx` |
| Modified | `apps/frontend/src/components/sales/sales-intelligence.tsx` |
| Modified | `apps/frontend/src/components/tenancies/onboarding-status.tsx` |
| Modified | `apps/frontend/src/components/tenancies/tenancy-status-badge.tsx` |
| Modified | `apps/frontend/src/components/tenants/tenant-form.tsx` |
| Modified | `apps/frontend/src/components/tenants/tenant-header.tsx` |
| Modified | `apps/frontend/src/components/tenants/tenant-onboarding-form.tsx` |
| Modified | `apps/frontend/src/components/tenants/tenant-workspace.tsx` |
| Modified | `apps/frontend/src/components/ui.tsx` |
| Modified | `apps/frontend/src/components/workspaces/shared.tsx` |
| Modified | `apps/frontend/src/lib/data/sales-demo.ts` |
| Modified | `apps/frontend/vitest.config.mts` |
| Modified | `docs/CODEX_EXECUTION_TRACKER.md` |
| Modified | `docs/TESTING_STRATEGY.md` |
