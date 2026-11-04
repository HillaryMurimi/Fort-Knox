# Feature delivery policy

For each completed feature: run tests, review changes, commit, safely integrate into remote main, verify the remote commit, and write a completion report. Never force push or bypass branch protections. Never commit unfinished or unrelated changes. Production deployment requires separate approval.

## Delivery checklist
1. Inspect current branch, Git status, existing implementation, and execution tracker. Finish the current feature first.
2. Define acceptance criteria, review security and tenant isolation, and implement using existing architecture.
3. Run typecheck, lint, relevant tests, security checks, and production builds. Record exact results and skipped checks.
4. Review the diff for secrets, unrelated files, and unfinished concurrent changes. Stage only the completed feature.
5. Update relevant technical documentation and prepare the completion report.
6. Commit with a descriptive message. Fetch remote changes, respect branch protection, and safely integrate into main. Never force-push.
7. Verify the commit is present on remote main. If blocked, retain work and report the blocker.
8. Record final commit SHA, verification evidence, and next milestone in the execution tracker.

## Completion report
Write `docs/completion-reports/YYYY-MM-DD-feature-name.md` for every delivered feature. Include: milestone, Africa/Nairobi timestamp, executive summary, functioning user journeys, how it was implemented, backend APIs, frontend screens, data/index/migration changes, permissions and AI approval limits, test commands and results, added/modified/deleted files, commit SHA, verified remote-main status, local/staging/production status, remaining limitations, owner actions, and next milestone. Never claim live provider functionality or production readiness without evidence. A push does not authorize deployment.

## Milestones
M1 onboarding assistance; M2 CRM intelligence; M3 AI Sales Supervisor and stage-aware recovery; M4 lead-to-payment-to-onboarding verification; M5 integration and security verification; M6 Coolify staging readiness; M7 Product Improvement Center; M8 Product Improvement Intelligence Agent. Reassess against actual repository progress before each milestone.

## Scope and safety
This policy records the owner's instruction to commit and push **completed, verified features**. It does not authorize committing unrelated or unfinished changes, bypassing branch protections, or overriding the existing safeguards in AGENTS.md. Do not interrupt active Codex work. If tests or integration fail, mark BLOCKED rather than COMPLETE.
