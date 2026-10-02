# Pain-first demonstration audit and design

Audited 2026-10-02 on existing `main`, fast-forwarded without cloning from
2039e51 to cfb82a6. The initial working tree was clean.

## Existing authorities and reuse

| Area                         | Found                                                                                                                                    | Extension decision                                                                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Demo                         | Public cinematic `/demo`, live/explore/studio; development-only typed browser demo provider                                              | Preserve these paths; add an authenticated sales controller and server-owned scenario sessions. Browser demo cannot authorize sales operations.                                     |
| Sales                        | SalesLead, public demo request, property setup assistance                                                                                | Extend SalesLead; use the existing Sales router, auth, response and error conventions. No parallel CRM.                                                                             |
| Auth / scope                 | Password/OTP, sessions, SUPER_ADMIN password → email → SMS MFA, server RBAC/ABAC and scoped resources                                    | Preserve authentication. Admin or explicitly delegated sales permission; seller owns each session.                                                                                  |
| Portfolio                    | Organization → Property → Building → Floor → Unit; transactional property setup                                                          | Guided pilots use these records and the same hierarchy; demo synthetic IDs never reference customer records.                                                                        |
| Tenant / tenancy             | User-backed tenants, controlled OTP onboarding, scoped tenancies and move-outs                                                           | Reuse real User/Tenant/Tenancy models for confirmed pilot imports; do not send onboarding OTPs or assign arbitrary existing users during import.                                    |
| Money                        | KES legacy/dual minor-unit ledger, transactional payment allocations, provider reconciliation/refunds                                    | Demo uses integer cents in an isolated snapshot. It cannot call payment services/providers or write Payment/RentCharge. Pilot opening balances use real audited RentCharge records. |
| Maintenance / costs          | Explicit transitions, thresholds, contractor scope, evidence, approval and cost validation                                               | Mirror supported business states in simulation; share transition guards with production. Preserve actual domain workflows.                                                          |
| Notifications                | Notification, Job, SMS/email providers                                                                                                   | Demo notifications are snapshot records labelled SIMULATED. Pilot allows in-app operations; external operational delivery is suppressed until paid activation.                      |
| Documents / evidence / audit | Scoped documents, storage adapters, hashes, append-oriented audit/event history                                                          | Demo retains synthetic evidence/checksums and transactional AuditLog, explicitly simulated. No production storage URLs.                                                             |
| Security / CCTV              | Fort Knox entitlement, gateway switches, scoped camera/incident/evidence APIs                                                            | Synthetic security telemetry stays in demo snapshot and never requests a gateway session.                                                                                           |
| Plans / subscriptions        | Central EntitlementService, configurable Control/Fort Knox limits, trials                                                                | Capability follows selected plan. Pilot time-limited entitlement uses existing SubscriptionPlan; unit scale does not select Fort Knox.                                              |
| Commercial onboarding        | Versioned contracts, e-signature/PDFs, invoice/prepaid provider verification, activation                                                 | No subscription/invoice/payment is created by a demo or pilot. Conversion continues through existing owner onboarding and authoritative verified activation.                        |
| SUPER_ADMIN / intelligence   | Plan Performance, retained Morning Brief, operational telemetry, organization-scoped landlord intelligence                               | Add meaningful sales conversion cohorts to existing platform experience. Demo snapshots cannot enter live BI aggregates.                                                            |
| Trials / pilot / import      | Existing trial lifecycle and batch property setup; no pain-specific durable demo, guided activation pilot or full import preview/confirm | Add pilot metadata to Organization, actual-activity readiness/summary, and validated transactional import into existing models.                                                     |

## New boundaries

SalesDemoSession stores the selected profile and isolated deterministic business
snapshot. SalesValueEvent stores immutable command/outcome evidence, separate
from live finance and subscription reporting. Mutations use revision checks,
command keys and MongoDB transactions alongside the existing audit service.
Reset replaces only that session snapshot; historical sales events survive.

Organization.guidedPilot holds a bounded, server-controlled pilot grant. It is
not writable through organization settings. It expires server-side and does not
mark commercial onboarding ACTIVE. SubscriptionPlan remains capability authority;
a temporary pilot grant does not insert an active subscription or fabricate MRR.
Pilot readiness derives from actual configured entities and audit activity.
Bulk imports validate, preview, detect duplicates, require a matching digest and
confirmation, and commit existing hierarchy/tenant/tenancy/opening balance models
with audit in one transaction. No imported identity can overwrite an account.

## Intended verification

Unit policy/data tests; authenticated/cross-seller/security HTTP tests; Mongo
replica-set Control/Fort Knox/conversion/reset/concurrency/rollback tests; real
browser desktop/mobile/light/dark/keyboard journeys; all existing typecheck,
lint, unit, E2E, production build and release-certification gates. No provider
network call is part of the simulator. Full diff and status review precede push.
