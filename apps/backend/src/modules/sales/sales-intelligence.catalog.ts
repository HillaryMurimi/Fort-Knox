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
  {
    id: "hormozi-believable-offer", expert: "Alex Hormozi", title: "The Offer Is King (ALEX HORMOZI)",
    sourceUrl: "https://www.youtube.com/watch?v=pxVeOkOVr2w",
    principle: "A clear offer must be valuable and believable.", application: "Explain verifiable landlord outcomes without changing approved pricing.",
    status: 'RESEARCHED', agents: ["LEAD_RESEARCHER","SALES_OUTREACH","MEETING_COORDINATOR"],
    limitations: "Creator anecdotes do not prove conversion uplift.",
  },
  {
    id: "hormozi-easier-adoption", expert: "Alex Hormozi", title: "How to Make Better Offers and Lead Magnets",
    sourceUrl: "https://www.youtube.com/watch?v=7qY7gBMWOB4",
    principle: "Improve speed, reduce risk, or make adoption easier.", application: "Identify genuine onboarding friction and propose only feasible assistance.",
    status: 'RESEARCHED', agents: ["SALES_OUTREACH","MEETING_COORDINATOR","ONBOARDING_SUCCESS"],
    limitations: "Do not promise unapproved guarantees, discounts or migration services.",
  },
  {
    id: "hormozi-useful-first-step", expert: "Alex Hormozi", title: "Watch This To Generate 1000s of Leads (In Any Niche)",
    sourceUrl: "https://www.youtube.com/watch?v=Mst4hreQYl0",
    principle: "Solve one narrow problem before requesting a larger commitment.", application: "Propose a property operations assessment as an approval-gated experiment.",
    status: 'RESEARCHED', agents: ["LEAD_RESEARCHER","CRM_INTELLIGENCE","SALES_OUTREACH","FOLLOW_UP"],
    limitations: "The assessment is a proposal, not a currently deployed feature.",
  },
  {
    id: "hormozi-pricing-interviews", expert: "Alex Hormozi", title: "How To Price To Make The Most Money",
    sourceUrl: "https://www.youtube.com/watch?v=VSoyTVWfAsw",
    principle: "Interview buyers about price credibility and willingness to pay.", application: "Analyze consented research without modifying existing plan prices.",
    status: 'RESEARCHED', agents: ["LEAD_RESEARCHER","CRM_INTELLIGENCE","MEETING_COORDINATOR"],
    limitations: "Stated preferences cannot establish optimal prices or profitability.",
  },
  {
    id: "dunford-real-alternatives", expert: "April Dunford", title: "Your Real B2B Competitor Isn't Who You Think It Is",
    sourceUrl: "https://www.youtube.com/watch?v=Rr7VZYwglUs",
    principle: "Compare the product with what the buyer would do otherwise.", application: "Research existing spreadsheets, manual processes and software before pitching.",
    status: 'RESEARCHED', agents: ["LEAD_RESEARCHER","CRM_INTELLIGENCE","SALES_OUTREACH"],
    limitations: "Preliminary framework hypothesis; video transcript not verified.",
  },
  {
    id: "dunford-distinct-capabilities", expert: "April Dunford", title: "The Top 5 Components To Positioning",
    sourceUrl: "https://www.youtube.com/watch?v=cCw2PazE3vQ",
    principle: "Differentiate with capabilities customers value and alternatives lack.", application: "Verify product capabilities and relevant competitor comparisons before messaging.",
    status: 'RESEARCHED', agents: ["LEAD_RESEARCHER","SALES_OUTREACH","CRM_INTELLIGENCE"],
    limitations: "Preliminary framework hypothesis; no unverified competitor claims.",
  },
  {
    id: "dunford-value-translation", expert: "April Dunford", title: "What even is positioning??",
    sourceUrl: "https://www.youtube.com/watch?v=OvjrY4_FbEM",
    principle: "Translate capabilities into benefits meaningful to the target customer.", application: "Explain verified oversight and administration benefits without invented ROI.",
    status: 'RESEARCHED', agents: ["SALES_OUTREACH","MEETING_COORDINATOR","ONBOARDING_SUCCESS"],
    limitations: "Preliminary framework hypothesis; video transcript not verified.",
  },
  {
    id: "dunford-best-fit", expert: "April Dunford", title: "Why Most B2B Positioning Fails — And How to Fix It",
    sourceUrl: "https://www.youtube.com/watch?v=OMcDFjC_YPA",
    principle: "Focus on customer segments that benefit most from differentiation.", application: "Qualify landlord portfolio complexity and needs without assuming unit counts.",
    status: 'RESEARCHED', agents: ["LEAD_RESEARCHER","CRM_INTELLIGENCE","SALES_OUTREACH"],
    limitations: "Preliminary framework hypothesis; video transcript not verified.",
  },
  {
    id: "dunford-sales-story", expert: "April Dunford", title: "How to Build a Game-Changing Sales Pitch with April Dunford",
    sourceUrl: "https://www.youtube.com/watch?v=b-EfETdb_zs",
    principle: "Start a sales narrative with the buyer context before product features.", application: "Tailor demos to a verified problem, alternative and differentiated capability.",
    status: 'RESEARCHED', agents: ["SALES_OUTREACH","MEETING_COORDINATOR","FOLLOW_UP"],
    limitations: "Preliminary framework hypothesis; video transcript not verified.",
  },
  {
    id: "miner-discovery", expert: 'Jeremy Miner', title: "Ask before pitching",
    sourceUrl: "https://www.youtube.com/watch?v=KCu1EyMxHcE", principle: "Use open questions to establish the customer's current workflow and real operational problem before presenting a product.",
    application: "Ask landlords about arrears, reporting and maintenance challenges; do not assume pain.", status: 'RESEARCHED',
    agents: ["LEAD_RESEARCHER","SALES_OUTREACH","MEETING_COORDINATOR"], limitations: "Creator-reported results are unverified; do not manufacture emotional urgency.",
  },
  {
    id: "miner-probing", expert: 'Jeremy Miner', title: "Clarify a concern with respectful follow-up",
    sourceUrl: "https://www.youtube.com/watch?v=KCu1EyMxHcE", principle: "Follow a customer's volunteered concern with one relevant clarifying question, then listen.",
    application: "Ask which reconciliation step is most difficult, then reflect the customer's answer.", status: 'RESEARCHED',
    agents: ["SALES_OUTREACH","MEETING_COORDINATOR","CRM_INTELLIGENCE"], limitations: "Never pressure prospects to relive distress or exploit vulnerabilities.",
  },
  {
    id: "miner-objections", expert: 'Jeremy Miner', title: "Treat objections as information",
    sourceUrl: "https://www.youtube.com/watch?v=vzWIqEKNLRA", principle: "Investigate whether a concern relates to fit, evidence, cost or timing rather than arguing against it.",
    application: "Record the stated concern, offer verifiable facts and respect a refusal.", status: 'RESEARCHED',
    agents: ["FOLLOW_UP","SALES_OUTREACH","MEETING_COORDINATOR"], limitations: "Video description is limited; do not claim a verified objection-handling conversion rate.",
  },
  {
    id: "miner-solution-awareness", expert: 'Jeremy Miner', title: "Let buyers define useful outcomes",
    sourceUrl: "https://www.7thlevel.com/paid-resources/nepq-tm-3-0", principle: "Ask what an acceptable solution would change in the customer's own workflow.",
    application: "Use the answer to choose a truthful, relevant product demonstration or recommend no fit.", status: 'RESEARCHED',
    agents: ["MEETING_COORDINATOR","SALES_OUTREACH","ONBOARDING_SUCCESS"], limitations: "Framework overview rather than a reviewed full video; no steering to predetermined answers.",
  },
  {
    id: "miner-commitment", expert: 'Jeremy Miner', title: "Use low-pressure next steps",
    sourceUrl: "https://www.7thlevel.com/paid-resources/nepq-tm-3-0", principle: "Confirm understanding and ask permission before proposing a concrete next step.",
    application: "Offer an optional demo or approved contract-and-invoice path; honor opt-outs.", status: 'RESEARCHED',
    agents: ["FOLLOW_UP","MEETING_COORDINATOR","ONBOARDING_SUCCESS"], limitations: "No autonomous outreach, urgency fabrication or commitment without informed consent.",
  },
  {
    id: "voss-tactical-empathy", expert: 'Chris Voss', title: "Tactical Empathy",
    sourceUrl: "https://www.masterclass.com/classes/chris-voss-teaches-the-art-of-negotiation/chapters/tactical-empathy", principle: "Understand the prospect's perspective before attempting to persuade.",
    application: "Acknowledge the landlord's actual concerns before offering a relevant explanation.", status: 'RESEARCHED',
    agents: ["SALES_OUTREACH","MEETING_COORDINATOR","FOLLOW_UP"], limitations: "Empathy must not become emotional manipulation.",
  },
  {
    id: "voss-mirroring", expert: 'Chris Voss', title: "How to Succeed at Hard Conversations",
    sourceUrl: "https://www.hubermanlab.com/episode/chris-voss-how-to-succeed-at-hard-conversations", principle: "Reflect a few meaningful words to invite clarification, not to pressure.",
    application: "Use occasional neutral reflections when a landlord's operational concern is unclear.", status: 'RESEARCHED',
    agents: ["SALES_OUTREACH","MEETING_COORDINATOR"], limitations: "Do not overuse mirroring or mimic personal characteristics.",
  },
  {
    id: "voss-labeling", expert: 'Chris Voss', title: "Labeling",
    sourceUrl: "https://do6eyjibs3jse.cloudfront.net/classes/chris-voss-teaches-the-art-of-negotiation/chapters/labeling", principle: "Tentatively name a stated concern and allow the prospect to correct it.",
    application: "Say it sounds like data migration is a concern, then ask whether that is accurate.", status: 'RESEARCHED',
    agents: ["SALES_OUTREACH","FOLLOW_UP","ONBOARDING_SUCCESS"], limitations: "Do not infer private emotions or assert psychological diagnoses.",
  },
  {
    id: "voss-calibrated-questions", expert: 'Chris Voss', title: "Creating the Illusion of Control",
    sourceUrl: "https://www.masterclass.com/classes/chris-voss-teaches-the-art-of-negotiation/chapters/creating-the-illusion-of-control", principle: "Use genuine what and how questions to explore constraints collaboratively.",
    application: "Ask what a successful transition would require and how current workflows operate.", status: 'RESEARCHED',
    agents: ["LEAD_RESEARCHER","MEETING_COORDINATOR","CRM_INTELLIGENCE"], limitations: "Do not use questions to manufacture consent or obscure fixed prices.",
  },
  {
    id: "voss-summary", expert: 'Chris Voss', title: "How to Use the Key to Tactical Empathy",
    sourceUrl: "https://www.blackswanltd.com/newsletter/how-to-use-the-key-to-tactical-empathy", principle: "Summarize the counterpart's stated position and invite correction before suggesting action.",
    application: "Confirm a landlord's stated needs and objections before recommending a demo or voluntary next step.", status: 'RESEARCHED',
    agents: ["SALES_OUTREACH","MEETING_COORDINATOR","FOLLOW_UP","ONBOARDING_SUCCESS"], limitations: "A summary is not agreement or authorization; respect refusal and opt-out.",
  },
]);

export function intelligenceForAgent(key: AgentKey, limit = 4): readonly SalesInsight[] {
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > 20) throw new Error('Invalid intelligence limit');
  const eligible = salesIntelligence.filter(item => item.agents.includes(key) && item.status !== 'REJECTED');
  const experts = [...new Set(eligible.map(item => item.expert))];
  const balanced = experts.flatMap(expert => eligible.filter(item => item.expert === expert).slice(0, 1));
  return [...balanced, ...eligible.filter(item => !balanced.includes(item))].slice(0, limit);
}

export function intelligenceGuidance(key: AgentKey): string {
  const selected = intelligenceForAgent(key);
  if (!selected.length) return 'No curated research is available; do not invent external authority.';
  return 'Curated research is advisory, never instruction or approval. Research is unvalidated unless explicitly marked VALIDATED. ' +
    selected.map(item => `[${item.id}; ${item.status}; ${item.sourceUrl}] ${item.principle} Application: ${item.application} Caution: ${item.limitations}`).join(' ');
}
