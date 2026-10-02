# SUPER_ADMIN authentication and recovery

## Existing architecture and audit findings

This extends the existing Express auth module, User, OtpChallenge, RefreshSession,
JWT issuer/middleware, SendGrid/Twilio provider abstractions, service switches,
Notification/Job outbox, audit infrastructure, Next login entry point and API client.
Previously platform administrators used password plus a single SMS STEP_UP code.
Access JWTs were independent of the refresh-session record; logout did not revoke
their immediate platform access. Legacy single-code endpoints and generic session
issuance lacked central administrator assurance checks. Social owner authentication
already excluded platform administrators. Organization permissions and resource
ownership remain separate from authentication.

Platform authority is the existing User.isPlatformAdmin security role, projected as
SUPER_ADMIN in authenticated identity. An organization membership named SUPER_ADMIN
does not confer platform authority. Policy applies to every platform administrator;
it contains no personal identity or administrator-count special case.

The existing seed used environment credentials and an upsert that could reset an
existing administrator and mark generic verifiedAt without evidence for both channels.
It now preserves existing administrators, refuses silent additional-account
bootstrap, and leaves new bootstrap accounts pending explicit channel enrollment.

## Required flow and authoritative boundary

POST /auth/login verifies the password. An administrator receives a random opaque
password-bound flow credential and a masked EMAIL challenge, with no authenticated
identity, access JWT or refresh cookie. Email verification advances to SMS, independently
generates its challenge and delivers to the stored registered phone. SMS verification
completes the proof. A MongoDB transaction consumes the completed flow, creates the
privileged RefreshSession, resets failure counters, records MFA/login audit and
queues both security notices and their delivery jobs. Audit/outbox failure grants no
session; start sign-in again after resolving the failure.

AdminAuthFlow is a temporary authentication workflow, not another session/identity
system. It expires after 15 minutes and contains only a hashed opaque credential,
user/purpose/version bindings, stage and proof timestamps. A monotonic per-user flow
generation invalidates superseded workflows, including concurrent initiation.
Normal workflows are LOGIN or STEP_UP. ENROLLMENT is host-operator only and never
creates a privileged session.

The central generic issuer refuses platform administrators. Phone login, legacy OTP
request and legacy single-SMS verification cannot authenticate them. Social owner
flows continue to exclude them. Every request for a platform administrator must have
a signed privileged access JWT bound to a live RefreshSession carrying password,
email and SMS evidence, a current contact snapshot and matching account security
version. Partial flow credentials, old bare JWTs, revoked sessions and promoted-user
legacy tokens cannot grant platform access. RBAC/ABAC checks still execute after this
boundary, and ordinary organization isolation is unchanged.

## Challenge controls

- Six-digit codes use crypto.randomInt; email and SMS draws are independent.
- A purpose-separated HMAC binds the OTP to flow and channel using the existing
  server refresh secret, then bcrypt cost 12 hashes it. Database-only compromise
  does not expose a straightforward six-digit lookup. No plaintext code is retained.
- Each code expires after 180 seconds by default; the flow deadline also bounds it.
- Independent channel/purpose/user/generation bindings and atomic consumption prevent
  out-of-order verification, replay and concurrent double consumption.
- Verification reservation atomically counts attempts and enforces a two-second
  cooldown. Existing OTP_MAX_ATTEMPTS applies; account limits provide a second bound.
- Resend waits 60 seconds, allows three resends per stage and invalidates the previous
  code. A per-account budget allows ten deliveries per 15-minute window across flows.
- Five password/OTP failures in a 15-minute window lock the account for 15 minutes,
  invalidate pending workflows and record lockout. Password success alone does not
  erase failures. Completed MFA resets them. Existing per-IP authentication limits
  provide an additional boundary; distributed deployments should use an approved
  shared limiter/edge control alongside the authoritative Mongo account limits.
- Failed provider delivery leaves the challenge unusable. Failure, expiry, attempt
  exhaustion, cooldown and lockout have explicit frontend messages and retry paths.
- Production API responses, audit records, notifications and logs never carry codes.
  Administrator destinations are masked before authentication.
- Tests capture actual random deliveries in memory, with a setter that rejects every
  environment except NODE_ENV=test. The isolated browser harness uses private process
  IPC; it exposes no code endpoint, fixed administrator code or public bypass.

Landlord password/SMS and field-role phone/SMS policies remain their existing policies.
Their existing nonproduction development-code mechanism cannot issue admin sessions.

## Privileged sessions and sensitive changes

Default absolute lifetime: 30 minutes; server API-inactivity timeout: five minutes;
access JWT lifetime: five minutes. Refresh rotation preserves absolute expiry and MFA
freshness, revokes the old session, and invalidates its access token. Reuse of a rotated
privileged refresh token revokes current privileged sessions and audits suspected replay.
Explicit logout, own-session revocation and logout-all take effect on subsequent requests.

Refresh cookies are HttpOnly, Secure in production, SameSite=Strict for administrators,
restricted to the auth path, and bounded by the privileged absolute expiry. Ordinary
cookie policy remains unchanged. Privileged browser access credentials are memory-only.
Legacy localStorage admin sessions are purged. Reload restores identity only by an
authoritative refresh exchange. Concurrent browser refreshes share one in-flight exchange.

Privileged cookie operations and MFA mutations require the configured WEB_ORIGIN and
X-PCC-Auth: 1. The API client adds that header; strict CORS prevents a foreign browser
origin from supplying it successfully. Protected API calls use bearer authentication,
not cookie-only authorization. Tokens are never put into URLs. Frontend idle/absolute
timers sign out the administrator; the backend independently enforces session policy.

Service-switch changes, administrator promotion and destructive DELETE actions require
MFA completed within five minutes. A native accessible step-up dialog repeats password,
email and SMS, rotates the session without extending its absolute lifetime, then asks
the operator to retry the intended action. Destructive operations are not replayed
automatically. Organization user management cannot change a platform administrator.
There is no MFA-disable endpoint or credential-edit form. Provider credentials remain
server-managed configuration; no new credential mutation surface was introduced.

## Notifications and audit

Security notices are transactionally queued through the existing Notification/Job
pipeline for both registered channels. The worker must run and providers/switches must
be available for actual delivery. Security notices override marketing preferences.
They include UTC timestamp, MFA outcome, coarse browser/device classification from
an untrusted user-agent, observed network address with a proxy qualification, and unexpected-login
instructions. There is no invented geolocation.

Events cover initiation, password result, channel issuance, OTP result/resend, delivery
failure, throttle/lockout, MFA/login completion, step-up, session reads, logout/revocation,
expiry/revoked-access denial, refresh replay, bootstrap/promotion and enrollment/recovery.
Metadata contains bounded actor/channel/purpose/request information, never passwords,
codes, full tokens or raw provider exceptions. Auth error logging suppresses raw errors;
structured logging redacts sensitive fields and access logging excludes auth URLs.

## API

All paths use the existing /api/v1 prefix.

| Endpoint | Authorization / purpose |
| --- | --- |
| POST /auth/login | Existing entry point; admin password starts EMAIL |
| POST /auth/admin-mfa/verify | flowToken, channel, code; permitted Origin/header |
| POST /auth/admin-mfa/resend | flowToken; current-stage throttled resend |
| POST /auth/admin-mfa/step-up | Live admin bearer session, current password, Origin/header |
| GET /auth/sessions | Own active admin sessions; audited, bounded to 50 |
| POST /auth/sessions/:sessionId/revoke | Own session only; Origin/header |
| POST /auth/logout-all | Own sessions and pending flows; Origin/header |
| POST /auth/platform-admins | Fresh admin assurance, existing userId, confirm:true, reason |
| POST /auth/refresh | Existing cookie exchange; admin Origin/header and live proof |
| POST /auth/logout | Existing cookie revocation; admin Origin/header |

No destination/user override or role selection is accepted by MFA schemas.
Promotion operates on an existing active password account with both stored destinations,
revokes its old sessions, marks enrollment required and commits the audit atomically.
Additional administrators complete the same host-assisted dual-channel enrollment,
then use the same normal login flow. An administrator cannot sign or act as a landlord
unless the separate existing membership/resource rules permit that operation.

## Operator preparation for the existing account

Do not run bootstrap to overwrite the current account. Runtime authentication reads
its existing stored email and phone, not SUPER_ADMIN_* environment identity values.
Generic historical verifiedAt is not evidence of two independently verified channels.

Before enabling this release on a live environment:

1. Back up and review the database/index state under the established maintenance process.
2. Configure the existing EMAIL_FROM, SENDGRID_API_KEY, SMS_FROM, TWILIO_ACCOUNT_SID
   and TWILIO_AUTH_TOKEN through the deployment secret store. Enable the existing
   EMAIL_NOTIFICATIONS and SMS_NOTIFICATIONS switches through the authorized process.
   WEB_ORIGIN must match the frontend origin. HTTPS and production cookie validation
   remain mandatory. Use a same-site web/API deployment or the existing reverse proxy.
3. Review and run npm --prefix apps/backend run auth:create-indexes. If the tool identifies
   legacy plain expiry/dedupe indexes, approve a maintenance-window repair explicitly:
   npm --prefix apps/backend run auth:create-indexes -- --repair-legacy-indexes.
   It changes only the described known indexes, checks duplicates first, and aborts
   rather than deleting duplicate notification records.
4. Obtain the existing User ID through authorized account/database access, without
   putting contact values into source or tickets. On the trusted host run:
   npm --prefix apps/backend run auth:enroll-admin -- <existing-user-id> <approved-case-reference>
   Password and both delivered codes are entered in a hidden interactive terminal.
   Enrollment proves both stored destinations, records the case and revokes old sessions.
   It does not create another administrator or grant a session.
5. Sign in through /login and complete the required two channels. Verify worker delivery
   of the security notification and inspect the non-secret audit evidence.

For a genuinely empty platform only, the existing seed:super-admin uses securely
injected SUPER_ADMIN_EMAIL, SUPER_ADMIN_PHONE, SUPER_ADMIN_PASSWORD and name values.
It prints no contact or password, requires enrollment and refuses to silently create
an additional administrator. Future accounts use the protected promotion workflow.

## Explicit administrative recovery

No security questions, secret admin URL, universal code, public recovery token or
MFA-disable flag exists. Losing either channel cannot yield a session through normal
login, OTP resend, refresh, social linking or organization user edits.

Recovery requires authorized infrastructure/database access, an independently approved
identity-review case and the existing administrator password. Verify the requesting
person using documented business ownership/identity evidence and an established
out-of-band contact; record who approved the case, time, evidence references and reason.
When another trusted administrator/operator exists, require an independent reviewer.
The application cannot automate or certify that external identity decision.

On the trusted host run auth:recover-admin-channels -- <existing-user-id> <approved-case-reference>.
The interactive tool checks the existing password, collects approved replacement
destinations without echoing them, confirms the case, and transactionally stages them,
clears verification evidence, advances security version, revokes sessions/flows and
records the recovery audit without contact values. It grants no access. Then run
auth:enroll-admin for the same account/case: both replacement channels must receive
and verify independent codes before normal password/email/SMS login is possible.
Notify the owner through approved out-of-band channels, inspect the resulting audit,
and retain the case outside source control. If the password is also lost, stop this
procedure and use a separately approved host/database credential-reset incident
process with audit and session revocation; no application password-reset bypass was added.

Host recovery is a highly privileged operational capability: restrict host/database
credentials, terminal access and runbook execution, and review the case/audit. A
compromised host/database operator is outside an application-only MFA trust boundary.

## Database/index and retention changes

User adds explicit email/phone verification, contact-proof hash, security/flow versions,
failure/lockout and delivery-window counters. Sensitive counter/hash fields are excluded
from normal projections. RefreshSession adds privileged proof, contact/security snapshot,
MFA/activity timestamps and absolute expiry. OtpChallenge extends the existing collection
with admin purpose, user/flow/channel/generation, delivery and verification-cooldown fields.

AdminAuthFlow adds a unique hashed-credential lookup, user/purpose/stage lookup for
supersession and a TTL expiry index. OtpChallenge gains a flow/channel/generation lookup.
The existing OTP/session expiry schemas no longer redundantly declare a conflicting
plain index alongside TTL. Notification supports platform security messages without
a fabricated organization; organization-facing APIs remain scoped. Its redundant
plain dedupe declaration is removed in favor of the existing unique sparse invariant.
Notification and delivery jobs commit together with the session. No financial,
organization, subscription or deployment collection is rebuilt.

The explicit index command is additive unless --repair-legacy-indexes is approved.
TTL repair uses collMod; dedupe repair verifies the exact known index and absence of
duplicates before replacing it. TTL deletion is asynchronous; authentication always
checks expiry synchronously. Expired workflows/codes/sessions are transient, while
AuditLog security evidence follows the existing operational retention policy.
No production migration or live-account enrollment was executed by this development.

## Verification and limitations

Unit, frontend rendering/storage, isolated Mongo HTTP E2E and real browser tests cover
the complete administrator journey and stage bypasses, ordinary-role/platform denial,
expiry, replay, limits, notification jobs, audit rollback, recovery enrollment, future
promotion, session ownership and preservation of domain isolation. See the execution
tracker for final exact totals and release gates.

Live SendGrid/Twilio delivery, sender registration, service-switch readiness and owner
enrollment must be accepted on the target environment. Fixture tests do not certify a
real provider or prove the owner's actual channel availability. Production payments
and Coolify deployment remain on hold; no live deployment/provider credential was added.
Email/SMS factors satisfy this specified policy but are not phishing-resistant hardware
authentication; approved passkey/security-key support can be a later separate improvement.
The existing single-process IP limiter needs a shared/edge policy for multi-instance
production, with Mongo account limits retained. Runtime policy cannot replace host
security, transport/CSP controls or recovery identity-review discipline.

Guidance: [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html),
[Multifactor Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
and [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
