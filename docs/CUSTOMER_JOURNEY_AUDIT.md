# Customer journey audit - 2026-10-25

This is an audit of the existing Fort-Knox checkout, not a replacement funnel. The public demo uses fictional, labeled data. Subscription payment authority remains the signed Paystack webhook or server verification, followed by transactional activation. Operational rent rails are separate.

## Journey map

| Stage | Customer objective and action | Existing route / authority | Main friction or risk |
| --- | --- | --- | --- |
| Discover | Understand remote portfolio control; choose an entry point | `/`, public landing | Hero's primary action opens a request form instead of the available self-guided demo; plans are not prominent. |
| Explore | Inspect portfolio, rent, maintenance, people, and security examples | `/demo`, `/demo/explore`, `/demo/live` | Data is fictional and labeled; no production mutation is allowed. Demo-to-plans continuity needs clear navigation. |
| Compare | Choose Control or Fort Knox, units and prepaid term | `/plans`, server `/acquisition/plans` | The plans page was corrected in the preceding Plans audit. Its quote remains illustrative until contract generation. |
| Register | Create owner and organization with minimal information | `/signup`, auth bootstrap | Selected quote is not freshly checked before account creation; password is not revealable; back navigation loses the plan context. Duplicate-account recovery depends on signing in. |
| Verify | Prove owner email before commercial commands | Account email OTP | Email sender configuration is an external launch gate. Interruption can resume through sign-in. |
| Configure | Supply legal identity and portfolio count | `/onboarding`, owner-scoped `configure` | Legal fields are required for the agreement. Re-entering unit count is necessary only if the saved acquisition selection changed. |
| Price and commit | Review exact plan, term, included/extra units and initial/later obligations | Owner-scoped quote, `generate` | The plan step shows limited quote detail and the full cost mostly in an aside. Contract generation locks commercial terms. |
| Contract and invoice | Read agreement and issued invoice, sign with authority | Immutable contract/PDF/invoice, signature hash | A published reviewed template and document switch are prerequisites; no legal step may be skipped. |
| Pay and verify | Open Paystack, recover interrupted checkout, receive receipt | Saved checkout reference, signed webhook/server reconcile | A browser redirect never proves payment. Live merchant and renewal acceptance are outstanding. M-Pesa is an operational rent rail, not an advertised platform-subscription method. |
| Activate | Gain organization access after verified payment | Backend transaction, entitlement checks | Backend authorization and verified settlement are the authority. |
| First property | Create hierarchy and units, optionally people, see real saved facts | `/get-started`, property setup/import, dashboard | Existing five-stage wizard saves drafts; capacity follows signed units. Live deployment smoke and first-value measurement remain to be validated. |
| Operate | Return to dashboard and complete first meaningful action | `/dashboard`, `FirstPortfolio`, first dashboard marker | First dashboard visit is a proxy for value, not proof of comprehension. |

## Friction findings

| Priority | Location / root cause | Customer impact | Correction and acceptance |
| --- | --- | --- | --- |
| HIGH | Landing hero/nav: direct self-guided demo and plans links are not primary | Visitors may abandon at a contact form before seeing value or price | Expose demo and pricing entry points without removing optional assisted sales. Verify links on mobile and desktop. |
| HIGH | Signup: no current server quote check for selected plan | Account can be created for an unpriceable tier and stall at contract | Show current selected quote and block new commercial signup when unavailable; retain email verification for already-created accounts. |
| HIGH | Onboarding plan step: insufficient visible quote breakdown | Purchaser may not understand due-now vs later cost before generation | Show included/extra units, base/extra rates, due-now and later cycle from the owner-scoped server quote. |
| MEDIUM | Signup back link drops plan/units/months/source | Repeated choices | Carry the existing non-sensitive context back to `/plans`. |
| MEDIUM | Signup passwords cannot be revealed and validation appears only on submit | Mistyped passwords and avoidable retries | Accessible visibility controls, length guidance, and inline mismatch feedback. |
| MEDIUM | Existing plan quote loads as text or silently in summary | Delay feels uncertain | Explicit quote loading/empty/error states. |
| LOW | Optional demo-request CTA wording can imply a call is required | Sales-assisted path overshadows self-service | Keep it clearly optional. |

## Existing controls and external dependencies

Backend owner authorization, organization scope, reviewed contract hash, signed invoice, provider verification, capacity, and first-value facts already exist. Super Admin acquisition funnel joins anonymous milestones with verified account/payment/setup evidence; public events contain no contact or payment data. This audit does not claim live conversion rates or payment acceptance.

Before the first paying customer: approve catalog and contract terms, configure transactional email and Paystack in Coolify, run index migrations and workers, and execute a real staging checkout/renewal and post-deploy mobile journey. See `SELF_SERVICE_LANDLORD_ONBOARDING.md`.
