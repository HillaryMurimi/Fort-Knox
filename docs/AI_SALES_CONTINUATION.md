# AI Sales and Customer Success - continuation work log

Baseline: f6b5467 on codex/phase10-digital-twin-scenario-foundation. Existing CRM, meeting management, delegation, authentication, billing and onboarding are preserved. No deployment or live outbound test is authorized. The historical baseline report is AI_SALES_CUSTOMER_SUCCESS.md.

## Milestone 1 - current baseline

Reviewed the continuation request, existing acceptance report, sales services/models/controllers/UI/tests, live authorization loading, central PlatformSwitch catalog, durable Job claims/recovery, existing acquisition journeys, commercial pricing and Coolify API/worker/web deployment. Re-ran the existing sales-success unit and MongoDB HTTP suites: 16 PASS. The six historical agent definitions were not executable before this continuation.

## Milestone 2 - implemented runtime

Implemented a model-provider interface and optional server-side OpenAI Responses adapter using fixed HTTPS egress, strict schema output, validated usage, cancellation timeout, no provider-body logging and store:false. Model identity is explicitly configured; no model, pricing or API credit entitlement is assumed. The request/response contract follows [official structured-output documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). This is not a ChatGPT subscription integration.

All six agents now have versioned instructions, fixed service identities, fixed proposal tools and executable queued model workflows. Agent-specific roles remain an intersection of the current task owner's permissions, current assigned customer scope and the static tool allowlist. An agent cannot grant permissions, execute arbitrary code, confirm payment, modify contracts/subscriptions, or select network endpoints. The browser queues tasks; existing Job workers execute them after browser closure.

Generation is advisory and all proposed effects require payload-bound review. CRM_NOTE approval appends a note transactionally; outreach, research, meeting and assistance proposals remain approved proposals until their domain dispatch workflows are implemented. Approval does not assert that a message was sent, a prospect was created, a calendar event was booked or assistance resolved. These later workflow gaps are tracked below.

Persistence: SalesAgent configurations, SalesAgentRun executions and versioned SalesAgentApproval records. Execution states cover QUEUED, RUNNING, AWAITING_APPROVAL, COMPLETED, FAILED, CANCELLED, BLOCKED and PAUSED. Resume retains previous proposal generations. Claims and result fencing prevent concurrent execution or cancelled requests from committing stale proposals. Retries use existing Job backoff/dead-letter behavior and a hard three-attempt execution limit. A blocked task requires deliberate resume rather than silently retrying unavailable integrations.

Limits: one active generation per agent across worker replicas, maximum daily runs, conservative input/output-token reservations, configured-rate USD budget reservations and model request timeout. Reservations are not refunded when the provider outcome is uncertain; retry can consume additional budget. Input pricing must be supplied as a conservative rate ceiling. Reported costs are CONFIGURED_RATE_ESTIMATE or UNKNOWN, not a provider invoice. Usage includes provider-reported input/output tokens. Initial production defaults are disabled/paused with zero budget.

The prompt contains a minimized customer summary and a bounded recent history. It excludes phone/email/contact arrays and authentication/provider credentials. Outreach/follow-up context uses the existing acquisition pricing catalog when a numeric estimated unit count is known, explicitly labeling the quote basis as unconfirmed customer estimates. Missing unit counts do not authorize price promises. Customer notes/objectives/source content are untrusted input; the model's response cannot expand tool authority. Human review remains necessary for accuracy of generated language.

The existing SUPER_ADMIN feature catalog now includes sales capabilities and individual agents. Runtime, agent and approval guards are checked at service/worker boundaries. Unimplemented optional capabilities cannot be switched ON. Switching runtime/agent OFF fences later responses; it cannot undo provider usage already initiated. Existing manual CRM data remains readable. The outbound control remains OFF until dispatch infrastructure is implemented. No separate Feature Control Center or worker queue was added.

The /sales-success AI Agents tab now contains live configuration, durable task queuing, bounded execution history, exact-payload approval decisions and pause/cancel/resume controls. It distinguishes proposals from external actions. Configuration and approval decisions use existing recent dual-channel SUPER_ADMIN assurance. The new sales.agents.execute permission is delegated through the existing per-user role mechanism. Workers reload users and roles before generation and before committing proposals; suspended users/revoked grants or changed assignment stop execution. Read-only execution access still requires permission to read constituent customer notes.

## Added APIs (existing /api/v1/sales/success namespace)

- PATCH /agents/:key: fresh SUPER_ADMIN configuration, optimistic revision.
- POST /agent-runs: explicit execute permission, assigned customer, idempotent command ID.
- GET /agent-runs: permission-filtered metadata, 20 per page.
- GET /agent-runs/:runId: permission-aware output and current proposal.
- POST /agent-runs/:runId/control: authorized pause/cancel/resume.
- GET /approvals: bounded scoped review metadata.
- POST /approvals/:approvalId/decisions: fresh SUPER_ADMIN, exact hash, expiry and generation check.

OpenAPI documents request schemas and errors. Generic job management cannot enqueue sales.* types or reserve sales-owned dedupe keys. Worker payloads cannot impersonate another user; the persisted execution determines the acting principal.

## Database and configuration

New indexes: unique agent key; unique requesting-user/command ID; unique run/generation approval; lead/date and status/lease indexes. The existing sales:create-indexes command installs additive indexes and the existing Job dedupe index. Production execution/configuration checks unique index readiness and fails closed. No destructive migration, production backfill or live database command has been run.

Optional env fields (backend and shared Coolify API/worker environment): SALES_AI_API_KEY, SALES_AI_MODEL, SALES_AI_INPUT_MICRO_USD_PER_MILLION, SALES_AI_OUTPUT_MICRO_USD_PER_MILLION, SALES_AI_TIMEOUT_SECONDS. Key/model must be configured together. Missing both keeps CRM operational. Zero rates block non-test execution. Set reviewed cost ceilings for the actual configured model, not arbitrary low values. Never place credentials in browser environment variables.

## Current gap matrix

| Capability | Current continuation status |
| --- | --- |
| Existing CRM / meetings / delegation | Preserved; baseline and regressions executed |
| Durable executable six-agent model runtime | Implemented; controlled adapters, not live-provider certified |
| Configuration, limits, cancellation, approvals, history UI | Implemented |
| Real lead discovery connector and source ingestion | Pending next milestones |
| Outbound delivery/replies/verified webhooks | Pending next milestones |
| External calendar booking/synchronization | Pending next milestones |
| Automatic verified identity resolution and merge review | Implemented; optional autolink policy defaults OFF |
| Durable lifecycle projection/replay/backfill | Implemented on existing Jobs, DomainEvent and AuditLog |
| Campaigns, secure links and attribution | Implemented; governed campaigns, consented first/last/referral evidence and deduplicated commercial projections |
| Follow-up state machine and quiet-hour/suppression policy | Pending next milestones |
| Proactive assistance and building/floor activity | Pending next milestones |
| Revenue/campaign analytics and retention controls | Pending next milestones |

The full continuation is not yet complete. Missing credentials block live-provider acceptance, not provider-independent engineering; pending code work continues after verified milestone commits.

## Runtime verification

Controlled MongoDB agent suite: 14 PASS (six agent execution cases plus idempotency, unavailable providers/features, forbidden tools, daily limits/revocation, cancellation/resume history, simultaneous command deduplication, expired-lease recovery and authenticated HTTP/fresh-assurance validation). Provider/policy unit suite: 10 PASS. Combined focused baseline/runtime/monitoring suite: 45 PASS at that review point. Frontend suite: 304 PASS after adding runtime UI tests and two shared status mappings. No live model, outreach or payment requests were made. Final milestone command outcomes are appended after completion.

## Runtime files and purposes

New backend files: database/models/SalesAgent.ts (config/run/approval persistence), integrations/ai/sales-model.provider.ts (optional model adapter and test-only injection), modules/sales/sales-agent.schemas.ts (tools and contracts), sales-agent.repository.ts (current principals, scoped queries and durable queue writes), sales-agent.service.ts (execution/review/limits), sales-agent.controller.ts, sales-agent.openapi.ts, sales-feature.registry.ts. New tests: tests/e2e/sales-agent.e2e.test.ts and tests/unit/sales-agent-provider.test.ts.

New frontend files: lib/data/sales-agents.ts, components/sales/sales-agent-control.tsx and lib/data/sales-agents.test.tsx. Modified: existing AI Agents tab, shared status registry/tests, permission catalog source, availability controller/service, sales router/OpenAPI composition, Job dispatch and reserved-job schemas, feature catalog/enforcement manifest, central env schema/example, Coolify environment, and sales index installer. Related docs link to this log.

## Five runtime review passes

1. Architecture: reused Job, current User/Role memberships, SalesLead, SalesActivity, AuditService and PlatformSwitch. No new authentication, queue, billing or CRM authority.
2. Security: fixed unbounded assignment retrieval with database lookup-based scopes, protected system job namespaces, retained approval generations, required constituent note permissions and prevented model-selected tools from expanding capabilities. No arbitrary network tools exist.
3. Correctness: fixed enum widening and strict optional frontend property handling. Current authoritative pricing is supplied with explicit estimate basis; no sales operation confirms payments. Approval is not dispatch. Checked reservation accounting and cancellation result fencing.
4. UX: operational agent controls replace descriptive-only cards. Read/loading/error/unavailable states and persisted execution status are distinct. Shared status mappings added rather than weakening the backend-enum coverage test.
5. Production: optional configuration defaults remain unavailable, unique-index checks fail closed, no live sends or deployments. Live API receipt, provider rate/cost verification, target worker restarts and the later domain workflows remain acceptance work.


### Verified runtime milestone gates

- Repository typecheck: PASS (both applications); final backend build also strictly typechecks current runtime code.
- Repository lint: PASS, zero errors (510 backend / 27 frontend warnings at this run).
- Repository default tests: PASS, 488 backend + 304 frontend. Opt-in E2E cases are not claimed from the default command.
- Focused runtime: 24 PASS (14 MongoDB execution cases + 10 provider/policy unit cases), using controlled adapters only.
- Production build: PASS for both applications; final backend build rerun after runtime failure-audit hardening.
- Static release certification: CERTIFIED_STATIC, 39 route files / 166 permissions / 10 critical paths.
- Existing sales browser verifier: PASS, including the new operational Agents tab in unavailable mode, saved CRM/meetings and existing pilot/commercial regression; light/dark, desktop/tablet/mobile, zero console errors.
- No live provider use, real messages, payment initiation, deployment or production index changes.

Every successful verified milestone is committed and pushed to the existing branch under the owner's standing instruction. The complete continuation remains active after this runtime milestone.


## Verified identity and lifecycle milestone

Implemented exact verified-owner-email resolution with active canonical LANDLORD membership checks. Unique matches are suggested until fresh administrator review or the separate SALES_AUTOLINK policy permits linking. Ambiguous, conflicting, rejected and unverified identities never auto-link. Manual linking remains available. Customer merges require exact payload/revision approval, shared contact evidence and an unlinked source; linked identity remains canonical. Source records and histories are preserved, and opt-out propagates.

Lifecycle projection consumes existing DomainEvent and AuditLog sources through existing leased Jobs. A durable five-minute scan pages active organizations, discovers pending verified identities and backfills actual inventory records. Source timestamps and IDs form paired ordered cursors; unique source keys prevent replay duplicates. Actual record backfill is explicitly labelled as record evidence. Payment/activation advancement requires existing verified commercial records; tenant rent or checkout claims cannot confirm subscriptions. No payment or inventory data is mutated.

New API: customer identity suggestions/decisions, bounded cursor history, merge proposals/decisions, lifecycle replay and projection health. All identity decisions, merges, replay and health require platform administration; decisions require fresh dual-channel assurance. Delegated histories retain assigned-customer scope and constituent notes/onboarding permissions. UI provides these actions in Customer 360, including historical paging. Agent CRM notes now execute the exact hashed approval payload; revoked requesters cannot execute, while reviewers can safely reject their pending proposals.

Database additions: SalesIdentityMatch, SalesMergeRequest and SalesProjectionCheckpoint; additive lead identity/merge fields, activity actor/source metadata and unique source index, acquisition referral lead field and source cursor indexes. Run the existing sales:create-indexes command before enabling lifecycle/autolink in production; enabling fails closed without required unique indexes. No production migration, feature toggle or backfill was executed.

Verification: full opt-in regression 239 PASS before the additional approval-payload test; final identity/runtime rerun 23 PASS (8 identity and 15 runtime), plus 3 lifecycle unit cases. Default tests 491 backend and 313 frontend PASS. Both production builds PASS; browser verifier PASS across light/dark and 1440/834/390 widths with zero console errors. Final typecheck/lint are recorded below. Providers remain controlled or unavailable; no real outreach or deployment occurred.

Review passes: architecture reuses existing event/audit/job/commercial authority; security preserves scope, fresh approvals and merge suppression; correctness covers cursor pairs, idempotency and monotonic financial evidence; UX adds bounded history and explicit identity review; operational review adds index readiness and durable health/error evidence. Campaigns, delivery, external calendar, follow-ups, assistance and analytics remain implementation work; continuation proceeds after this commit.

Final identity/lifecycle gates: root typecheck PASS; root lint PASS with zero errors (514 backend / 27 frontend warnings). Reviewed git diff and whitespace checks. All implementation files are scoped to this milestone; pre-existing .continue/ remains untouched.


## Milestone 4 - campaigns and first-party attribution (2026-11-01)

Campaigns persist owner, audience, market, channel, assigned outreach service identity, schedule, message, selection criteria, daily/per-contact ceilings, follow-up offsets, integer micro-USD budget and attribution window. The state machine is DRAFT -> PENDING_APPROVAL -> APPROVED -> ACTIVE, with explicit rejection, pause/resume, completion and cancellation paths. Only drafts may be edited at the current revision; all approved behavioral fields are hash-bound. Approval/activation/resume require fresh dual-channel SUPER_ADMIN proof. Campaign governance is platform-admin-only in this milestone; ordinary delegated CRM permissions do not grant it. Activation does not dispatch messages.

Opaque 256-bit invitation tokens appear only in the create response and /r/{token} URL. The database stores their hashes; lists and audits never expose tokens or intended-contact hashes. Destinations are a fixed PLANS/SIGNUP/DEMO map. Expiry is at most 90 days and within the campaign. Lookup rechecks active campaign integrity/schedule and source/canonical opt-out. Links can be revoked independently. Resolving does not collect analytics or reveal the intended customer. The invitation page offers an explicit consent choice; declining clears/pauses existing optional acquisition analytics. Accepting extends the existing AcquisitionJourney, never a parallel tracking identity. At most 20 distinct link touches are retained per anonymous session; repeated visits preserve first time and update last time. Anonymous acquisition TTL remains 30 days. No IP/device identity is introduced.

Attribution uses the existing acquisition signup binding and lifecycle worker. A current verified owner with canonical active LANDLORD membership, linked CRM identity, consented pre-registration touch and matching immutable intended-email hash is required to claim a campaign conversion. Pending identity review stays pending. Forwarded/mismatched invitations remain unattributed. First/last eligible touches use each campaign's 1-90-day window; explicit referral uses the last eligible touch. Registration attribution freezes as a cohort, and later milestones inherit it, preventing later clicks from stealing paid attribution. Unique organization/milestone indexes deduplicate registration, checkout, verified payment, activation and onboarding-completion projections. Verified payment uses existing signed-contract, matching paid Paystack invoice and subscription evidence; checkout is never paid proof. Financial records remain read-only. observedAt means projection observation time, not a fabricated provider event time.

New models: SalesCampaign, SalesTrackingLink and SalesAttribution. AcquisitionJourney adds consent/touch metadata. Additive indexes are installed by sales:create-indexes; production tracking and attribution fail closed without the link-token and conversion unique indexes. SALES_CAMPAIGNS, SALES_TRACKING and SALES_ATTRIBUTION default OFF; no production switch was changed. Attribution is consumed by existing lifecycle jobs, so enable the lifecycle scanner to keep projections current.

API: paginated GET/POST /sales/success/campaigns; PATCH /campaigns/:id for current drafts; POST /campaigns/:id/commands; GET/POST /campaigns/:id/links; POST /tracking-links/:linkId/revoke. Public rate-limited POST /acquisition/referrals/resolve and /visits use strict body schemas, no-store responses and consent=true for recording. OpenAPI includes all routes. Frontend adds Campaigns governance and public /r/[token] consent surface. Analytics reporting and dispatch remain subsequent milestones.

Security review: exact campaign hash prevents content/limit changes after approval; safe cancellation/revocation remain available when collection is disabled; arbitrary redirects are rejected; generic notification APIs are not used for prospect sends; contact opt-out is checked even if the enum was changed but optedOutAt remains. Attribution batches bounded source reads and never scans contacts by name/IP. Existing CRM, meetings, delegation and runtime were regression-tested.


### Verified campaign milestone gates

- Typecheck: PASS, both applications; final backend strict check covers persisted commercial proof references.
- Lint: PASS, zero errors (530 backend / 27 frontend warnings).
- Default backend tests: 491 PASS, 242 skipped. Opt-in tests are reported separately.
- Frontend tests: 317 PASS.
- Sales regression: 40 PASS across CRM, identity, runtime and campaigns at that review point; final campaign suite 9 PASS, including draft-revision controls, exact approval, expiry/revocation/opt-out, consent, same-millisecond first/last ordering, forwarded-contact mismatch, windows, paid deduplication and immutable invoice evidence.
- Root production build: PASS, both applications. Backend rebuilt after final commercial proof-reference changes.
- Browser: PASS, existing Control/Fort Knox/pilot/commercial/CRM flows plus campaign submit/dual-channel step-up/approve/activate and invitation consent acceptance/decline. Light/dark, 1440/834/390 widths, keyboard, zero console errors. Browser response correlation now requires the actual command kind, preserving existing amount/state assertions.
- No live provider request, production switch change, real send, payment initiation, deployment or production migration was performed.

Paid conversions retain the exact contract, invoice and subscription references from the verified read projection, plus source time when available; source occurrence and projection observation remain distinct. The next research/outreach milestone continues after the campaign push.
