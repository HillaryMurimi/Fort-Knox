# Landlord contract, prepaid billing and activation

## Existing architecture reused

Organizations and memberships remain the tenancy boundary. OrganizationSubscription and SubscriptionInvoice remain the billing authority; PaystackBillingProvider, signed Paystack webhooks, recover-checkout and billing.reconcile are reused. Document and Evidence retain the artifacts; AuditLog and the transactional event store retain transitions. Tenant onboarding, property setup assistance, Coolify service definitions and legacy subscriptions remain in place.

The previous landlord screen had a client-only agreement checkbox, no versioned signature evidence and no backend contract prerequisite. Its initial Paystack request passed a recurring plan and a multiplied amount, although Paystack overrides amount when plan is supplied. The versioned workflow uses a separate one-off upfront checkout and creates the recurring subscription only after payment, with start_date at the prepaid access expiry.

## Contract lifecycle and templates

ContractTemplate contains a templateId, name, increasing integer version, effectiveAt, DRAFT/ACTIVE/RETIRED status, applicable plans, declared variables, immutable body and SHA-256. Content cannot be edited or deleted through model/query workflows, including drafts; corrections create a new version. The supported variables cover legal identity, organization ID, landlord account, tier, units, price, commitment, billing cycle, effective date and hardware terms. Publishing is an audited Super Admin transaction and retires the prior overlapping version. Retired versions cannot be reactivated. No template is automatically published.

The Super Admin landlord-onboarding tab provides a starting commercial draft. This draft is a review input, not legal certification: review the actual operator's terms, cancellation/refund rules, privacy policies and jurisdictional requirements before publishing it for real customers. There are no hard-coded organization values. An active, effective approved template is required to generate a contract.

OrganizationContract captures the rendered body, template identity/version/hash, organization and pricing snapshot, generation number and PDF IDs. Contract snapshots do not change when templates, catalog prices or organization display settings change. SHA-256 of the exact reviewed body is required at signing. An organization-wide LANDLORD with billing.subscription.manage must affirm authority and terms, supply a typed electronic signature and submit the reviewed hash. Super Admin cannot impersonate the landlord.

Signature evidence includes authenticated user ID, organization through the contract, signatory name, UTC server timestamp, explicit authority/terms acceptance, typed representation, reviewed document hash, evidence hash, request ID, IP address and user agent. Signing, signed PDF, Evidence, saved progress and audit commit atomically. This records an electronic agreement; it is not a certificate-based PDF signature or independent identity/legal validation.

Signed contracts and artifacts are immutable through ordinary services and model writes. An explicit pre-payment replacement requires a reason and current revision, preserves the predecessor and its signature/PDF, voids its unpaid invoice, generates a new snapshot/invoice and requires a new signature. Once checkout has begun or payment is settled, replacement is blocked pending payment/refund and amendment review. Paid contract amendments are intentionally not an automatic plan or settlement rewrite.

## Pricing, invoices and subsequent billing

The server calculates KES integer minor units from the selected plan. BASE_PLUS_ACTIVE_UNITS plans use the seeded includedUnits and additionalUnitAmount metadata and the declared initial portfolio count. Initial prepayment is 3–24 months, default 3; there is no trial activation shortcut. MONTH/QUARTER/YEAR plans allocate the plan interval amount to an exact monthly equivalent; initial and recurring amounts preserve the plan's billing cycle. Invalid precision, unsupported currency or inconsistent metadata fail closed. Taxes remain zero because the existing architecture has no tax calculation policy.

The activation SubscriptionInvoice has an organization-scoped invoice number, subscription/contract references, issue/due dates, commercial service period, line items, subtotal/tax/total in both legacy major units and exact minor units, currency, status, and PDF references. The PDF is created from the same snapshot as the invoice. It is the immutable invoice *as issued*; later payment is represented by a separate receipt, rather than rewriting the original PDF. The quoted service dates are fixed at issue. The prepaid access period starts at verified payment, and its actual dates are retained on the subscription and receipt.

Payment must match the persisted reference, currency and total. Only the existing signed webhook or server provider verification can settle it. The invoice, receipt, active subscription, organization activation, BillingEvent, audit and organization.activated event commit in one MongoDB transaction. A failed audit rolls back all of them. Duplicate delivery is harmless; a second charge with a different reference requires refund review.

The one-off upfront checkout omits Paystack's plan parameter. A dedicated recurring plan has the contracted recurring amount. After verified payment, a reusable authorization belonging to the expected customer schedules the first recurring debit at prepaid expiry. Private authorization and email tokens are excluded from normal reads. Ambiguous remote subscription submission is never automatically repeated: provider lookup can recover an existing schedule; absence/uncertainty raises REQUIRES_ATTENTION for support. The billing reconciliation job retries verification and safe schedule recovery, with a bounded 100-record batch. Operators must schedule/run the existing billing.reconcile job frequently enough for their load.

Subsequent paid renewals use the contracted unit/price snapshot, extend the existing billing cycle and retain invoice/receipt PDFs. An early charge before paid expiry is rejected for review. Existing plan changes take effect at a matching paid renewal and preserve prior snapshots. Portfolio expansion beyond the declared commercial count requires an audited commercial review; this workflow does not silently amend a signed unit commitment.

## Activation and resume

Organization.onboarding records state, revision, legal details, declared units, billing email, current contract/invoice IDs, payment verification/activation times and a safe attention code. Account signup starts ACCOUNT_CREATED. The durable states are ORGANIZATION_CONFIGURED, CONTRACT_PENDING_SIGNATURE, INVOICE_ISSUED, PAYMENT_PENDING and ACTIVE. PLAN_SELECTED, CONTRACT_GENERATED, CONTRACT_SIGNED and PAYMENT_VERIFIED are also recorded as ordered audit transitions inside the corresponding transaction. There is no public endpoint that accepts ACTIVE or payment-success claims.

GET progress derives the unfinished step from saved authoritative records. The frontend restores details, plan, review/signature, payment or completion; no checkbox/local step is the activation authority. Organization-level writes serialize concurrent generation/signature/payment transactions. Unique generation, contract invoice and provider-reference indexes prevent duplicates. Repeated generation for the same current plan/term, signing by the same signer and preparing an existing checkout reuse the records.

Checkout stores its reference before the provider call. A lost network response cannot justify another charge: reconciliation verifies that reference. Only a provider-reported failed/abandoned payment can receive a replacement link; previous references remain recognized so delayed events can be reconciled. Missing/ambiguous initialization needs support review rather than blind re-initiation.

Legacy organizations/subscriptions without versioned onboarding are not retroactively certified or rewritten. Their existing access path remains; a new contract-based subscription cannot be started through INTERNAL/manual settlement for an organization enrolled in this workflow.

## Documents, evidence and retention

Generated contract, signed contract, invoice and receipt PDFs are retained as immutable Document artifacts, with exact binary bytes, file SHA-256, render version and resource/snapshot hashes. Evidence links to the same Document. Generated files use the existing OTHER storage-provider classification and an internal generated storage key; this is a durable inline artifact in MongoDB, not an external public URL. Regular S3/local evidence storage behavior remains unchanged.

Authenticated GET /documents/:documentId/pdf uses existing document RBAC/ABAC and PRIVATE ownership/platform oversight rules, returns no-store PDF bytes and records a download audit. Normal document JSON excludes the binary. Model/service controls block artifact metadata/status/body updates. Historical downloads serve retained bytes and never recalculate today's terms or prices. The v1 PDF renderer embeds the licensed DejaVu Sans font for Unicode organization names and deterministic output.

No TTL deletes legal artifacts, contract versions, signatures or invoices. Include MongoDB artifacts in backup/restore and capacity planning. Retention/deletion/hold policies must be reviewed against the applicable operator requirements; they are not implemented as an automatic purge in this workflow. Template/API bodies must not contain passwords, payment credentials or unrelated personal secrets.

## Super Admin and service controls

The existing platform page gains paginated organization onboarding status, safe attention codes, contract version/hash/signatory evidence, invoice status/totals and audited PDF access. It adds append-only template drafting/publishing/retirement. Monitoring includes durable signature and onboarding-state counts and per-organization payment/renewal attention alerts. Administrators diagnose; they cannot sign on behalf of landlords or manually mark Paystack invoices paid.

LANDLORD_ONBOARDING gates new details/contracts/signatures/checkout; DOCUMENT_STORAGE gates new contract/signature artifact generation; PAYSTACK_PAYMENTS gates new checkout/retry and renewal provisioning. Verified callbacks, reconciliation and historical reads continue during maintenance so disabling a feature cannot lose a successful payment. Turning a switch off is not remote Paystack cancellation.

## Deployment and database migration

No new environment variables or Coolify service dependencies are introduced. The backend image now includes the embedded font asset and PDFKit runtime dependency. MongoDB must support transactions (replica set/Atlas). API and worker must run the same release. Existing integration credentials, WEB_ORIGIN and frontend API URL conventions remain.

Before enabling onboarding on a production database:

1. Back up the database, pause billing workers and leave LANDLORD_ONBOARDING/PAYSTACK_PAYMENTS OFF during index migration.
2. Run `npm --prefix apps/backend run contracts:migrate-indexes` for the dry-run plan.
3. Review it, then run `npm --prefix apps/backend run contracts:migrate-indexes -- --apply` in the intended environment. The script replaces only four known sparse compound provider-reference indexes with partial string-reference unique indexes and creates the declared contract/document/evidence/billing indexes. It never deletes data or unrelated indexes. Sparse indexes had incorrectly included records where provider exists but reference does not, preventing multiple unpaid organizations.
4. Publish the reviewed template via authenticated Super Admin controls. Existing organizations need no automatic backfill or mass contract acceptance.
5. Resume the worker and intentionally enable the required switches after staging acceptance.

Do not use syncIndexes or force a schema reset. Failed/incomplete index migration keeps production contract writes blocked; restore/recreate required indexes before re-enabling commands.

## Certification

Run root typecheck, lint, tests and production build, backend certify:release and `npm --prefix apps/backend run test:e2e`. The latter includes existing billing/finance suites and the landlord HTTP/replica-set suite. Default unit tests intentionally skip replica-set suites; GitHub backend Quality now explicitly runs them. Provider calls in automated tests are controlled fixtures; actual Paystack staging amount collection, delayed renewal, webhook delivery, cancellation and customer authorization must pass launch acceptance before claiming live payment readiness.

Tests cover commercial interpolation, precise three-month pricing, longer terms/cycles, template retirement/history, signature authority and hash/consent, immutable signed contracts/artifacts/invoices, unique retries, concurrent generation, multiple organizations, failed payments, signed webhook replay, audit rollback, delayed webhook/server reconciliation, initial activation/property access, renewal timing/pricing, admin oversight, and cross-organization progress/invoice/signature/activation/PDF denial. PDF sample QA checks retained bytes, extracted totals and rendered pages.
