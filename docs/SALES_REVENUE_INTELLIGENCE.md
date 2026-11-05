# Revenue intelligence and target governance

M2 first delivery, 2026-11-04. This extends the existing sales runtime, CRM and Platform Business Intelligence. It does not complete the Revenue Supervisor, retention agent, historical revenue ledger or the full revenue-growth roadmap.

## Functioning journey

With SALES_ANALYTICS enabled, a real SUPER_ADMIN opens Sales & Customer Success → Revenue. Select a currency and up to 366 days in Africa/Nairobi. Review gross qualifying receipts, daily cash, current MRR/ARR, top 20 campaign contributions, current CRM statuses and agent execution outcomes. Data is fetched from the authenticated backend; there is no preview finance dataset in this screen.

Create monthly, quarterly or annual targets with an explicit baseline, metric, currency, scope and pipeline assumption. No quota is seeded. Review base, 3×, 7× and 10× attainment. Optional forecasts require documented assumptions and are always labeled administrator estimates. Revisions require a reason and preserve before/after policies in the audit trail. The screen shows the latest 20 audit entries and paginates targets at 20 per page.

## Evidence contract

- Gross cash: only LIVE-dataset PAYSTACK invoices with safe integer totalMinor, PAID status, paidAt at or before observation, matching processed INVOICE_PAID billing event (provider/reference/organization), sufficient recorded amountPaid, and a SIGNED contract in the same organization. Activation invoices use contractId; newly retained renewal snapshots use protected originContractId. Mutable metadata.originContractId is not qualifying evidence. Aggregation uses decimal sums and returns minor-unit strings. Cash uses the invoice total, not overpayment, net settlement or recognized revenue.
- Current MRR: active organization and subscription, unexpired currentPeriodEnd, active onboarding when present, integer commercialSnapshot.monthlyMinor and matching currency, plus qualifying paid proof for that subscription. Group once per organization so additional receipts do not multiply MRR. Catalog prices are never substituted. ARR is exactly 12 × current MRR; it is not annual collected cash or a forecast.
- Cash intervals include the chosen start and end calendar dates, with the end capped at observation time. MRR/ARR are current snapshots regardless of the selected cash period. Past recurring targets remain unavailable because immutable historical recurring snapshots do not yet exist. Future targets have no actuals yet.
- Currency selection is exact. No FX conversion or combined cross-currency total is provided.
- Campaign credit uses the persisted REGISTERED/ATTRIBUTED cohort. Unattributed qualifying cash remains in company totals. Campaign targets filter by that cohort. Agent/team targets can be planned but monetary actuals are unavailable until exclusive audited attribution exists.
- CRM leads are canonical records created in the chosen interval, grouped by their current stage/qualification. Meetings use startsAt; messages use providerAcceptedAt; runs, approvals and assistance use createdAt. Operational counts always cover all retained CRM records, even when API financials are campaign-filtered. They are not a cohort conversion funnel. Reply counts are correlated messages, not unique engaged people. Current delivery status can differ from historical status.
- Agent/message costs are configured micro-USD estimates, not accounting expenses. Unknown agent costs are counted explicitly. No costs are subtracted from another currency's revenue.

Zero means no qualifying evidence. It does not certify provider completeness. Legacy renewals lacking totalMinor/protected contract evidence are excluded, including older contract-based renewals with metadata-only links. No historical records are rewritten. Missing recurring snapshots are excluded. Refunds, provider fees, taxes, new/expansion/contraction/churned MRR, recognized revenue, bookings, actual monetary pipeline coverage, CAC, LTV, retention rates and profitability remain unavailable. A historical movement/recognition ledger and source reconciliation must precede those claims; never backfill them from today's prices.

## API and storage

All paths are under `/api/v1/sales/success/revenue` and are documented in generated OpenAPI:

- GET `/`: from/to ISO dates, currency, optional campaignId; financial evidence, operational groups, advisory growth readiness, limitations and unavailable metrics.
- GET `/targets?page=1`: bounded target list.
- POST `/targets`: UUID commandId, validated policy, reason. Retries with the same command/payload resolve to one target; changed payload with reused command returns conflict.
- GET `/targets/:targetId`: evaluated actuals, planning levels, forecast, limitations and latest audit history.
- PATCH `/targets/:targetId`: expected revision, full policy, reason; stale revision returns conflict.

SalesRevenueTarget is platform-owned, not organization-owned. Monetary policies use validated decimal integer strings (up to 15 digits), not floating amounts. requestedBy + commandId has a unique index. Updates and audit snapshots share a MongoDB transaction. Source billing records are read-only. Repository methods encapsulate target persistence; controllers only parse/call/respond.

## Security and rollout

The server requires platform administrator authority for every operation. Writes also require recent dual-channel assurance. Frontend development preview never enables API queries. Responses use no-store; client cache keys include principal/access state. SALES_ANALYTICS is OFF by default and is checked on every endpoint. Production switch activation and target creation require the command-deduplication index. Audit records identify reads and target mutations without storing secrets or provider credentials.

Owner actions, in an approved environment:

1. Run `npm --prefix apps/backend run sales:create-indexes` against the intended MongoDB replica set. This is additive; no historical finance mutation is performed. This run was not performed against an owner database during development.
2. Enable SALES_ANALYTICS in Super Admin settings after review. Leave unrelated services unchanged. The switch does not enable autonomous sending.
3. Enter real quotas, currency, periods, scope and documented forecast/coverage assumptions. The example KES 500,000 is not a configured quota.
4. Reconcile real Paystack/provider evidence and complete immutable renewal and historical movement sources before using this view as complete financial reporting. Existing provider keys remain in the established backend/Coolify secret configuration; this increment adds no new environment variable or credential.
5. Obtain separate staging/provider acceptance and production deployment authorization. A successful commit or build is not deployment approval.

## Validation

Unit tests cover exact large amounts, Nairobi month/quarter/year boundaries, missing/invalid scopes and forecasts, and malformed quota input. Replica-set/HTTP tests cover billing proof, currency and demo isolation, duplicate receipts vs MRR, invalid snapshots, registration attribution, concurrent command idempotency, revision conflicts/audit, unavailable history, authentication, platform authority, step-up, feature-off and validation failures. Contract renewal tests follow signed webhook settlement into the revenue projection, including catalog changes, replay, immutability, cross-organization/unsigned/missing evidence rejection and transactional audit rollback. Frontend tests cover money precision, disabled/preview access, retry states, unavailable actuals, escaped content and request contracts. The sales browser journey creates and revises a target through real HTTP and checks four widths in light/dark themes; completion reports record actual executed outcomes.
