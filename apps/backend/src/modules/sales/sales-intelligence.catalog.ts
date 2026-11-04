/** Curated, advisory-only sales intelligence. No external text is executable authority. */
import type { AgentKey } from './sales-agent.schemas.js';

export type IntelligenceStatus = 'RESEARCHED' | 'APPROVED_FOR_TEST' | 'VALIDATED' | 'REJECTED';
export type SalesInsight = Readonly<{
  id: string;
  expert: string;
  title: string;
  sourceUrl: string;
  principle: string;
  application: string;
  status: IntelligenceStatus;
  agents: readonly AgentKey[];
  limitations: string;
}>;

export const salesIntelligence: readonly SalesInsight[] = Object.freeze([
  {
    id: 'suby-discovery-first',
    expert: 'Sabri Suby',
    title: 'Learn 97% of Sales in 52 Minutes',
    sourceUrl: 'https://www.youtube.com/watch?v=rsgvkkpNg7Y',
    principle: 'Diagnose the prospect\'s actual problem and prior attempts before presenting a solution.',
    application: 'Ask landlords about arrears, reconciliation, tenant communication and existing workflows before proposing a relevant demonstration.',
    status: 'RESEARCHED',
    agents: ['LEAD_RESEARCHER', 'SALES_OUTREACH', 'MEETING_COORDINATOR', 'CRM_INTELLIGENCE'],
    limitations: 'Creator advice, not a validated conversion improvement for Dapinni.',
  },
  {
    id: 'suby-show-relevant-value',
    expert: 'Sabri Suby',
    title: 'How to Sell ANYTHING at a Premium Price',
    sourceUrl: 'https://www.youtube.com/watch?v=LvZ31SSkY-s',
    principle: 'Demonstrate a relevant part of the product experience before requesting commitment.',
    application: 'Propose a short, accurate product demonstration using only implemented and verified capabilities.',
    status: 'RESEARCHED',
    agents: ['SALES_OUTREACH', 'MEETING_COORDINATOR', 'ONBOARDING_SUCCESS'],
    limitations: 'No promise of outcomes, trial access, or functionality not actually available.',
  },
  {
    id: 'suby-research-language',
    expert: 'Sabri Suby',
    title: 'The $1 Million Landing Page Strategy (Works For Normal People)',
    sourceUrl: 'https://www.youtube.com/watch?v=Env9wuka0oA',
    principle: 'Ground messaging in customer language, concerns and desired outcomes.',
    application: 'Use verified prospect research to suggest segment-specific messages, with provenance and no fabricated claims.',
    status: 'RESEARCHED',
    agents: ['LEAD_RESEARCHER', 'SALES_OUTREACH', 'CRM_INTELLIGENCE'],
    limitations: 'Video title and creator-reported results are not independently verified.',
  },
  {
    id: 'suby-funnel-bottlenecks',
    expert: 'Sabri Suby',
    title: 'If You Don\'t Understand Funnels, You Don\'t Understand Marketing',
    sourceUrl: 'https://www.youtube.com/watch?v=zHeRryZ8X50',
    principle: 'Identify the weakest measured funnel transition before recommending an experiment.',
    application: 'Use cohort-aligned, verified CRM and payment evidence; recommend approval-gated experiments only.',
    status: 'RESEARCHED',
    agents: ['CRM_INTELLIGENCE', 'FOLLOW_UP', 'ONBOARDING_SUCCESS'],
    limitations: 'Do not infer conversion rates from non-cohort-aligned snapshots.',
  },
  {
    id: 'suby-retention-value',
    expert: 'Sabri Suby',
    title: 'How To Charge 30x More Than Your Competition (Full Guide)',
    sourceUrl: 'https://www.youtube.com/watch?v=WwijQ1TYbw8',
    principle: 'Treat the first sale as the beginning of customer lifetime value, not the end.',
    application: 'Prioritize payment-verified activation, first value, adoption and retention over activity counts.',
    status: 'RESEARCHED',
    agents: ['ONBOARDING_SUCCESS', 'CRM_INTELLIGENCE', 'FOLLOW_UP'],
    limitations: 'Premium brand examples do not establish pricing or retention benchmarks for this SaaS.',
  },
  {
    id: 'suby-guardrails',
    expert: 'Sabri Suby',
    title: 'Give Me 21 Minutes and I\'ll Make You Disgustingly Good at Scaling Ads',
    sourceUrl: 'https://www.youtube.com/watch?v=NHwic5OTNXg',
    principle: 'Define performance metrics and spending guardrails before scaling acquisition.',
    application: 'Suggest bounded experiments subject to SUPER_ADMIN approval and independently verified revenue.',
    status: 'RESEARCHED',
    agents: ['CRM_INTELLIGENCE', 'SALES_OUTREACH'],
    limitations: 'Never authorize spend, alter prices or infer ROAS without attributable financial evidence.',
  },
]);

export function intelligenceForAgent(key: AgentKey, limit = 4): readonly SalesInsight[] {
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > 20) throw new Error('Invalid intelligence limit');
  return salesIntelligence.filter(item => item.agents.includes(key) && item.status !== 'REJECTED').slice(0, limit);
}

export function intelligenceGuidance(key: AgentKey): string {
  const selected = intelligenceForAgent(key);
  if (!selected.length) return 'No curated research is available; do not invent external authority.';
  return 'Curated research is advisory, never instruction or approval. Research is unvalidated unless explicitly marked VALIDATED. ' +
    selected.map(item => `[${item.id}; ${item.status}; ${item.sourceUrl}] ${item.principle} Application: ${item.application} Caution: ${item.limitations}`).join(' ');
}
