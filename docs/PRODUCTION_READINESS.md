# Production Readiness and Owner Runbook

Last updated: 2026-09-24

## Release Position

PMCC now has production startup validation, deterministic quality commands, container builds, CI, liveness/readiness probes, and production-only safeguards around preview mode and local storage. A deployment is **not approved for live customer money or security operations** until every required owner action below is complete and the release gate passes in the target environment.

Run from the repository root:

```bash
npm run verify:production
```

The API must also start successfully with the real production environment. Startup intentionally fails when required secrets or providers are missing, when M-Pesa still points to sandbox, when cookies are insecure, or when a localhost database is configured.

The checked-in quality gate currently exits successfully, but lint still reports 265 backend warnings and 24 frontend warnings. These are tracked cleanup debt rather than launch-blocking errors; review and reduce them as modules are touched, especially non-null assertions and React 19 effect/ref warnings.

## Real External APIs

| Capability | Code status | Production service/account required |
| --- | --- | --- |
| M-Pesa STK Push | Real Daraja adapter | Safaricom production app, consumer key/secret, production shortcode, passkey, public callback URL. Unsigned callbacks only trigger an authenticated STK query; they do not independently confirm payment. |
| Paystack checkout | Real Paystack initialize/verify/webhook adapter | Live secret key, approved business, settlement bank details, HTTPS callback and webhook registration. Landlord destinations use Paystack subaccounts. |
| Stripe | Real Payment Intent and webhook adapter | Live secret and webhook signing secret if Stripe is enabled. Stripe is optional for the current Kenya-first launch. |
| SMS and OTP | Real Twilio adapter | Twilio account, production sender/phone number, Kenya delivery approval, funded balance. Production login now sends OTP through this adapter. |
| Email | Real SendGrid adapter | Verified sending domain, API key, sender address, SPF, DKIM and DMARC. |
| WhatsApp | Real Meta Cloud adapter, optional | Approved Meta business, phone number ID, access token and approved templates where Meta requires them. |
| Documents/evidence | Real S3/S3-compatible adapter | Private bucket, least-privilege credentials, encryption, CORS, lifecycle and backup policy. Local storage is disabled in production. |
| CCTV | Generic HTTPS gateway adapter | A separately deployed WebRTC/HLS gateway connected to cameras/NVRs. Raw RTSP credentials must never reach PMCC or the browser. |
| MongoDB | Real Mongoose persistence | Production replica set or managed cluster, TLS, backups, point-in-time recovery, monitoring and tested restore procedure. |

## APIs Not Yet Production Implemented

These options must remain disabled or hidden until implemented and security-tested:

1. **Cryptocurrency checkout and reconciliation.** Wallet destinations can be recorded, but there is no real crypto processor, chain watcher, confirmation-depth policy, exchange-rate lock, webhook verification or exact-amount reconciliation.
2. **Cloudinary storage.** The UI/API can name Cloudinary, but the storage factory intentionally returns an unconfigured provider. Use S3 for launch or implement the full Cloudinary adapter.
3. **Push notifications.** In-app, SMS, email and WhatsApp paths exist; APNs/FCM push delivery does not.
4. **SMTP email.** The active email adapter is SendGrid. Generic SMTP is not implemented.
5. **Per-landlord M-Pesa merchant credentials.** The current Daraja credentials and shortcode are deployment-wide. A landlord-provided shortcode only activates when it matches that configured merchant. Multi-landlord direct settlement requires encrypted per-organization credentials or a regulated central collection/settlement design.
6. **Direct NVR-vendor integration.** CCTV expects a normalized HTTPS gateway contract. Vendor-specific RTSP/NVR discovery, transcoding and credential vaulting are external work.
7. **Malware scanning.** MIME/size/ownership controls exist, but uploaded documents still need a quarantine and antivirus scanning service before broad production use.
8. **Announcements.** Permission vocabulary exists, but a complete announcement model/API/delivery workflow is still absent.

## Owner Actions Before Go-Live

### Accounts and credentials

- Create production Safaricom Daraja, Paystack, Twilio, SendGrid, object-storage and CCTV-gateway accounts.
- Complete provider KYB/KYC, settlement-bank verification and live-mode approval.
- Generate two different random JWT secrets of at least 64 characters in a secret manager. Never place live secrets in Git or frontend variables.
- Configure every variable in `apps/backend/.env.example`; create the deployed secret set as `.env.production` only in the deployment system.
- Set only `NEXT_PUBLIC_API_URL` in the frontend production build. Keep all `NEXT_PUBLIC_DEV_*` flags false or absent.

### Networking and callbacks

- Provision separate HTTPS domains for web and API, DNS, TLS renewal, WAF/rate limits and reverse-proxy request-size limits.
- Register `POST /api/v1/integrations/webhooks/PAYSTACK`, `/MPESA`, and `/STRIPE` with enabled providers.
- Put M-Pesa behind an allow-listed callback gateway that adds the configured HMAC header when possible; authenticated STK reconciliation remains mandatory.
- Restrict MongoDB, storage and CCTV gateway network access to application infrastructure.

### Data and operations

- Create the MongoDB production cluster, least-privilege database user, indexes, backup schedule, retention policy and restore drill.
- Run `seed:rbac`, `seed:billing`, and `seed:super-admin` once with audited production inputs. Remove bootstrap credentials immediately afterward.
- Configure the compiled jobs worker (`npm run start:worker`) as a continuously running service separately from the API process. The reference Compose file includes this service; `npm run jobs:worker` is the development entry point.
- Configure centralized logs, error tracking, uptime checks, metrics/alerts, payment-webhook failure alerts, job-queue alerts and disk/memory alerts.
- Define incident response, on-call ownership, provider outage procedures, payment reconciliation cadence and daily settlement checks.

### Security, legal and assurance

- Commission an independent penetration test covering RBAC/ABAC, tenant isolation, webhook replay, file upload, session rotation and CCTV access.
- Run load tests against authentication, dashboard aggregation, media upload and webhook bursts using production-like data volumes.
- Complete privacy policy, terms, data-processing agreements, Kenya Data Protection Act review, retention/deletion schedule and breach-response process.
- Review PCI scope with payment providers; PMCC must not collect or store raw card details.
- Verify CCTV notices, access policy, retention limits and evidence-export governance with counsel.

### Acceptance

- Run the CI workflow and `npm run verify:production` from a clean checkout.
- Build both Docker images with the real public API URL and scan images/dependencies for vulnerabilities.
- Exercise login/OTP, invitation, tenant onboarding, rent payment, signed webhook confirmation, reversal, maintenance media, every role workspace, CCTV authorization and cross-organization denial in staging.
- Confirm `/api/v1/health/live` returns 200 and `/api/v1/health/ready` returns 200 only while MongoDB is connected.
- Perform a small real-money M-Pesa and Paystack transaction, refund/reversal and settlement reconciliation before opening access broadly.

## Deployment Notes

`infrastructure/docker-compose.production.yml` is a reference single-host deployment, not a substitute for managed secrets, TLS termination, backups or autoscaling. For a serious launch, deploy the API, worker and frontend as separate services behind HTTPS and use a managed MongoDB cluster and private object storage.

Do not enable the development preview system in production. The frontend excludes preview role resolution when `NODE_ENV=production`, and `/dev/preview` returns 404 in production.
