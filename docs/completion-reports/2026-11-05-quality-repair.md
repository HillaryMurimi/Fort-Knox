# Hosted Quality repair for the M2 Revenue delivery

Milestone: M2 verification repair. Started 2026-11-05, Africa/Nairobi. This report remains in verification until exact-commit hosted results are recorded below.

## Root causes and before/after evidence

Failed implementation: `ba24a72de8a180a1349e95b5df5f3adfdaa76eed`, [Quality 41891248174](https://github.com/HillaryMurimi/Fort-Knox/actions/runs/41891248174). Frontend failed Revenue workspace fits 390; backend passed 379/380 E2E cases but failed the immediate autonomous email dispatch assertion. The synthetic Coolify-image job passed.

**Responsive layout:** target selector buttons inherited `shrink-0` without a maximum width; target pagination could not wrap. Windows font metrics concealed the page overflow. Replaying the authenticated journey's Revenue DOM and styles in headless Linux Chrome 157 with the DejaVu Sans fallback reproduced a target button at x=33 with width=362.765625 and right=395.765625 in a 390px viewport; document scrollWidth was 396. The overflow remained after transitions settled. Applying the same wrapping/maximum-width rules as the patch reduced document scrollWidth to 375 (the remaining 15px is the Linux scrollbar). This was a rendering reproduction, not a Linux full-stack acceptance claim. The final hosted Ubuntu/Node 22/Google Chrome job supplies that acceptance. No assertion threshold was relaxed and no overflow was hidden.

**Autonomous email fixture:** the hosted failure occurred around 2026-11-04 18:57 UTC / 21:57 Nairobi. The test used wall-clock time despite explicitly consenting the recipient in Africa/Nairobi. At that fixed timestamp the unchanged delivery service returned a queued message with attempt=0 and nextAttemptAt=2026-11-05T05:00:00Z (08:00 Nairobi). The original expectation reproduced one failure out of seven cases. Queue eligibility, active/approved campaign hash, current qualification/template, origin actor and agent switches, exact payload, channel consent and recipient suppression all passed. The scheduling guard deferred before provider pacing, spending reservations and transport. This was neither a missing await nor a provider failure. The fixed weekday fixture and two real-policy scheduling regressions pass nine cases, including no dispatch/spending before the window and exactly one attempt after it opens, even on replay.

**Additional local browser synchronization:** the required platform journey repeatedly timed out at the Support & Diagnostics sidebar destination after query-only navigation. A diagnostic snapshot contained exactly one Integration health heading with a 478x24 rectangle at y=1064. This did not establish a production routing defect. The journey now waits for the destination heading to have layout, then runs the original accessible-heading visibility assertion. No synthetic navigation event, scrolling workaround, authorization change or platform application change is included. The complete journey passed with this synchronization.

## Implementation and user journeys

Revenue target labels wrap within their panel, and pagination adapts to narrow screens. The real browser journey still authenticates with MFA, creates and revises a quota through HTTP, preserves exact money and unavailable historical evidence states, and exercises existing sales/pilot/consent/follow-up journeys. Revenue now checks 320/390/834/1440px in both themes, including button containment. No auth, consent, approval, spending, suppression, provider, worker or financial production logic changed.

Created: this completion report.

Modified:
- `apps/backend/tests/e2e/sales-autonomous-email.e2e.test.ts`
- `apps/frontend/src/components/sales/sales-revenue.tsx`
- `apps/frontend/scripts/verify-sales-demo.mjs`
- `apps/frontend/scripts/verify-platform-business.mjs`
- `docs/TESTING_STRATEGY.md`
- `docs/CODEX_EXECUTION_TRACKER.md`

Deleted: none. No API, database, index, dependency, environment-secret or migration changes. Generated next-env paths are excluded from the commit, as are temporary diagnostics and the unrelated `.continue/` directory.

## Validation and publication

Completed local checks (synthetic/isolated data only):

| Command | Result |
| --- | --- |
| `npm run typecheck` | Backend and frontend passed |
| `npm run lint` | Passed; existing 725 backend / 27 frontend warnings, zero errors |
| `npm test` | Backend 577 passed / 375 E2E cases skipped by default; frontend 341 passed |
| `npm --prefix apps/backend run test:e2e` | All 382 tests across 20 files passed, 369.66s; includes the cases skipped by the default run |
| Focused autonomous-email replica-set suite (`RUN_E2E=1`) | 9 passed; original immediate-dispatch expectation reproduced a failure at the hosted evening timestamp before the fixture fix |
| `npm --prefix apps/frontend run verify:sales-demo` | Passed full real-HTTP journeys, zero runtime errors / sales sends; added Revenue widths and containment checks passed; mobile light/dark screenshots inspected |
| `npm --prefix apps/frontend run verify:status-system` | 66 unit cases and 12 computed-contrast/responsive/reduced-motion browser cases passed |
| `npm --prefix apps/frontend run verify:platform-business` | Passed real-HTTP authentication, bypass denial, all sidebar destinations, malformed configuration recovery, organization drill-down and desktop/mobile journeys |
| `npm run certify:release` | CERTIFIED_STATIC: 39 route files, 172 permissions and 10 critical paths |
| `npm run build` | Backend TypeScript and frontend Next.js production builds passed |

Implementation SHA, remote-main verification and exact-commit hosted job links are still pending. No pending job is considered successful. Local browser journeys use installed Windows Google Chrome; separate Linux Chrome rendering reproduction above establishes the font-dependent failure and correction. Hosted acceptance remains necessary.

## Deployment, risks and owner actions

No staging/production deployment, live outbound enablement, owner-database mutation or external email send was performed. No new credentials or manual setup are required for this repair. Synthetic acceptance does not establish live-provider or operational readiness. The existing M2 analytics rollout/index and provider-reconciliation actions still apply.

After the complete hosted workflow is green, continue M2 immutable renewal/MRR movement evidence, completeness and retained-customer cohort foundations per AI_REVENUE_GROWTH_ROADMAP.md and SALES_REVENUE_INTELLIGENCE.md. This repair protects the first M2 dashboard delivery; it does not complete the remaining revenue milestone.
