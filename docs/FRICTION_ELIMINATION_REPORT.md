# Friction elimination report - 2026-10-25

Scope: acquisition entry points, quote-to-signup handoff, and the pre-contract owner quote in the existing Dapinni journey. See `CUSTOMER_JOURNEY_AUDIT.md` for the full 20-stage map and severity table. No auth, payment, entitlement, or organization-scope rule was relaxed.

| Priority | Before | Implemented correction | Acceptance evidence |
| --- | --- | --- | --- |
| HIGH | Landing hero primarily requested contact before a visitor could try the product or find prices. | Hero and navigation now link directly to the fictional self-guided demo and `/plans`; assisted demo remains optional. | Browser handoff verifier checks both first-viewport links and navigation to plans at 390px/1440px. |
| HIGH | A deep-linked or stale selected plan could create an account despite the tier lacking a valid quote. | Signup forces a fresh public catalog check for selected units and term, displays the initial estimate, and disables new account creation while checking or when the tier is unavailable. Existing created-account verification can continue. | Browser verifier checks delayed revalidation and a cached-valid tier becoming unavailable. Backend still reprices when the contract is generated. |
| HIGH | The authenticated plan step gave only a sparse quote before locking the agreement. | The owner-scoped quote now shows included and additional units, base and extra rates, monthly equivalent, upfront total and later cycle; payment view repeats the later amount from the retained snapshot. | Frontend typecheck/build, focused tests and the complete isolated self-service browser journey pass. |
| MEDIUM | Back navigation from signup lost the chosen plan, units, term and source. | The comparison link retains the non-sensitive context. | URL round-trip unit assertion and browser link assertion pass. |
| MEDIUM | Password typing was hard to verify and length guidance came only after failure. | Separate accessible reveal controls, visible length guidance, and inline mismatch feedback. | Browser verifier confirms reveal control and retained form behavior. |
| MEDIUM | The owner could not edit saved legal/portfolio details from the plan step without a confusing detour. | An explicit edit action reuses the existing authorized configuration form before contract generation. | Existing backend configuration/revision rules remain in force; full self-service browser path passes. |

## Not removed or bypassed

Email verification, owner authority, contract review and signature, invoice issuance, provider checkout reservation, signed Paystack/server verification, transactional activation and paid portfolio capacity remain mandatory. A checkout redirect or client-displayed total never activates an organization. The public demo remains fictional and isolated from live operations.

## Remaining friction and dependencies

- Social sign-in follows its existing `/welcome` flow and does not yet carry the selected public plan/portfolio quote or acquisition attribution through the provider redirect. It remains an alternative account route, not a certified one-pass paid conversion. Preserve account linking and OTP controls in any follow-up.
- The Super Admin acquisition funnel already records privacy-minimized public milestones and trusted account/payment/setup evidence. It does not prove customer comprehension, and there is no live conversion baseline yet.
- No live Paystack debit, settlement, recurring authorization, sender-domain receipt, or hosted Coolify smoke test was performed. These are launch gates, not UI polish.
- M-Pesa is available for operational rent collection under configured settlement rules; platform-subscription checkout remains Paystack. The page does not imply otherwise.
- The existing dev-only `next-env.d.ts` regeneration from the isolated browser fixture was restored; no generated output is included in the change.

No database schema, API endpoint, package, or provider behavior changed in this slice. The frontend quote type now describes fields the existing backend already returns.

The Plans terms list also now keys rows by stable term identifiers. Two terms with identical wording previously caused a React duplicate-key warning; the browser verifier now rejects that warning.
