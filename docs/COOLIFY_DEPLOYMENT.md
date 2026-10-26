# Coolify Deployment

Coolify is the intended application host. The repository-owned
`docker-compose.coolify.yml` runs three services: `api`, `worker`, and `web`.
Use a separately managed TLS-enabled MongoDB replica set. This Compose file
does not create a database or include secrets.

## Create the Application

1. In Coolify, create a Git-backed application from the Fort-Knox repository
   and select the Docker Compose build pack. Set Base Directory to the repo
   root and Docker Compose Location to `docker-compose.coolify.yml`.
2. Use the normal Coolify-managed Compose deployment, not Raw mode. In
   Advanced, disable automatic build-argument injection: the frontend
   Dockerfile declares only the two public URL build arguments it needs.
3. Give `web` a domain such as `https://app.example.com:3000` and `api` a
   domain such as `https://api.example.com:9000` in their Coolify service
   Domain fields. The suffix is the internal container port; visitors use
   standard HTTPS. Do not assign a public domain to `worker`.
4. Set all required variables under the Coolify application's Environment
   Variables. `${NAME:?}` entries block deployment until entered. Values
   such as `MONGODB_URI`, JWT secrets, provider keys, and S3 credentials are
   runtime secrets. Do not commit a `.env.production` file. Optional OAuth and
   WhatsApp variables may remain empty.

The public URLs must agree exactly:

| Variable | Example | Purpose |
| --- | --- | --- |
| `WEB_ORIGIN` | `https://app.example.com` | API CORS and secure browser origin |
| `PUBLIC_API_URL` | `https://api.example.com` | OAuth callback origin |
| `NEXT_PUBLIC_API_URL` | `https://api.example.com/api/v1` | Frontend build-time API base |
| `NEXT_PUBLIC_SITE_URL` | `https://app.example.com` | Frontend build-time metadata origin |

`NEXT_PUBLIC_*` values are baked into the web image: change them with a new
deployment, not merely a container restart. Backend/provider secrets must
never be placed in `NEXT_PUBLIC_*` variables or Docker build arguments.

## Provider Setup

- Register the API's HTTPS Paystack webhook at
  `https://api.example.com/api/v1/integrations/webhooks/PAYSTACK` and the
  M-Pesa callback at the matching `/MPESA` path, subject to the trusted
  gateway described in [Phase A owner actions](PHASE_A_OWNER_ACTIONS.md).
- Set the Paystack browser return URL in `PAYSTACK_CALLBACK_URL`; do not use
  the webhook URL as the browser return. Configure the OAuth provider callback
  origins using `PUBLIC_API_URL`.
- Check that Paystack and M-Pesa credentials are approved for the actual
  merchant and environment. Tenant checkout now requires an active default
  destination for the organization/provider. Set the landlord destination
  before attempting a rent checkout.
  For Paystack, complete any subaccount verification requested in the merchant
  dashboard, then use the landlord's **Refresh status** action. A pending
  destination cannot receive a new rent checkout. Confirm actual automatic
  settlement in the Paystack dashboard and receiving bank separately; PMCC
  does not initiate a second transfer from the platform balance.

## Verify and Operate

1. Deploy the selected commit and inspect all three service logs. The API
   readiness health check must reach `/api/v1/health/ready`; the web check
   must reach `/`. The worker has no public port and must remain running.
2. Verify the two public HTTPS domains, authentication cookies, CORS,
   provider callbacks, and the production release checks. Test a real
   provider transaction in staging before any live customer payment.
3. Run the read-only `phase-a:inventory` from a trusted machine with the
   target MongoDB URI. It is not included as a one-shot Coolify service.
   Review `jobs.dedupeKey` uniqueness before enabling event delivery.
4. Run one-time RBAC/billing/bootstrap seed commands from a trusted admin
   workstation with audited production inputs. The runtime API image does
   not contain `tsx` or the TypeScript seed scripts. Never configure seeds
   as startup commands that run on every Coolify redeployment.
5. Configure independent MongoDB backups, tested restore, log retention,
   payment/worker alerts, TLS renewal, and rollback procedures. Coolify
   container storage is not a database backup.

Do not expose port 9000/3000 directly in a firewall. Coolify's proxy should
route the two domains to their internal service ports. The separate
`infrastructure/docker-compose.production.yml` remains a non-Coolify
reference deployment and is not the source for this Coolify application.


## Email-only initial deployment

The Compose deployment now defaults SMS, M-Pesa, Paystack, document storage and
CCTV OFF. Disabled providers may have empty credentials and do not prevent
API/worker startup. Email remains mandatory; Compose defaults to RESEND, with
SENDGRID supported. Configure EMAIL_FROM, EMAIL_SENDING_DOMAIN, the selected
provider key, and EMAIL_DOMAIN_VERIFIED=true only after actual domain/DNS checks.

Runtime service flags: SMS_ENABLED, MPESA_ENABLED, PAYSTACK_ENABLED,
DOCUMENT_STORAGE_ENABLED and CCTV_ENABLED. Enabling a flag requires that
provider’s complete production configuration at startup. Stored platform
switches and SMS receipt evidence must also permit use; flags alone never enable
SMS authentication. Keep optional OAuth credentials empty for the email-only
initial launch: existing social onboarding still verifies phone.

Run auth:create-channel-indexes and the existing documented indexes from a
trusted operator workstation before enabling this release. Existing saved OFF
email switches need the audited auth:configure-otp procedure. No seeds or
recovery scripts run on every deployment. See OTP_AUTHENTICATION_CHANNELS.md
for the exact trusted bootstrap, provider tests and later SMS activation.

Containers run without root, use init/graceful termination, expose only internal
ports, and keep secrets at runtime. Web explicitly binds 0.0.0.0:3000. Backend
Docker build context now excludes all .env variants. Worker runs the existing
durable jobs/monitoring heartbeat loop. Observe its heartbeat and failed-job
queue after deployment; a running process is not proof jobs are healthy.

The source is compatible with the Git-backed Coolify Compose workflow described
at https://coolify.io/docs/applications/builds/docker-compose. A successful
Compose parse and application build do not certify a target server deployment.
Live HTTPS, email receipt, MongoDB transactions/indexes, worker recovery, backups
and restore acceptance remain required before opening production to customers.
