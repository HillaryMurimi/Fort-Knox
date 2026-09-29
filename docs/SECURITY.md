# Property Management Command Center --- Security

## Federated owner authentication

Social login uses one-time server-stored authorization state and a HttpOnly browser cookie. Google uses PKCE; Google and Apple ID tokens are verified against rotating provider keys with issuer, audience, expiry and nonce checks. Facebook's `/me` identity is resolved only after a server-side authorization code exchange. Provider subjects are unique per provider. Existing local accounts are never auto-linked by email or phone. Existing owners may explicitly link a verified provider subject only after their current password, active LANDLORD membership and an OTP sent to the account's registered phone are verified. A phone OTP and active LANDLORD membership are required before social sessions are issued. Identity linking and new owner, organization, membership, identity and audit writes are transactional; the production Mongo deployment must support transactions. OAuth codes and callback URLs are excluded from request logging. Provider credentials are optional, and a provider is exposed only when its complete credential set and public callback base URL are present.

## 1. Security Objectives

PMCC handles financial, tenancy, operational, identity, document, and
CCTV data. Security is a core product requirement.

Primary objectives: - Strong organization isolation. - Least
privilege. - Secure authentication/session handling. - Auditable
privileged actions. - Safe financial webhooks. - Controlled CCTV/media
access. - Secure uploads. - Abuse resistance. - Secret protection. -
Fast revocation.

## 2. Authentication

Primary authentication: - Normalized phone number. - One-time password.

OTP controls: - Cryptographically secure generation. - Store only a
hash. - Short expiration. - Single use. - Attempt limit. - Request
throttling by destination/IP/device signals. - Resend cooldown. -
Purpose binding. - Generic responses to reduce enumeration. - Audit
suspicious patterns without logging OTP value.

Optional passwords: - Use a modern password hashing algorithm/library
with appropriate work factor. - Never log/store plaintext. - Password
reset tokens must be random, hashed, expiring, and single use.

## 3. Sessions

Support: - Session/device inventory. - Revocation. - Logout all. -
Rotation. - Expiration. - Account deactivation. - Step-up assurance.

If JWT access tokens are used: - Keep access lifetime appropriately
short. - Use refresh-token rotation or equivalent secure session
strategy. - Detect/revoke compromised token families where practical. -
Never put sensitive business data into token claims.

## 4. Authorization

Server-side only for enforcement.

Every resource query must be scoped. Avoid: 1. Load arbitrary record by
client ID. 2. Check only broad role. 3. Return record.

Prefer: 1. Authenticate principal. 2. Resolve organization/assignment.
3. Query within allowed scope or authorize resource explicitly. 4. Apply
action permission and business-state checks. 5. Audit sensitive action.

Protect against IDOR/BOLA.

## 5. Multi-Tenant Isolation

-   Organization-scoped data carries `organizationId`.
-   Never trust organization ID from client without membership
    validation.
-   Repository helpers should make scoped queries the default.
-   Cross-organization admin operations require explicit platform
    permission.
-   Tests must attempt cross-tenant access for every sensitive domain.

## 6. Financial Security

-   Never trust frontend payment success.
-   Verify provider webhooks.
-   Idempotency on webhook/provider event IDs.
-   Reconciliation.
-   Safe monetary representation.
-   Audit adjustments/refunds.
-   Ledger reversal requires scoped `payment.reverse` authorization and a complete allocation history; it commits balance, state, and audit changes in one MongoDB transaction. It does not itself request a provider refund.
-   Full Paystack refund submission requires scoped `financial.manage` and fresh server-side verification of the original transaction, including exact amount, currency, payment ID, and organization ID. One refund record per payment prevents repeat provider submissions; ambiguous results require manual review. Signed webhook status updates cannot change rent balances.
-   Refund review lists are organization and unit scoped. A Paystack ledger correction requires both `financial.manage` and `payment.reverse`, a fresh provider `PROCESSED` response, and an atomic balance/state/refund-marker/audit transaction. Generic reversal cannot bypass this gate. Provider processing is not proof of customer receipt; settlement still requires separate review.
-   An ambiguous refund is never resubmitted automatically. Manual linkage requires scoped `financial.manage`, the exact provider refund ID, a fresh provider fetch, and equality with the verified original transaction ID, amount, currency, reference, and PMCC ownership metadata. Investigation notes are kept on the refund record, not copied into audit metadata. Customer bank details must be handled in Paystack, not PMCC.
-   Payment confirmation and ledger reversal append bounded, non-secret domain events and system-owned delivery jobs in the same MongoDB transaction as charge balances and audit. Failure to persist either aborts the financial write. The worker verifies event/job organization match and projects once by unique event ID. Platform-admin replay is audited and cannot replay the ledger transition. Event and audit-log visibility requires `audit.view` and assigned-unit scope; `publishedAt` is not proof of external delivery.
-   Separate initiation, provider confirmation, and reconciliation
    state.
-   Avoid silent destructive edits to financial history.
-   Paystack webhooks require `x-paystack-signature` HMAC-SHA512
    verification using the server-side secret key.
-   Confirmed Paystack transactions must match the expected
    currency and minor-unit amount. Confirmed M-Pesa callbacks must match
    the expected KES amount.
-   Persist only a redacted provider webhook projection plus a hash of the
    original payload; do not expose raw provider responses to clients.
-   Landlord settlement destination management requires
    `organization.settings.manage` and is organization-scoped and audited.
-   Resident-facing management phone, email, emergency line, and office hours
    are the only resident contact settings editable from the landlord command center.
    Unknown fields are rejected, private credentials are forbidden, and every
    update requires `organization.settings.manage` and an audit record.
-   Regional display locale and IANA time zone are separately validated and
    require the same organization-scoped permission and audit. Country and
    currency cannot be switched through the settings API while finance remains
    on the legacy KES model.
-   New operational rent, payment, expense, and service-charge writes reject
    non-KES currency. Manual and provider payment allocations cannot apply
    one currency to another. Existing financial records are not rewritten.
-   New KES monetary inputs reject excess precision/unsafe values. Payment
    allocation and reversal arithmetic uses integer cents, but stored balances
    remain legacy major-unit numbers until the full migration is complete.
-   Rent checkout fails closed outside the KE/KES M-Pesa/Paystack matrix and
    without an active organization-matched default settlement destination.
    Paystack initiation cannot silently omit the landlord subaccount code.
-   Paystack bank account details are sent directly from the authenticated
    setup request to Paystack subaccount provisioning; PMCC retains only the
    provider subaccount code, account name, bank code, and final four digits.
-   A pasted crypto wallet address is not proof of control or settlement.
    Crypto destinations remain unavailable for tenant checkout until a
    provider-verifiable, idempotent blockchain reconciliation path exists.

## 7. CCTV Security

-   Never expose raw camera/NVR credentials.
-   Browser should receive short-lived authorized stream/session
    material.
-   Authorize every stream/playback/export request.
-   Enforce camera/property/building scope.
-   Audit access.
-   Step-up authentication for policy-defined sensitive actions.
-   Short-lived signed evidence URLs.
-   Apply retention policies.
-   Protect streaming gateway separately.
-   Rate-limit session creation.

## 8. Upload Security

Validate: - Authentication/authorization. - File size. - MIME/type using
server/storage verification, not extension alone. - Allowed media
types. - Resource ownership. - Filename/object key generation. - Malware
scanning integration readiness.

Serve sensitive files through authorized short-lived access, not public
permanent URLs.

## 9. API Security

-   HTTPS in production.
-   Helmet/security headers.
-   Strict CORS allowlist.
-   Rate limiting.
-   Request body size limits.
-   Zod validation.
-   Parameterized/ODM-safe queries.
-   Prevent MongoDB operator injection by validating schemas and never
    spreading untrusted filters directly.
-   Safe error messages.
-   Request IDs.
-   No production stack traces.
-   CSRF protection if cookie-based browser authentication requires it.
-   Correct SameSite/Secure/HttpOnly cookie settings when cookies are
    used.

## 10. Secrets

Never commit: - Database credentials. - JWT/session secrets. - M-Pesa
secrets. - Paystack secrets. - SMS/email credentials. - Camera/NVR
passwords. - Storage secrets.

Use environment injection/secret management. Rotate secrets. Keep
`.env.example` non-sensitive.

## 11. Audit Logging

Audit: - Authentication/security events. - Role/permission changes. -
Staff assignment. - Tenant onboarding/offboarding. - Financial
approvals/adjustments. - Maintenance approvals. - CCTV
view/playback/download. - Incident changes. - Sensitive
exports/downloads. - Admin configuration.

Record: - Actor. - Organization/scope. - Action. - Resource. -
Outcome. - Timestamp. - Request/correlation ID. - Safe metadata.

Never log secrets or raw sensitive credentials.

## 12. Privacy and Data Minimization

Collect only data required for legitimate product functions. Scope
UI/API responses to the minimum data required by role.

CCTV and tenant data require especially careful access, retention, and
disclosure policy. Legal/compliance requirements vary by jurisdiction;
product configuration and customer deployment must account for
applicable privacy, surveillance, tenancy, employment, and
data-protection law.

## 13. Abuse and Monitoring

Monitor: - OTP abuse. - Login failures. - Repeated authorization
denials. - Unusual CCTV access. - Large exports. - Webhook verification
failures. - Excessive file uploads. - Privileged role changes. -
Suspicious session/device changes.

Tenant maintenance media is accepted only after authenticated
maintenance-resource scope checks. Uploads are bounded to five
allowlisted photo/video files, use controlled server-generated storage
keys, record SHA-256 hashes, and create auditable Evidence records.
Local filesystem storage is disabled in production; production evidence
upload requires configured S3 credentials. Malware scanning/quarantine
remains required before general evidence download is enabled.

Do not automatically label legitimate users malicious solely from
heuristic anomalies; surface evidence for review.

## 14. Dependency and Supply-Chain Security

-   Lock dependencies.
-   Review updates.
-   Automated vulnerability scanning in CI.
-   Minimize dependencies.
-   Use maintained libraries.
-   Protect CI secrets.
-   Restrict production deployment permissions.

## 15. Security Headers / Browser Controls

Configure appropriate: - Content-Security-Policy. - frame-ancestors. -
HSTS in production. - Referrer-Policy. - X-Content-Type-Options. -
Permissions-Policy as appropriate.

Streaming/media integrations may require carefully scoped CSP
directives.

## 16. Security Review Gate

Before production: - Threat model. - Authorization matrix review. -
Cross-tenant penetration tests. - Session/OTP review. - Payment webhook
tests. - CCTV access review. - Upload tests. - Secret scan. - Dependency
scan. - Backup/restore test. - Incident-response procedure.
