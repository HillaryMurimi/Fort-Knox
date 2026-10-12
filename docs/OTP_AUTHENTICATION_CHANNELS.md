# Email-first authentication and optional SMS

This release extends the existing auth, User/OtpChallenge/RefreshSession, provider,
PlatformSwitch, authorization and audit systems. It does not create another
administrator, change live contact details, or deploy the application.

## Authentication policy

- SUPER_ADMIN: password → choose an enabled, available verified email/SMS channel
  → verify that selected OTP → existing short, server-bound privileged session.
  Existing enrollment still proves both registered contacts. Sensitive actions,
  destination changes and recovery retain the documented dual-channel policy.
- LANDLORD: email/password → chosen email (default) or SMS challenge → session.
  The password proof is retained on the temporary challenge; a tokenless legacy
  verification endpoint cannot consume it.
- Invited PROPERTY_MANAGER, CARETAKER, CONTRACTOR and TENANT accounts can use
  registered email codes, or phone identification with an available channel.
  Unknown/ineligible passwordless identities receive a generic challenge and no
  delivery or session. An organization SUPER_ADMIN label is not platform authority.
- Contact data entered by a landlord is unverified. A successful code verifies
  only its own channel. Email verification never invents phone verification.

OTP codes are six random digits (including leading zeroes), with at most five
minutes of validity. Challenges bind user, purpose, channel, account security
version/contact snapshot and generation. Codes use a keyed digest plus bcrypt;
challenge credentials are random 256-bit values stored only as SHA-256 hashes.
Codes/credentials never appear in production logs, API responses or audit
metadata. Challenge consumption, contact verification, session issuance and
success audit commit together on a MongoDB replica set.

Account delivery budgets, three resends, a 60-second resend cooldown, a
two-second verification cooldown, five attempts and temporary lockout complement
the existing IP limiter. Channel switches replace the code/generation without
dropping the retained password proof. New credential submissions supersede old
flows. Provider failure never creates a session.

Tests capture actual random deliveries in process memory/private IPC under
NODE_ENV=test. Production refuses delivery-injection setup. No fixed code,
public capture API or persistent plaintext outbox is added. For a development
rehearsal without paid providers, use the isolated browser test harness; ordinary
development sign-in needs configured delivery.

## Provider configuration

All secrets stay in Coolify runtime variables or a trusted workstation
environment, outside Git. Nothing private belongs in NEXT_PUBLIC_* or build args.

| Variable | Meaning |
| --- | --- |
| EMAIL_ENABLED | Runtime permission; default true |
| EMAIL_PROVIDER | RESEND or existing SENDGRID |
| EMAIL_FROM | Sender mailbox on the verified domain |
| EMAIL_FROM_NAME | Branded sender display name |
| EMAIL_SENDING_DOMAIN | Domain of EMAIL_FROM |
| EMAIL_DOMAIN_VERIFIED | Operator attestation after provider/DNS verification |
| RESEND_API_KEY | Resend secret when selected |
| SENDGRID_API_KEY | Existing SendGrid secret when selected |
| SMS_ENABLED | Runtime permission; false by default in production/Compose |
| SMS_PROVIDER | Existing TWILIO |
| SMS_FROM | Approved Twilio E.164 sender |
| TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN | Twilio runtime credentials |

Resend is available through the existing EmailProvider interface, with no new
dependency. SendGrid continues to work. Both support branded HTML and plain
text. The notification jobs use the same configured provider, so future
transactional messages do not require a second delivery system. Providers use
bounded requests and safe status errors, with no raw provider payload logging.

For Resend, add your owned sending domain in its Domains dashboard. Copy the
provider-generated SPF and DKIM records to your DNS provider; verify them in
Resend before setting EMAIL_DOMAIN_VERIFIED=true. Use the exact generated
records rather than inventing TXT/CNAME values or adding a second SPF record
for the same hostname. Review DMARC alignment and mailbox placement, and keep
open/click tracking off for authentication messages. Configure the sender on that
domain, create a least-privilege sending key, then test receipt in the target
environment. With SendGrid, use its existing authenticated-domain procedure and
restricted Mail Send key instead.
Official reference: https://resend.com/docs/dashboard/domains/introduction

## Administrator settings and readiness

Open Platform → Security → OTP authentication. It distinguishes configured,
runtime-permitted, receipt-tested, enabled, available and production-ready.
A test sends an explicit diagnostic code only to the signed-in administrator's
existing verified destination. Fresh authentication is required for testing.
Receipt verification is purpose-bound and creates neither a login session nor
step-up proof. Provider acceptance alone is not receipt verification.

Receipt evidence is stored on the existing OTP PlatformSwitch row, bound to
the runtime environment and a keyed fingerprint of provider/sender/credential
configuration. Changed credentials invalidate readiness. Recent delivery
failures and configuration/test history are bounded audit queries.

SMS is never enabled merely by supplying credentials. Activation requires
SMS_ENABLED=true, valid provider/sender configuration, current receipt evidence,
and an explicit authorized change. The ordinary service-switch endpoint applies
the same validation, so it cannot bypass the dedicated settings screen.
EMAIL_OTP and EMAIL_NOTIFICATIONS default ON for a new email-enabled environment;
existing saved OFF/MAINTENANCE rows are respected. SMS defaults OFF.

Changes require the existing fresh password + email + SMS assurance. The last
available channel cannot be disabled, nor can a channel be disabled if an active
account cannot use the alternative. Transactions serialize channel changes on
one policy revision to prevent two concurrent changes from disabling both.

An email-only launch intentionally cannot complete an SMS-dependent sensitive
step-up. Use the trusted host-operator procedure below to enable SMS. Other
sensitive actions remain unavailable until both channels work. Routine email
sign-in still works; no security requirement is silently relaxed.

## Trusted bootstrap / later SMS activation

Use the existing, securely enrolled SUPER_ADMIN account. Do not create another
one and do not treat legacy verifiedAt as proof of either contact.

1. Configure the target provider/runtime variables and initialize indexes.
2. On a trusted operator workstation with target database access, run:
   npm --prefix apps/backend run auth:configure-otp -- <existing-admin-user-id> EMAIL <approved-case-reference>
3. The interactive terminal hides the existing password and email receipt code.
   The command activates only email delivery switches, records the approved case,
   changes no contact details and grants no session.
4. Later, supply Twilio credentials and SMS_ENABLED=true, redeploy, then run:
   npm --prefix apps/backend run auth:configure-otp -- <existing-admin-user-id> SMS <approved-case-reference>
5. SMS activation requires the password and test-code receipt on BOTH existing
   verified destinations. Both switch writes and the audit commit atomically.
   The command never turns a diagnostic code into an application MFA session.

The scripts require a TTY, refuse locked/inactive/non-administrator accounts and
take no password/code arguments. Do not run them as container startup commands.
The runtime image does not contain tsx; run operator scripts from the trusted
checkout with development tooling installed. Lost destinations still require
the separate approved recovery/enrollment procedure in
SUPER_ADMIN_AUTHENTICATION.md. These commands cannot replace those destinations.

## Tenant and caretaker onboarding

Tenant pre-registration stores name, phone, email and the authorized fixed unit.
Email is required when SMS is unavailable. Identity conflicts are rejected rather
than creating duplicate or merged accounts. The tenant opens /activate-tenant,
requests a code to the registered email, then verifies its opaque activation
challenge. Account/membership creation and success audit are transactional; unit
selection cannot be submitted by the tenant. First email verification does not
mark the landlord-entered phone verified. Normal email-code login follows.

Caretaker/staff invitations and organization user creation already accept email
and phone. They now require email while SMS is unavailable. Invitation acceptance
does not mark contacts verified; the first normal OTP proves ownership.
Existing property/building assignments and backend scope checks remain.

## API and database

- GET /api/v1/auth/otp/availability
- POST /api/v1/auth/login supports email/password + optional channel, phone +
  optional channel, and emailOtp for eligible field accounts.
- POST /api/v1/auth/account-otp/resend and /verify use challengeToken.
- GET /api/v1/platform-control/otp-authentication
- POST /api/v1/platform-control/otp-authentication/tests and /tests/verify
- Existing PATCH /api/v1/platform-control/switches/:key applies readiness,
  assurance and lockout checks to both delivery and OTP switches.
- POST /api/v1/tenant-onboarding/activate and /verify use an opaque
  onboardingToken and selected channel. New challenges cannot use the old
  phone-only verification payload; clients must restart activation.

No new collection or destructive migration. OtpChallenge and TenantOnboarding
gain challenge/generation/channel/cooldown fields; PlatformSwitch gains receipt
evidence and a serialization revision. Add partial unique challenge-token hash
indexes with:
npm --prefix apps/backend run auth:create-channel-indexes

The token indexes enforce one challenge credential and serve direct bounded
lookups. Existing expiry/flow/user/scope indexes remain. No historical contacts
are automatically marked verified and no old session proof is fabricated.
Reissue pending old tenant challenges after deployment.

## Deployment acceptance

Use docker-compose.coolify.yml. Email, HTTPS, secure cookies, separate strong
JWT secrets and a MongoDB replica set remain required. SMS, payments, S3 and CCTV
can remain disabled with empty credentials. Enabling a runtime service makes
its corresponding production configuration mandatory. Disabled capabilities
return unavailable; there is no fake payment, SMS or CCTV success.

Compose parsing, typechecks/tests/builds are code-level evidence. A target
Coolify deploy, real sender DNS/receipt tests, database transaction/index checks,
backups/restores and real provider certification remain separate acceptance.
Single API instance IP limits are in process memory; add shared/edge rate
limiting before scaling API replicas. A configured sender-domain attestation
does not independently query DNS, and readiness is a verified receipt at a point
in time, not continuous provider monitoring. Email-dependent social onboarding
remains a separate follow-up: the existing optional social flow still verifies
phone; keep social providers disabled during an email-only initial launch.
