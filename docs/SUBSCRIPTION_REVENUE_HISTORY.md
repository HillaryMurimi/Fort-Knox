# Subscription revenue history — M2

Implemented contract, 2026-11-06. Release evidence belongs in the dated completion report; this specification does not certify an environment or authorize deployment/outbound activity.

## Authoritative event foundation

`SubscriptionMovement` belongs to the existing billing domain. It is the analytical source for historical recurring value and future M3 Supervisor/retention proposals. It is not a cash ledger, revenue-recognition engine, forecast, or replacement for subscription access policies.

Verified initial Paystack settlement and recurring settlement append an event in the **same MongoDB transaction** as the paid invoice, processed billing proof, subscription state and audit. They validate same-organization signed contract, provider reference/proof, exact integer commercial snapshot, and matching paid subscription term. No current catalog price is substituted. Expiry/cancellation and the subscription state change also share a transaction and audit. Provider calls remain outside MongoDB transactions. Collection must run even while the analytics UI switch is OFF.

Each event retains organization/subscription, currency, effective and recorded dates, previous/new recurring minor-unit decimal strings, per-subscription sequence, previous event reference, source key/type/reference, paid-through date where applicable, invoice/contract/billing-event/webhook/actor references, dataset and opening-completeness gaps. Strings support up to 30 digits; calculations use BigInt. Invoice writers retain their existing safe-integer constraints.

| Kind | Evidence and effect |
| --- | --- |
| ACTIVATION | Initial paid signed-contract invoice, no earlier paid organization invoice, no stream; zero to paid monthly value |
| RENEWAL | Next verified paid term at unchanged recurring value; delta zero |
| EXPANSION / CONTRACTION | Next verified paid term has higher/lower signed commercial monthly value |
| CANCELLATION | Authorized immediate cancellation, processed disable webhook, or scheduled cancellation at the verified paid-term boundary; value to zero |
| EXPIRATION | Due paid-term boundary or verified failure webhook that transitions access to past-due; value to zero |
| REACTIVATION | Verified payment following a recorded zero state; separate from new MRR |

Scheduled cancellation is not churn until effective. Failure/disable webhook transitions use the observed local state-transition time, not an invented historical provider time. A payment after an expired paid term records the explicit expiry first if the worker has not yet done so. Stale expiry jobs compare the expected paid-through date inside the transaction and cannot end a later term. Replays deduplicate by source; changed paid-term replays conflict. Sequence uniqueness plus subscription writes protect concurrent transitions. A late payment overlapping a recorded boundary remains explicitly incomplete; original events are never rewritten.

Application save/update/delete/replace/bulk mutation of retained events is blocked. No mutation API exists. Unique indexes enforce source and subscription/sequence identity. This is application-level append-only storage, not cryptographic/WORM storage: operational MongoDB credentials must not be granted unrestricted evidence modification. Raw collection access is used only by isolated test fixtures; no backfill or production migration mutates history here.

## Monthly snapshots

The read model derives reproducible monthly snapshots from retained events, without a second analytics datastore. Sources are read sequentially in one replica-set snapshot transaction; a concurrent settlement cannot be read halfway through. `asOf` is the actual observation time, not a user-supplied historical completeness claim. Late evidence may change later observations of the derived report; its original recorded date stays visible.

Periods are half-open Africa/Nairobi calendar months. Opening is immediately before the first instant of the month; closing immediately before the next month. Events at the start belong to that month's movement. No currency conversion or cross-currency total is allowed.

`closing = opening + new + reactivation + expansion - contraction - churned`

Renewal adds no new MRR. Cancellation and expiration contribute churn once. Exact chain/value/link/order validation and the equation must pass. Missing opening, source proof, signed contract, unrecorded paid-term boundary, currency change, conflicting evidence, source truncation, and current/future unclosed months produce **null amounts with reasons**, never fabricated zero. Periods before ledger coverage are unavailable. A complete month means the retained evidence reconciles, not that Paystack completeness has been independently certified.

## Cohort definition

A customer is an organization. Cohort membership is its first verified activation month, and baseline revenue is its first paid monthly recurring value. Cohorts are selected by the requested month range; subsequent retention columns cover requested month ends. An organization with unknown legacy opening is excluded from verified cohort membership and separately reported as a reconciliation gap. The table is explicitly a verified-activation population, not a claim about all historic customers.

At each closed month end, a customer is retained if its verified recurring value is positive. Reactivated customers count as retained at that point. Customer retention = retained organizations / original cohort organizations. Gross revenue retention caps each organization's current value at its own initial value before summing; net retention includes expansion. Percentages truncate to two decimals using integer arithmetic. Empty cohorts, zero revenue denominators, insufficient history, source conflicts and incomplete periods show unavailable values. Currency is fixed throughout a stream; changes require reconciliation rather than combining currencies.

## Read APIs and UI

Existing `/api/v1/sales/success/revenue` is extended with:

- GET `/history?from=YYYY-MM&to=YYYY-MM&currency=KES`: one to twelve months, bridges/cohorts, source count, reconciliation counts/first 100 issues and limits.
- GET `/movements?currency=KES&page=1&organizationId=...`: optional organization filter, twenty events per page, bounded page number.
- GET `/movements/:movementId`: safe invoice, contract references, billing proof and webhook envelope summary. No raw provider payload, authorization codes, credentials or contact information.

All require real platform-admin authority and SALES_ANALYTICS. Reads are audited and no-store. Current organization dataset checks exclude demo organizations even if an event was mislabeled LIVE. Frontend preview never fetches finance evidence; caches include principal/access. Existing Revenue workspace contains independent historical period controls, horizontal keyboard-scrollable tables, completeness reasons, reconciliation details, paginated sources and a focus-managed dialog. Current cash/MRR and target journeys continue unchanged. Historical target attribution is not yet certified; NEW_MRR quota actuals remain unavailable rather than silently adopting different cohort semantics.

At most 10,000 events, invoices and subscriptions are retained per report query, with bounded related proof queries and database timeouts. Exceeding a source cap makes historical metrics unavailable. Scaling beyond this requires an explicitly reviewed checkpoint/materialization strategy; do not silently truncate or infer opening balances.

## Reconciliation and M3 boundary

Reconciliation detects missing provider proof, missing or metadata-only contract links, missing signed contract, missing exact snapshots, paid invoices without movements, movements with missing/conflicting source, unprocessed lifecycle webhook proof, missing subscription opening and incomplete chains/periods. It is read-only: no original invoice, contract, payment or event is amended or backfilled. Operator evidence review and an explicit append-only correction design are required before resolving late/legacy gaps. Refunds, fees, tax and recognized revenue remain outside this report.

Future M3 agents must consume the qualified report and its immutable source IDs, not differences between today's dashboards or optimistic forecasts. `completeFromStart` on an individual event alone is **not** proof of current source completeness. Require report completeness, reconciled bridge, valid currency/period, current source checks and nontruncated evidence before even proposing a financial trigger. `autonomousInterventionsEnabled` is always false. Agent permissions, fresh approvals, consent, suppression, contact timing, budget and outbound policies remain independent mandatory gates. This implementation does not add or activate any autonomous intervention.

## Owner actions before a separately authorized release

1. Keep automatic Coolify deployment disabled while accepting these commits; a push is not deployment authorization.
2. In the intended replica-set environment, back up and run `npm --prefix apps/backend run sales:create-indexes` **before** the new API/worker processes billing. It adds the movement collection indexes alongside existing sales indexes. Production financial recording fails closed if required uniqueness indexes are absent. This command was not run against an owner database during implementation.
3. Release matching API and worker revisions in a controlled maintenance window after separate authorization. Old writers cannot produce the new ledger; pre-release gaps stay unavailable. No destructive migration or historical backfill is included.
4. Enable SALES_ANALYTICS only after administrator review, then inspect reconciliation against actual retained Paystack evidence. No new environment variables or API credentials are required; existing Paystack keys/webhook verification configuration remains authoritative.
5. Independently validate real provider settlement, backup/restore, rollout/rollback and completeness before using history for customer-impacting actions. Staging, production, live payments and live outbound each retain their existing authorization boundaries.
