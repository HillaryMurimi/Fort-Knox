# Property Command Center: pain-first sales runbook

## Prepare before the meeting

Research portfolio scale, property type, management model and the likely frustration. A large portfolio can still use Control; Fort Knox is a security capability decision.

Sign in with the existing SUPER_ADMIN MFA flow, or a seller account explicitly delegated organization-wide `sales.demo.manage`. Open **Sales demonstration** (`/sales-demo`). Select the primary pain and plan, choose a deterministic template, and enter the prospect/company display name. Units, property count, occupancy, voluntary rent roll, contact name and discovery context are optional. Do not enter tenant PII, identity numbers, bank details or credentials. Prepare the scenario. Use **Reset demo** before the meeting; reset restores only this prospect session and preserves sales evidence. **Prepare another prospect** clears previous prospect fields.

Templates: Control 40 units; Control 150 units; Control multi-property portfolio; Executive apartments; Fort Knox security-conscious property; Fort Knox multi-site portfolio. Custom scale supports 10–2,000 demonstration units and 1–20 properties. These are presentation scale bounds, not production plan limits.

## Discovery before opening the product

Ask enough to select one high-consequence problem:

- How many units do you manage, and across how many properties?
- How do you know how much rent is outstanding right now?
- How do maintenance requests reach management?
- How do you know a repair was actually completed?
- How many people must you call to understand what happened?
- How much of the operation runs through WhatsApp or spreadsheets?
- How do you track approvals, contractors and expenditure?
- How do you handle incidents when you are asleep or away?
- What frustrates you most about managing this portfolio?

Record useful context, select the pain, and state the question you will answer. Do not force every scenario into the meeting.

## Demonstrate a business outcome

Always follow **problem → quantify → investigate → understand → act → changed state → outcome → evidence**.

### Rent and arrears / Control

For the 150-unit benchmark: KES 2.8m expected, KES 2.3m collected, KES 500k outstanding, 17 overdue tenancies, 94% occupancy, six open repairs and two approvals. These are fictional scenario values, never a prospect's actual financial position.

Click **Outstanding**, investigate **A01**, and show the property/building/floor/unit/tenancy, due date, ledger, payment history and previous follow-up. Ask what they normally do to reconstruct this information. Use **Simulate payment**. Watch outstanding fall to KES 464,000 and overdue tenancies to 16. Show the reconciliation entry and DEMO receipt, changed attention queue and retained audit. Optionally create next rent due and advance the deterministic clock seven days.

### Maintenance and expense accountability

Select Maintenance or Expenses. The critical pump has a KES 18,000 quotation, identified requester, responsible caretaker, contractor and synthetic inspection evidence. Approve, start work, complete, retrieve after evidence and invoice/receipt, then verify completion. Costs, responsibility and history remain visible.

For a complete intake story, **Simulate tenant reporting a leak**, triage, assign, submit quotation, approve, start, complete, retrieve evidence, verify and close. The tenant service status changes throughout. Emphasize knowing whether work was done without calling the caretaker. Demo evidence consists of clearly labelled fictional records, not photos of a real property.

### Vacancy / staff / portfolio

Show B14's previous tenancy end, 37 vacant days, expected monthly rent and transparent rent × days / 30 exposure estimate. Assign viewing/readiness review; priority changes but occupancy is not promised. For staff, show the person, assignment, assigned time, deadline, overdue status, evidence and completion verification. Escalate or simulate verified completion. Portfolio visibility starts with the combined attention queue and follows the most consequential item to an outcome.

### Executive apartments

Ask: “You already have managers, accountants, guards, CCTV, WhatsApp and possibly property software — but do you have one command center showing what is happening across the asset?” Use the executive template and tenant-service storyline. Follow structured request → management → maintenance → approval → expenditure → evidence → service resolution. Demonstrate the command layer across existing people and systems; avoid suggesting their existing operation has no tools.

### Fort Knox

First establish Control's operational value. Select Security and **Simulate 02:14 AM security event**. Show property, Block B east gate, simulated camera source, duty supervisor, notification and associated evidence. Investigate, escalate, resolve, retrieve evidence and show history. Every telemetry/evidence item is labelled **DEMO / SIMULATED SECURITY EVENT**. No hardware session, live camera command or production security notification is invoked. Explain the ability to reconstruct the event and response from retained evidence the next morning.

## Close into guided activation

Say: “Everything you've just seen used demonstration data. Let's prepare one of your properties so you can experience this with your own operation.” Use **Start guided pilot**, **Prepare my property** or **Start with Control** after completing a business outcome. The owner signs up and verifies their existing account first. Enter that verified account email to prepare a private workspace. A demo reset never resets a real pilot.

The configured default is 14 days (`GUIDED_PILOT_DAYS`); SUPER_ADMIN may deliberately override a pilot to 1–60 days. The grant permits existing internal workflows and in-app operations. External operational SMS/email, rent payment providers and live camera access stay blocked until verified commercial activation. Account verification and agreement/invoice/checkout follow the existing security/commercial path.

Guide the owner through workspace, property, units, tenancies/opening balances, staff invitation, first real exposure, and first completed core workflow. Download the CSV template. Amounts are KES cents. Validate and review rows/errors/duplicates before confirming. Up to 500 units per batch; import only new properties and new tenant identities. Existing properties/accounts use controlled onboarding. No silent overwrite, inferred payment or deposit receipt occurs.

Readiness counts seven actual criteria, not account creation. A fully configured operation with a completed core workflow reaches the activation milestone. Review actual activity under **During your pilot**, then continue through the existing plan, signed agreement, invoice and provider-verified prepaid payment. A redirect or milestone alone never grants paid activation.

## Sales follow-through

SUPER_ADMIN opens `/sales-intelligence` for completed demo runs, pain/template/plan cohorts, offered/started pilots, operational milestones, commercial stages/blockers and verified paid conversion. Value moments are deduplicated by prospect. Paid conversion retains verified activation evidence; retention requires a paid invoice for a subsequent service period. Do not claim causation or invented ROI. Explore another scenario from the current demo to keep the same prospect and resume their existing pilot without extending expiry. Repeated demo resets remain visible in sales evidence, while live rent/MRR/ARR never includes simulated snapshots.

## One-time release setup

Use the existing deployment process, replica-set database, seeded system roles and active plans. Run `npm --prefix apps/backend run sales:create-indexes` once against the intended deployment. It adds required indexes without synchronizing or dropping existing indexes. Production mutations fail closed if required unique sales indexes are missing. Delegated sellers need an explicit `sales.demo.manage` permission; ordinary landlords do not receive it. No developer reseeding or database edits are needed for subsequent meetings.
