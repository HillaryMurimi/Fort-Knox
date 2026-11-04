# M1 - Onboarding assistance completion report

Date: 2026-11-04 (Africa/Nairobi). Publication verification timestamp appears below.

## Delivery status

Implementation commit: `b7449c68dbd8db7fd851fa44c10c78ddb8ae0731`.

Remote `origin/main` was verified at that exact commit with `git ls-remote origin refs/heads/main` after a normal push. Remote changes were fetched before committing; local and remote main had no divergence. No force push or branch-protection bypass was used.

Local implementation and quality checks: PASS. Hosted Quality run [41800572958](https://github.com/HillaryMurimi/Fort-Knox/actions/runs/41800572958) passed all three jobs on this exact implementation commit: backend, frontend and coolify-images. This includes the full backend E2E run, frontend browser journeys, static release certification, and synthetic image/API/web/worker checks. Deployed Coolify staging: NOT VERIFIED. No production deployment was authorized or initiated.

The preceding autonomous-email fallback correction was also delivered as `44b7347fa79f23c8a49c12732b0cff4dbd86c2db`; its hosted Quality run 41796985650 passed. M1 builds on that existing six-agent execution and approval infrastructure.

## Delivered user journeys

1. An authorized operator queues an Onboarding Success recommendation against a linked customer. The existing worker reads actual onboarding evidence and produces a proposal.
2. A Super Admin with fresh dual-channel assurance reviews the exact guidance. Approval opens one explicitly internal onboarding request and records its source approval, organization, assignee, guidance and audit. CRM Intelligence assistance proposals use the same reviewed execution path.
3. Customer 360 shows internal recommendations separately from customer-originated requests, with pagination, loading, empty, error and retry states. Model text is rendered as escaped text.
4. A Super Admin assigns an active representative with the required customer scope and permissions. Assigned authorized staff can schedule, start, complete or cancel work. Completion requires a recorded outcome. Stale revisions and invalid transitions are rejected.
5. Existing follow-up signals observe request changes. Completed/cancelled assistance no longer satisfies unresolved-assistance source rules.

An internal handoff does not establish customer consent, prove contact occurred, send a message, book an external calendar event, complete inventory setup, verify payment or activate a subscription. These operations retain their existing independent workflows.

## Implementation and interfaces

Reused PropertyOnboardingRequest, SalesAgentRun, SalesAgentApproval, SalesActivity, AuditLog and the existing MongoDB transaction/follow-up infrastructure. No new collection, vendor adapter or worker queue was introduced. Approval and request creation commit atomically.

Backend APIs under `/api/v1`:

- Existing `POST /sales/success/approvals/:approvalId/decisions` executes approved ASSISTANCE_PROPOSAL guidance.
- `GET /sales/success/customers/:id/assistance`: current linked-organization requests, 20 per page, bounded page number, total count.
- `POST /sales/success/customers/:id/assistance/:requestId/controls`: revision, action, reason, and action-specific assignee or schedule. Shared Zod schemas feed OpenAPI.

Frontend: `/sales-success`, Customer 360 onboarding-assistance section; AI Agent Control explains approval effects; the permission-delegation form includes `sales.assistance.manage`. Layout and controls use the existing responsive UI system. React review covered hook ordering, permission-aware query keys, accessible labels, conditional controls, and escaped model text. Dedicated interactive browser verification of this new section was not run locally; component tests and production build passed.

## Data and migration

PropertyOnboardingRequest gains additive source, leadId, approvalId, assignedTo, guidance, outcome, revision and completedAt fields. Existing requests remain customer requests. Missing historical revision fields are accepted as revision zero for the first controlled update.

Partial unique index `sales_assistance_approval_unique` applies only to ObjectId approval references. It prevents duplicate internal requests. The existing additive `sales:create-indexes` command installs it without dropping existing indexes. No live migration or backfill was performed.

SalesAgentRun records `contextOrganizationId` during generation. A proposal cannot open assistance after its customer has been linked to another organization. Historical proposals without this snapshot must be regenerated. Guidance is retained as internal support evidence; no new automatic deletion rule is introduced by this milestone.

## Authorization and operating controls

- Read requires current assigned-customer scope plus `sales.onboarding.read` and `sales.notes.read`.
- Staff mutation additionally requires `sales.assistance.manage` and ownership of the case. Super Admin retains audited platform authority.
- Assignment requires fresh dual-channel Super Admin assurance. The target must be active and authorized for the same customer with all constituent permissions.
- Execution checks the current task owner's authority, origin agent/runtime controls, exact approval hash, expiry, observed organization and the separate `SALES_ASSISTANCE` switch.
- `SALES_ASSISTANCE` remains OFF by default. Production enablement checks the unique index. It gates request creation and lifecycle mutations; existing history remains readable.
- Terminal cases cannot reopen; completion cannot bypass financial or organization authorization.
- Authentication OTP, rent/payment verification and tenant RBAC/ABAC were not changed.

## Verification evidence

| Command / check | Actual result |
| --- | --- |
| Root `npm run typecheck` | PASS, including a final rerun after fixture changes |
| Root `npm run lint` | PASS; existing warnings retained, zero errors |
| Root `npm test` | PASS: 566 backend tests, 335 frontend tests; default backend command skipped 363 E2E cases |
| `RUN_E2E=1 npx vitest run tests/e2e/sales-assistance.e2e.test.ts` | PASS: 6 cases |
| Combined agent/assistance/follow-up E2E run | Assistance 6 and follow-up 34 passed; one agent fixture initially failed because it lacked the newly required linked organization and switch |
| `RUN_E2E=1 npx vitest run tests/e2e/sales-agent.e2e.test.ts` after fixture correction | PASS: all 19 cases, including the new exactly-one-request assertion; 59 relevant E2E cases passed across the final suite results |
| `npx vitest run src/lib/data/sales-assistance.test.tsx src/lib/data/sales-agents.test.tsx` | PASS: 6 frontend cases |
| Root `npm run build` | PASS; repeated successfully against the final feature source |
| Hosted Quality run 41800572958 on b7449c6 | PASS: backend, frontend, coolify-images; no failed or skipped job steps |
| `git diff --check`, staged file review and targeted secret-pattern scan | PASS; no credentials, environment files, unrelated `.continue/` data or generated artifacts staged |

Security cases cover altered payload hashes, stale administrator assurance, disabled execution, organization-link changes, current customer scope, case ownership, cross-organization request IDs, stale revisions, invalid schedules/transitions and HTTP authentication/validation. Fixtures use an isolated MongoDB replica set and controlled model output; no real provider or recipient was contacted. Financial records are not modified by assistance; the E2E test asserts the organization record is unchanged by approval.

## Owner actions before controlled staging

1. Use the intended staging MongoDB configuration and run `npm --prefix apps/backend run sales:create-indexes` from the repository checkout, or `npm run sales:create-indexes` from the backend workspace. Do not point this command at production as part of this milestone.
2. Configure the existing model adapter in the shared Coolify API/worker secrets: `SALES_AI_API_KEY`, `SALES_AI_MODEL`, and reviewed input/output cost ceilings. M1 adds no environment variables or provider credentials. Existing credential requirements remain in AI_SALES_CONTINUATION.md.
3. Enable the required runtime, relevant agent, approvals and `SALES_ASSISTANCE` controls deliberately in staging. Configure the agent's budgets. These controls do not require sales SMS/WhatsApp or email delivery to be enabled.
4. Grant the three constituent staff permissions and assign the customer/case through the authorized Super Admin screens. Regenerate old assistance proposals so they carry the organization snapshot.
5. Verify the real browser approval-to-assignment-to-completion journey on Coolify, worker health, operational monitoring and the deployment's database/index permissions. Retain the separate provider/privacy and production-release acceptance gates.

## Remaining work and next milestone

M1's internal assistance workflow is implemented and locally verified. Real model acceptance, deployed staging behavior and production release are not certified here. The system does not automatically claim that a staff-recorded outcome proves customer onboarding completion.

Next is M2: authoritative CRM intelligence and business-performance reporting. It connects these assistance outcomes to existing agent runs, messages, meeting and verified commercial evidence, with observed facts clearly separated from model recommendations. M3-M8 remain the ordered milestones in CODEX_FEATURE_DELIVERY_POLICY.md; reassess existing functionality before implementing each. Production deployment requires separate authorization.

## File inventory

The exact implementation inventory is appended below from `git show --name-status b7449c6`. No implementation files were deleted.
Publication verification timestamp: 2026-11-04 11:36:30 +03:00 (Africa/Nairobi).

```text
M	AGENTS.md
M	apps/backend/scripts/create-sales-indexes.ts
M	apps/backend/src/database/models/PropertyOnboardingRequest.ts
M	apps/backend/src/database/models/SalesAgent.ts
M	apps/backend/src/modules/platform-control/platform-control.service.ts
M	apps/backend/src/modules/sales/sales-agent.openapi.ts
M	apps/backend/src/modules/sales/sales-agent.service.ts
A	apps/backend/src/modules/sales/sales-assistance.controller.ts
A	apps/backend/src/modules/sales/sales-assistance.schemas.ts
A	apps/backend/src/modules/sales/sales-assistance.service.ts
M	apps/backend/src/modules/sales/sales-feature.registry.ts
M	apps/backend/src/modules/sales/sales-success.schemas.ts
M	apps/backend/src/modules/sales/sales.routes.ts
M	apps/backend/tests/e2e/sales-agent.e2e.test.ts
A	apps/backend/tests/e2e/sales-assistance.e2e.test.ts
M	apps/frontend/src/components/sales/sales-agent-control.tsx
A	apps/frontend/src/components/sales/sales-customer-assistance.tsx
M	apps/frontend/src/components/sales/sales-success-workspace.tsx
A	apps/frontend/src/lib/data/sales-assistance.test.tsx
M	docs/AI_SALES_CONTINUATION.md
M	docs/API_SPECIFICATION.md
M	docs/ARCHITECTURE.md
M	docs/CODEX_EXECUTION_TRACKER.md
A	docs/CODEX_FEATURE_DELIVERY_POLICY.md
M	docs/DATABASE_DESIGN.md
M	docs/DEVELOPMENT_ROADMAP.md
M	docs/FEATURES.md
M	docs/ROLES_PERMISSIONS.md
M	docs/SECURITY.md
M	docs/TESTING_STRATEGY.md
```
