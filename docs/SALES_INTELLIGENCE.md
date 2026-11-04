# Sales Intelligence — curated research

The existing six sales agents read bounded, agent-specific, advisory research from `apps/backend/src/modules/sales/sales-intelligence.catalog.ts` through `agentInstructions`. This does not replace the model provider, permissions, consent, audit, approval or execution gates.

## Research lifecycle
- RESEARCHED: sourced creator advice; not independently proven.
- APPROVED_FOR_TEST: requires an explicit reviewed change and bounded experiment approval.
- VALIDATED: requires cohort-aligned business evidence, documented methodology and human review.
- REJECTED: excluded from retrieval.

All initial entries are RESEARCHED. Source links are attribution, not authorization. No full transcripts are stored. Adding an expert requires checking source accuracy, applicability, status, agent mapping and limitations. Never promote a creator's financial claims to verified business evidence.

## Safety
Knowledge is not an executable instruction. No automated outreach, price or quota changes, ad spend, campaign launch, customer-state mutation, or financial action is authorized by this catalog. Existing SUPER_ADMIN approval and provider checks remain in force. Retrieval is deterministic, local and bounded; no external request is performed at runtime.

## Scope and limitations
This first integration supplies curated guidance directly to the six existing agent instruction prompts, without a new database, administrative UI, ingestion pipeline, approval workflow for knowledge edits, or runtime semantic search. Research additions currently require code review and deployment. Those additional capabilities are future work, not implemented here.
