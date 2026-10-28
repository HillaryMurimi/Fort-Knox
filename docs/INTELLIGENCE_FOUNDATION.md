# Real Estate Intelligence Foundation

Status: foundation only, 2026-10-27. No new intelligence calculation, collection, API, payment flow, migration or deployment is certified by this document. The nine module controls are registered OFF and cannot be turned ON yet.

## Architecture Audit And Capability Inventory

| Capability | Status | Existing authority and foundation gap |
| --- | --- | --- |
| Organization/property/building/floor/unit/tenancy | IMPLEMENTED | Scoped models and RBAC/ABAC exist. Historical occupancy intervals and property changes need period validation before analytics. |
| Rent charges, payments, allocations and reversals | PARTIAL | Transactional confirmation/reversal, audit, event jobs and integer minor-unit fields exist for new writes. Historical major-unit data, refunds and adjustments need reconciled cutover. |
| Provider verification and settlement | EXTERNALLY_BLOCKED | M-Pesa landlord-shortcode STK is credential-bound; Paystack rent initiation is blocked. Signed legacy callbacks do not establish bank settlement. |
| Expense/profitability data | REQUIRES_REFACTOR | Expense categories and approval states exist, but capex, debt service, accrual periods and authoritative minor-unit expense values do not. Current `finance.report` is not certified NOI or cash flow. |
| Maintenance/assets | PARTIAL | Request workflow and inventory exist. Asset lifetime, replacement cost and complete repair history are not reliable forecast inputs yet. |
| Occupancy/retention | PARTIAL | The existing Command Center now derives a current tenancy-based occupancy count and reports conflicts, but period-overlap occupancy, turnover cohorts and vacancy loss are not authoritative derived series. The occupancy intelligence switch remains blocked. |
| Forecasting/analytics | REQUIRES_REFACTOR | Property Health snapshots, vacancy/revenue-risk forecasts, observations and decision automation already exist. They use separate major-unit arithmetic and do not implement the requested five-year financial model or shared provenance contract. |
| Subscription entitlement | IMPLEMENTED | `EntitlementService` reads active plan/pilot features. The nine proposed module-specific entitlement keys are not yet in published plans. |
| SUPER_ADMIN feature controls | PARTIAL | Persistent `PlatformSwitch`, MFA-protected platform admin routes, transactional audit and monitoring exist. Existing decision-intelligence/automation switches are not enforced at every service/worker boundary. New module controls remain activation-blocked. |
| Jobs, notifications, audit | PARTIAL | Durable `Job`, payment outbox/projection, notifications and audit exist. New intelligence calculations have no idempotent job handlers, snapshots or invalidation rules. |
| Data quality | MISSING | No common, source-linked financial quality assessment or certified freshness gate covers all requested metrics. Do not substitute zero for missing evidence. |
| Multi-currency finance | EXTERNALLY_BLOCKED | Organization locale/time zone is configurable, but operational finance writes are KES-gated. Historical fields and reports are not fully minor-unit/currency migrated; no FX authority exists. |

`IMPLEMENTED` describes a reusable existing boundary, not a complete intelligence module. `PARTIAL` requires missing evidence or workflow. `REQUIRES_REFACTOR` means its current output is unsafe to treat as the requested metric. `EXTERNALLY_BLOCKED` needs provider, legal or migration evidence. No newly identified issue is silently classified as production-ready.

## Shared Financial Domain

All formulas apply to one organization, explicit authorized property set, currency, IANA time zone and reporting interval `[start, end)`. Store monetary intermediates as safe integer minor units; reject unsupported currency precision and mixed currencies. Do not use the existing major-unit `Number` report as the authoritative implementation of these definitions. Historical corrections require auditable reversals/adjustments, never record rewriting.

| Metric | Definition and assumptions |
| --- | --- |
| Gross potential rental income | Sum of applicable unit asking/scheduled rent for every rentable unit-day in period, normalized to the report interval. Exclude inactive/non-rentable unit-days. Asking rent is not an executed lease. |
| Scheduled rental income | Sum of contract rent for active tenancy-days plus applicable vacant-unit asking rent only when a schedule explicitly exists. Distinguish from billed charges. |
| Rent billed | Sum of non-void rent-charge rent components whose service period intersects the report period, with a documented proration policy. Service charges are separately labeled. |
| Provider-confirmed collections | Confirmed payment allocations backed by independently verified provider status and matching amount/currency, net of ledger reversals; not bank-settled by implication. |
| Manually acknowledged collections | Allocations confirmed by an authorized operator with audit evidence, net of reversals. They are not provider-verified. |
| Reconciled collections | Collections matched to independent bank/provider settlement evidence with a unique transaction identity; presently unavailable as a certified metric. |
| Outstanding receivables | Non-void billed amounts less valid allocations and adjustments as of the cutoff. Avoid counting both payment headers and allocations. |
| Overdue receivables | Outstanding receivables from charges past due at the cutoff, using organization time zone and documented grace policy. |
| Vacancy loss | Gross potential income for eligible vacant unit-days minus actual scheduled rent for those days; never both unit-level and tenancy-level rent for the same day. |
| Collection loss | Billed receivables that are written off through an explicit adjustment; unpaid balances remain receivables, not realized loss. |
| Operating expenses | Approved/incurred property operating costs attributable to the service period, excluding capex, debt principal and financing interest. Paid expense cash is a separate view. |
| Net operating income | Accrual property revenue minus operating expenses; before financing, income tax, depreciation and capex. Do not derive this from cash collections alone. |
| Capital expenditure | Approved capitalized asset acquisition/improvement costs under an explicit classification and capitalization policy; currently not reliably classified. |
| Debt service | Principal plus interest due/paid under financing agreements; no authoritative source is implemented. |
| Cash flow | Reconciled cash inflow minus cash operating outflow, capex and debt service, with opening/closing balance and timing policy. Not the same as NOI. |
| Occupancy rate | Occupied eligible unit-days / total eligible unit-days in period; define occupancy from non-overlapping effective tenancy intervals, not a point-in-time unit status. |
| Collection efficiency | Provider-confirmed plus manually acknowledged allocated collections / collectible rent billed for the same cohort, with source categories shown separately. Reconciled efficiency requires independent matching. |
| Tenant turnover | Completed move-outs / average occupied units in period, with denominator and partial-period policy disclosed. |
| Property yield | Annualized NOI / investment basis; state acquisition/current basis and valuation date. Unavailable without a sourced basis. |
| Capitalization rate | Annualized stabilized NOI / independently sourced property value; never substitute listing/asking price silently. |
| Investment return | Explicitly defined period return on invested equity, including cash flow and value change; disclose financing, transaction costs and unrealized assumptions. |

Existing `finance.report` sums payment headers in major units and exposes `providerConfirmed`, `manualAcknowledged` and `legacyUnclassified`; these are provenance labels, not independent settlement proof. Existing legacy totals may contain reversals or unmatched historical records. No cross-currency portfolio total is valid without dated, sourced FX rates and a conversion policy.

## Evidence And Calculation Contract

- Every derived output must carry `organizationId`, authorized property scope, source IDs/types, source cutoff, calculation/model version, currency, time zone, interval, generated timestamp, completeness/quality findings and cache invalidation basis. A snapshot without these is legacy/unverified for this platform.
- `ACTUAL` means observed source history; `VERIFIED` means independently authenticated source evidence; `MANUALLY_ACKNOWLEDGED` means authorized operator confirmation; `ESTIMATED` means incomplete-input calculation; `FORECAST` means a future model projection; `SCENARIO` means hypothetical user-selected assumptions. A numeric result may need both an observation class and an evidence status. Never promote a class by presentation logic.
- Keep source IDs and generation version stable across retries. Recompute after payment confirmation/reversal, charge adjustment, expense approval/void, tenancy activation/move-out or property scope change. Use durable deduplicated jobs and bounded snapshots only when a specific module demonstrates the need. Existing `Job`, `AuditService` and domain events are the reuse points.
- Missing evidence yields an explicit unavailable/partial result and actionable quality issue, not zero, a fabricated forecast or a silent currency conversion. Define retention and immutable historical snapshots before persisting new outputs.

## Nine Module Integration Contracts

The registry keys are **release controls**, not permissions. All start OFF, cannot be activated through the API, and lack entitlement grants. Each future module must combine authenticated organization membership, scoped resource permission, a global switch, published plan entitlement, organization opt-in/configuration, environment policy, dependency readiness and data quality. Platform-admin switch access does not grant access to landlord financial rows. No module-specific API or collection is created in this foundation.

| Module / switch | Inputs and output boundary | Owner, intended tier, dependency, audit/retention |
| --- | --- | --- |
| Universal Rent Ledger / `INTELLIGENCE_RENT_LEDGER` | Rent charges, allocations, payment evidence, adjustments -> sourced receivables/collection series. | Finance; Control+Fort Knox; no module dependency. Scope via rent/payment/report permissions. Audit report export and corrections; retain ledger history. |
| Profitability / `INTELLIGENCE_PROFITABILITY` | Ledger, classified expenses, capex policy -> revenue, OPEX and NOI by property/currency. | Finance; Control+Fort Knox; rent ledger. Financial report permission, audited exports; retain calculation versions and classification changes. |
| Occupancy / `INTELLIGENCE_OCCUPANCY` | Unit eligibility, effective tenancy periods, move-outs -> unit-day occupancy, vacancies, turnover. | Tenancy/portfolio; Control+Fort Knox; no module dependency. Property scope; audit exports; retain effective-date evidence. |
| Five-year Forecasting / `INTELLIGENCE_FORECASTING` | Sourced rent, profitability, occupancy, dated assumptions -> horizon forecast and scenario bands. | Intelligence; Fort Knox; ledger+profitability+occupancy. Audit assumption/version changes; preserve generated scenarios with expiry policy. |
| Predictive Maintenance / `INTELLIGENCE_MAINTENANCE` | Assets, maintenance events, costs and condition evidence -> risk estimates, not automatic work orders. | Maintenance/intelligence; Fort Knox. Property/asset scope; audit model and recommendation review; retain work evidence. |
| Valuation / `INTELLIGENCE_VALUATION` | NOI, occupancy, sourced investment basis/comparables and cap rate -> assumption-labeled value/yield. | Investment intelligence; Fort Knox; profitability+occupancy. Audit assumptions/export; do not imply certified appraisal. |
| Financial Anomalies / `INTELLIGENCE_ANOMALIES` | Reconciled ledger and classified expense series -> source-linked review candidates. | Finance/intelligence; Fort Knox; ledger+profitability. Audit acknowledge/dismiss; never post payments or adjustments automatically. |
| Morning Brief / `INTELLIGENCE_MORNING_BRIEF` | Existing authorized finance/occupancy/operations outputs -> cited, time-stamped brief. | Intelligence/notifications; Fort Knox; ledger+profitability+occupancy. Do not independently recompute; audit generation/access; respect notification preference and source retention. |
| Digital Twin / `INTELLIGENCE_DIGITAL_TWIN` | Forecast, profitability, occupancy, valuation outputs -> portfolio scenarios with uncertainty. | Investment intelligence; Fort Knox; forecasting+profitability+occupancy+valuation. Scope every source property; audit scenario assumptions/export and retain versions. |

The proposed `intelligence.*` entitlements in the registry are **not added to subscription plans** in this phase. Control/Fort Knox eligibility is a design target, not an effective grant. Existing broad `finance`, `decision-intelligence`, `predictive-intelligence` and `advanced-reporting` features remain unchanged. Each specialization must publish and validate its exact entitlement before activation. No new organization configuration is persisted yet; define an authorized, audited config contract with the first real module rather than placing unvalidated flags in `Organization.settings`.

Phase 5 preparation adds a pure user-input KES monthly scenario calculator under the existing decision-automation module. It is not a sourced forecast or customer API, does not supply NOI/cash flow, and does not alter the `INTELLIGENCE_FORECASTING` activation block or plan grants. Its explicit occupancy, collection and annual rent-change assumptions are illustrative, not predictions.

Phase 6 preparation adds an optional validated `assetId` on new maintenance requests and replaces unit-wide inventory "history" with explicitly linked, bounded records. Historical unlinked requests are deliberately omitted; no repeated-failure or predictive-risk statistic can claim complete coverage from this history. The `INTELLIGENCE_MAINTENANCE` switch remains OFF and activation-blocked, without an entitlement, model, score or recommendation API.

Phase 7 preparation adds pure KES investment-scenario calculations beside the Phase 5 scenario kernel. Income capitalization requires owner-supplied annual stabilized NOI and a cap rate with named sources, and returns null for non-positive NOI. Sensitivity varies only the supplied cap rate. An unlevered DCF takes one to five explicit annual unlevered cash flows, a discount rate labeled `UNLEVERED_PROPERTY`, and final-year net terminal proceeds; it does not accept the Phase 5 collection illustration as cash flow. Selected ratios and equity use explicit value basis, optional annual inputs, ownership share and separately attributed secured debt. Zero denominators or missing inputs yield null. All results are `USER_DEFINED_SCENARIO` / `ILLUSTRATIVE_NOT_SOURCE_BACKED`, integer KES minor units, deterministic and not appraisals. No live valuation, market comparable, financing, property ownership, plan entitlement, switch activation, customer API or screen is introduced.

Phase 8 preparation adds a pure, bounded `PAYMENT_INTEGRITY_V1` review function in the existing finance module. A trusted caller must supply one payment and a complete allocation snapshot with resolved charge scope; the function does not read the database. It distinguishes confirmed amount/scope/repeated-charge inconsistencies from missing minor-unit or charge evidence and a processed-refund operational exception. Reversed payments may retain allocation history without being flagged. Stable rule IDs support eventual deduplication, and potential exposure takes the maximum per payment rather than adding overlapping findings. Exposure is not realized loss. This function is not wired to an API, worker, investigation case or dashboard; it does not replace ledger invariants, provider verification or reconciliation. `INTELLIGENCE_ANOMALIES` remains OFF and activation-blocked with no published entitlement.

## Data Quality And Promotion Gates

Before any module turns ON, detect and surface missing lease dates/rent, unit asking rent versus tenancy rent disagreement, duplicate provider identities, confirmed but unallocated payments, overlapping/invalid occupancy intervals, unclassified expenses, charge/allocation/balance contradictions, stale snapshot cutoff or model version, and assumptions outside supported bounds. Distinguish blocking integrity errors from coverage warnings; never treat incomplete data as verified. Tests must include same-organization property scope, cross-organization denial, plan denial, switch OFF/MAINTENANCE, missing dependency, unsupported environment/currency, audit rollback, stale source and retry/idempotency. Existing financial and provider regression suites stay intact.

## Coolify And Implementation Order

Catalog entries persist through the existing Mongo-backed `PlatformSwitch` and `ensureCatalog` upsert; no new variables, collections, indexes, migrations or Compose services are required. Existing API/worker behavior is unchanged, and no live provider is contacted. This change does not certify Coolify deployment. Recommended order: (1) finance source inventory and historical minor-unit/settlement migration plan; (2) ledger and data-quality contract; (3) expenses/capex and occupancy periods; (4) profitability; (5) forecast/scenario; (6) maintenance and valuation; (7) anomalies; (8) brief; (9) twin. Each module needs its own backend gate, exact entitlement, organization setting, tests, source provenance and staged acceptance before its switch can be made activatable.
