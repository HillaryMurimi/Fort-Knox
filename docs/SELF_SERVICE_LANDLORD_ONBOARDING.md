# Self-service landlord acquisition and portfolio onboarding

Implementation report and operating runbook, 12 October 2026. This change extends the existing checkout and property models in the current repository. Production deployment and real-provider receipt checks remain separate from isolated automated certification.

## Audited and reused

- Public landing and cinematic fictional demo; existing Control/Fort Knox catalog and commercial `priceSnapshot`.
- Auth bootstrap, email Account OTP, ordinary refresh sessions, administrator selected-channel login and dual-channel sensitive step-up, role catalog and RBAC/ABAC.
- Landlord agreement state machine, append-only contract templates, immutable generated/signed PDFs, existing subscriptions, invoices, receipts and billing audits.
- Paystack checkout reservation, signed webhook settlement, amount/currency/reference matching, delayed verification, idempotency, failed-checkout recovery and renewal scheduling.
- Existing sales intelligence, guided pilots and pilot importer; live imports use the same import service with a separately authorized paid mode.
- Property / Building / Floor / Unit / Tenant / Tenancy / RentCharge and scoped membership models, notification preferences, Notification / Job / DomainEvent and audit infrastructure.
- Existing property setup wizard, tenancy and tenant activation workflows, predictive-learning/model-serving readiness, standalone Next/Express services and Coolify API/worker/Mongo architecture.

No second auth, billing, CRM, predictive model or replacement application was introduced.

## Customer journey and shipped behavior

`/plans` shows current server-calculated prices, included and additional units, monthly equivalent, prepaid invoice estimate, later billing interval and retained agreement terms. Current billing policy calculates no tax; hardware/provider charges are excluded unless agreed. Three months remains the minimum prepaid term, with the existing 3–24 month backend policy. The public demo stays fictional and cannot reach operational data or create money.

The public demo links to plan comparison. Chosen plan, estimated unit count, prepaid term and source travel into minimal signup. Signup collects owner names, email, international phone and password, plus an optional workspace name and unchecked setup-reminder opt-in. No property address or tenant is needed before purchase. Bootstrap commits owner, organization, membership and safe audit together. Contacts stay unverified.

The existing email OTP panel verifies the owner and establishes the normal session. The existing agreement process retains mandatory legal identity, reviewed contract hash, authority and signature checks. Signature and checkout now require proof of the registered owner email. Signed templates are never auto-published in production. Generated PDFs continue to use retained inline artifacts when the S3 runtime is OFF; the DOCUMENT_STORAGE platform switch still governs generation.

Activation remains exclusively backend-controlled. Checkout return references request reconciliation of the saved backend checkout; they cannot mark payment paid. Signed agreement, verified Paystack invoice and subscription activation immediately route the owner to `/get-started`. Property setup is separate from commercial activation. Interrupted checkout, failed payment, duplicate webhook and provider reconciliation continue through the existing authority.

## Guided setup and bulk import

Five stages cover the reused business profile, first property, buildings/units, optional tenants/caretaker and dashboard. Profile values are reused. A property can be created through the ordinary authorized endpoint, the existing advanced setup wizard can be opened, or the whole portfolio can be imported. The owner can add the rest later.

Private drafts persist on Organization with optimistic revisions; stale tabs receive 409. Drafts hold incomplete property fields and at most 500 editable import rows / 750 KB. The draft path is excluded from ordinary Organization serialization and queried only after owner authorization. Saving a draft never completes a checklist or creates a property. Larger files resume by re-uploading; confirmed batches remain durable.

The downloadable Excel workbook contains a blank Units sheet and documented instructions; it contains no fictional customer records. CSV is also supported. Column aliases/order are mapped automatically. Limits are 5 MB, 5,000 rows per file and 50 columns for Excel. Formula, hyperlink and embedded object cells are rejected; KES values convert to integer cents without float rounding. Row editing preserves valid data while errors are corrected.

Each server batch is bounded to 500 rows. All chunks are previewed, then each is revalidated before its atomic commit. The UI reports actual confirmed units. A normalized, key-order-independent SHA-256 digest and retained audit receipt make exact batch replay safe. If later chunks fail, prior confirmed chunks are retained and the same file can resume; no whole-file atomicity is claimed.

Imports support property category, exact matching existing property/building/floor references, units and custom categories, rent, vacancy/reserved/unavailable/occupied status, current tenancy dates, tenant contact, explicitly provided opening balances and scoped caretaker assignment. Flat sites get an explicit Site/Ground floor hierarchy. Existing units are rejected rather than overwritten. Matching hierarchy is reused only when saved details match. Tenant or unrelated staff contacts cannot be silently attached to existing users; controlled existing-account workflows remain necessary. The same active same-org caretaker may gain only the imported property/building scope.

Imported tenant/caretaker contacts remain unverified. Email is required while SMS is unavailable. Current occupied units require names, international phone, email when applicable, and current tenancy start; future or ended leases use the existing tenancy workflow. Imported opening balances are actual supplied obligations; no collected payment is inferred or created.

Capacity uses both existing plan entitlements and the unit count retained in the signed commercial agreement. Manual unit creation/reactivation, advanced property setup and paid imports serialize capacity reservations through the same organization/subscription boundary. Owners should choose their intended portfolio count before signing; an increase beyond signed capacity needs the existing commercial change process.

Caretaker invitations reuse the existing organization invitation endpoint with exact CARETAKER role and property scope. The UI creates a private link for the owner to share; this change sends no invitation or outreach campaign. Tenant activation and email verification reuse the existing controlled workflows.

## First value and intelligence

The first dashboard summarizes actual active properties and unit statuses, saved current tenancy rent and unverified/pending tenant activations. Missing rent is unavailable; partial coverage is explicit. Optional people setup is not an activation blocker. The checklist reads saved records, not frontend stage selection.

A successful authenticated dashboard request with at least one property and unit records first value once with a server timestamp and atomic audit. TTFV is measured from verified payment to that eligible visit; negative/missing timing stays unavailable. This is an authenticated interaction metric, not proof that a human understood the screen.

The existing security router now scopes Fort Knox entitlement checks to security paths, so Control command-center access is not intercepted. Direct camera/security APIs retain their entitlement checks. Manual property-code suggestions update while the name is entered, avoiding a blur-time overwrite of an edited code.

A new paid workspace with no recorded period financial activity shows an explicit empty state. Facts, model predictions and deterministic recommendations are separate. Setup completion creates no AI forecast. Existing intelligence systems remain available subject to their established data/model readiness. No external generative AI integration was added.

## Conversion and revenue evidence

The existing SUPER_ADMIN sales-intelligence screen adds a self-service panel. Public milestones have one timestamp per anonymous session: landing, demo started/completed, selected plan and signup started. Events use a random opaque token stored only as SHA-256 server-side, with no IP/device/contact/tenant/payment/credential fields. Public requests omit auth and cookies; an optional browser control pauses tracking. They are client-reported session activity, not counts of verified people.

Anonymous unbound rows expire after 30 days. Signup binds an available journey transactionally and removes its token hash; account-bound milestones are retained as account evidence. Expired/unavailable analytics never blocks signup. Production tracking fails closed if required uniqueness/retention indexes are absent.

Trusted signup cohorts join actual owner email proof, checkout reference, signed contract, matching paid Paystack invoice, activation timestamps, live property/unit/import evidence and first dashboard marker. Same-cohort account→paid, activation and first-value rates use null when there is no denominator. Linked visitor→paid uses retained landing sessions and matching signed contract/subscription/payment evidence. Missing source is UNATTRIBUTED. Legacy accounts lacking the new owner field stay in the existing business intelligence view; historical funnel events are not backfilled or invented.

MRR/ARR comes from the retained current commercial snapshot of currently active, unexpired, verified paid subscriptions in the selected signup cohort; decimal minor-unit totals stay separated by currency. It is normalized contracted recurring revenue, not prepaid cash or a forecast. Public demo and simulated pilot activity do not become paid revenue. Admin reports expose bounded pages, stage blockers and attention codes without drafts or tenant contacts.

## Recovery emails: implemented, OFF

`ONBOARDING_RECOVERY_ENABLED=false` is the default and Coolify fallback. No campaign, provider message or outreach was activated. Enabling requires an explicit nonempty `ONBOARDING_RECOVERY_APPROVAL_CASE` as well as approved operating configuration, available transactional email, customer signup opt-in and current notification preference.

Existing organization domain events schedule system-owned recovery evaluation after 48 hours only when enabled. Evaluation checks current owner role/scope, active account, verified owner email, consent, preferences and actual remaining setup state. It reuses NotificationService and the Job worker. Queue/audit/cooldown updates commit together. At most three reminders per workspace are queued, separated by seven days. The dispatcher rechecks the enable flag, current approval case, recipient, preferences and still-matching stage before provider delivery. Disablement or opt-out cancels queued recovery delivery.

Unverified signup contacts receive no unsolicited recovery email. Their existing credential/OTP sign-in recovery remains available; the first successful owner email proof publishes the event used for later setup reminders. No raw OTP, magic sign-in token or credential appears in recovery content. SMS recovery is not implemented or enabled. Essential auth/security notifications remain governed by the existing separate policies.

## Database and deployment operations

Changes are additive: optional commercial preference/owner/journey fields, a private portfolio draft/milestone subdocument and the AcquisitionJourney collection. No destructive data migration or legacy fabricated backfill is needed.

Before production rollout, back up MongoDB and run the existing index commands for billing/contracts/auth/notification/job foundations as required by their runbooks. Run `npm --prefix apps/backend run sales:create-indexes`; it now adds acquisition token/org partial unique indexes, anonymous-only TTL and cohort index while preserving existing indexes. Do not use syncIndexes/dropIndexes against live data. Existing MongoDB replica-set transactions and persistent volume are required.

Coolify continues to run the standalone frontend, API, background worker and persistent MongoDB with existing health checks and secure sessions. Imports are request-bounded atomic batches; no new queue/worker service is required for them. Recovery uses the existing worker when operationally enabled. SMS, S3 uploads, CCTV and external generative AI may remain disabled; inline commercial documents still need their platform switch ON.

Manual production requirements remain:

1. Approved current Control/Fort Knox catalog and an effective reviewed contract template; preserve prepaid policy and resolve any applicable tax policy before commercial launch.
2. HTTPS application/API origin, strong distinct session secrets, secure cookies and existing protected admin enrollment.
3. Verified email sender domain/DNS, provider configuration and operational receipt verification from the existing OTP/channel runbook.
4. Paystack keys, exact callback URL and signed webhook route; verify real provider settlement, mismatch rejection, failed checkout/retry and renewal authorization in staging.
5. Replica-set database, backups, persistent volumes, index migration and existing worker/health/monitoring checks.
6. Keep recovery OFF unless explicitly authorized. After authorization, configure its case and validate consent/preference/disablement behavior in staging before any real sends.
7. Perform a Coolify container rollout and post-deploy customer smoke journey. Local source/build checks do not certify the hosted deployment.

## Verification

Certification results are recorded below after the final run. Initial regression failures were corrected before the final certificate; production-provider and hosted Coolify checks are not represented by private fixtures.

| Check                                  | Verified result                                                                                                                                                                                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend default/unit suite             | 362 passed; E2E cases separately executed                                                                                                                                                                                                                            |
| Backend replica-set / HTTP E2E         | 205 passed, including 23 landlord commercial/portfolio cases                                                                                                                                                                                                         |
| Frontend suite                         | 284 passed, including real XLSX round trip, exact KES parsing and route scope                                                                                                                                                                                        |
| Combined automated execution           | 851 successful test executions; 844 distinct tests (7 configuration tests run in both backend configurations)                                                                                                                                                        |
| TypeScript                             | Backend and frontend passed                                                                                                                                                                                                                                          |
| ESLint                                 | Passed, zero errors; 469 backend and 27 frontend warnings remain                                                                                                                                                                                                     |
| Production builds                      | Backend and frontend passed; explicit same-origin API URL supplied for frontend certification                                                                                                                                                                        |
| Static release certification           | CERTIFIED_STATIC; 38 route files, 155 permissions and 10 critical paths                                                                                                                                                                                              |
| Self-service Chrome journey            | Mobile 390×844 and desktop 1440×1000: demo → signup → actual email OTP → interrupted checkout → signed test Paystack payment → immediate wizard → manual property → invalid XLSX correction/import → save/resume → real-data dashboard; zero runtime errors/overflow |
| Existing sales Chrome regression       | Desktop/tablet/mobile, light/dark, keyboard: Control, Fort Knox, pilot import, commercial handoff and sales intelligence passed                                                                                                                                      |
| Existing SUPER_ADMIN Chrome regression | Password/selected OTP, bypass denial/logout, sidebar/control-plane recovery, plan/brief/action/drill-down, desktop/mobile passed                                                                                                                                     |
| Public landing and cinematic demo      | Landing 12 viewport/theme combinations; cinematic 14 viewer/studio combinations and interaction checks passed; no privileged API requests                                                                                                                            |
| Production dependency audits           | Backend and frontend each zero findings after compatible patches                                                                                                                                                                                                     |
| Compose schema                         | Passed with nonsecret test configuration and recovery/SMS defaults OFF                                                                                                                                                                                               |
| Docker container/Coolify live startup  | Not run: laptop Docker Linux engine was unavailable. No hosted deployment, live provider debit or real sender receipt is claimed                                                                                                                                     |

The browser layout checks retain their pointer-reachability assertions. Next's development toolbar is disabled only for isolated browser fixture builds after it was identified as the short-screen obstruction; the customer surface and production behavior are unchanged.

Compatible dependency remediation includes Next/eslint-config-next 16.3.8, Sharp 0.35.5, source-map-js 1.2.2, brace-expansion 1.1.21 and a scoped ExcelJS uuid 11.1.1 override. Backend lockfile updates patch ip-address 10.7.4, morgan 1.12.1, multer 2.4.0 and proxy-addr 2.0.8 without changing their declared dependency ranges. ExcelJS 4.4.0 is dynamically imported for spreadsheet work. No force downgrade was used.

**Outstanding development-tool dependency issue:** full frontend npm audit still reports five high findings through the ESLint Next plugin → fast-glob/micromatch → braces 3.0.3 chain. The current compatible toolchain has no upstream patched braces release; npm proposes a framework-generation downgrade. This is documented rather than applied. It is excluded from production dependency audit, and arbitrary customer glob patterns are not passed to these tools. Review/remediate the development-tool advisory before a clean full-audit certification.

**Rollout assessment:** source, automated journeys, builds, static contract and Compose schema are verified. Production activation still requires the manual sender/Paystack/template/index and hosted Coolify checks above. Recovery stayed OFF, with zero recovery emails sent during all browser journeys.

## File manifest

The accompanying `SELF_SERVICE_FILE_MANIFEST.md` lists the final files changed and their purpose. Test screenshots and transient runner logs are intentionally excluded from commits; verification scripts produce them on demand.

## Limits and dependencies

Five thousand rows per upload and 500 rows per transaction; private saved drafts hold the first 500 rows. Larger portfolios use multiple files/batches. Existing contacts, historical/future leases and signed-capacity changes use their existing controlled workflows. The new cohort begins at deployment and does not reconstruct historic visitors.

Provider integration tests use private test deliveries and signed test Paystack callbacks, with no live debit or email sends. Sender DNS/keys/receipt, approved contractual terms, real Paystack configuration, MongoDB production indexes and Coolify runtime remain operational dependencies. Remaining dependency-audit findings, if any, are stated in the final certificate.
