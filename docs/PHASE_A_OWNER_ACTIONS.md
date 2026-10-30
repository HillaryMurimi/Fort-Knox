# Phase A Owner Actions and Release Gates

Phase A is not complete. Payment allocations now calculate in integer minor units,
but operational finance collections, APIs, reports, and older events still use
major-unit numbers. Do not enable non-KES operating currencies or describe the
ledger as migrated. The owner has confirmed there is no live customer finance
data; verify the actual deployment database before a future storage cutover.
New rent ledger records now dual-write minor-unit fields, but old rows and
reports still rely on major units. Do not backfill or drop fields manually;
the controlled migration and parity verification are still pending.
The app will be hosted on Coolify; follow [Coolify deployment](COOLIFY_DEPLOYMENT.md)
for its Git/Compose setup and URL mappings. Enter secrets in Coolify environment
variables rather than committing a deployment `.env` file.

## Your Actions

1. Configure backend secrets in your deployment secret manager (or an ignored
   local `apps/backend/.env` for staging). Use `apps/backend/.env.example` as
   the key list. Never commit a real `.env` file or paste secret values into
   GitHub, a frontend variable, or a support ticket.
2. Supply `MONGODB_URI` for a TLS-enabled MongoDB replica set/managed cluster,
   `WEB_ORIGIN` and `PUBLIC_API_URL` for your HTTPS domains, two distinct
   64+ character `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values, and
   `REFRESH_COOKIE_SECURE=true` in production.
3. For landlord-owned M-Pesa rent STK: complete Safaricom production approval, then provide
   `MPESA_BASE_URL`, `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`,
   `MPESA_SHORT_CODE`, `MPESA_PASSKEY`, and an HTTPS `MPESA_CALLBACK_URL`.
   Configure `MPESA_WEBHOOK_SECRET` only if your trusted callback gateway
   actually signs callbacks. Set `MPESA_RENT_ORGANIZATION_ID` only to the exact
   organization that owns the configured shortcode, after ownership review;
   require its owner-attested PayBill to match `MPESA_SHORT_CODE`. Other
   landlord organizations have payment instructions only. The deployment has
   one M-Pesa merchant identity, not per-landlord credentials.
4. For Paystack SaaS subscriptions only: complete merchant
   approval/KYB and settlement-bank verification, then provide
   `PAYSTACK_SECRET_KEY` and HTTPS `PAYSTACK_CALLBACK_URL`. Register
   `/api/v1/integrations/webhooks/PAYSTACK` at the public API host. Check
   enabled channels and recurring-card eligibility in your merchant account;
   code support does not grant merchant approval. Use test keys for staging,
   live keys only for the live deployment. New Paystack rent checkout and
   subaccount provisioning are blocked because the platform merchant account
   is reserved for SaaS billing. Historical signed rent events may still be
   reconciled, but no new rent transaction may use this platform account.
   Review any older rent destinations lacking country or currency metadata
   before relying on instruction display or historical reconciliation.
5. For production login and notifications: configure
   `SMS_PROVIDER=TWILIO`, `SMS_FROM`, `TWILIO_ACCOUNT_SID`,
   `TWILIO_AUTH_TOKEN` only if SMS is enabled. Configure `EMAIL_PROVIDER=RESEND`
   with `RESEND_API_KEY`, or `EMAIL_PROVIDER=SENDGRID` with `SENDGRID_API_KEY`,
   plus `EMAIL_FROM`, `EMAIL_SENDING_DOMAIN` and `EMAIL_DOMAIN_VERIFIED=true`
   only after actual DNS/provider verification. Verify sender/domain setup and
   OTP delivery. Add the optional WhatsApp pair only if approved and enabled.
6. For private documents and CCTV: configure `S3_BUCKET`, `S3_REGION`,
   `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (and `S3_ENDPOINT` for a
   compatible service), plus `CCTV_PROVIDER_BASE_URL` and
   `CCTV_PROVIDER_API_KEY` if CCTV is deployed. Keep RTSP credentials out of
   browsers and this app's environment.
7. Configure Google/Facebook/Apple OAuth keys and registered callback URLs
   only for providers you intend to enable. The matching key names are in
   `apps/backend/.env.example`; leave a provider fully unconfigured otherwise.
8. Run `npm --prefix apps/backend run phase-a:inventory` against the target
   MongoDB URI. It is read-only and returns only collection names; exit code
   2 means legacy-priced records exist. Stop and plan a verified backfill
   rather than dropping records or treating the database as empty.
9. Inspect `jobs.dedupeKey` indexes and duplicate values in the target DB.
   The delivery worker requires one unique sparse index. Migrate an older
   non-unique index under a maintenance plan after duplicate review. Deploy
   the compiled jobs worker continuously and alert on dead-letter jobs.
   In Coolify, `worker` is a private service in `docker-compose.coolify.yml`.
10. Run `npm run verify:production` and the replica-set E2E suite in staging.
    Perform real-provider test-mode acceptance, small live M-Pesa/Paystack
    payments, refund and settlement checks, backup restore, and security review
    before serving customer money.

## Still Required in Code

- Complete the authoritative minor-unit storage/API/report cutover, including
  units, tenancies, rent charges, allocations, expenses, maintenance, move-outs,
  subscription billing, and intelligence outputs. The read-only inventory is
  not a migration command.
- Establish a tested country/currency/provider capability policy per merchant
  and organization. Current operational finance intentionally remains KE/KES.
- Expand transactional event producers and durable consumer checkpoints beyond
  payment activity; add bounded backfill, monitoring, and replay operations.
- Review remaining vendor boundaries and reconcile real provider settlements.
  Crypto checkout, per-landlord M-Pesa credentials, and automated M-Pesa
  reversal remain unavailable.
