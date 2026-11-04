/** Advisory-only growth analysis. No side effects, quota mutations or autonomous sends. */
export type FunnelStage = 'RESEARCHED' | 'QUALIFIED' | 'ENGAGED' | 'SIGNED' | 'PAID' | 'ACTIVATED' | 'RETAINED';
export const funnelStages: readonly FunnelStage[] = ['RESEARCHED', 'QUALIFIED', 'ENGAGED', 'SIGNED', 'PAID', 'ACTIVATED', 'RETAINED'];
export type FunnelEvidence = Partial<Record<FunnelStage, number>>;
export type GrowthRecommendation = {
  status: 'INSUFFICIENT_EVIDENCE' | 'REVIEW_REQUIRED';
  bottleneck: { from: FunnelStage; to: FunnelStage; conversionBps: number } | null;
  experiment: string | null;
  limitations: string[];
  requiresApproval: true;
};
const interventions: Record<FunnelStage, string> = {
  RESEARCHED: 'Validate source coverage and target customer fit.',
  QUALIFIED: 'Test more relevant, consent-compliant outreach to qualified prospects.',
  ENGAGED: 'Review objections and offer a short call only when useful.',
  SIGNED: 'Audit contract review friction without changing commercial terms.',
  PAID: 'Investigate verified payment completion and provider errors.',
  ACTIVATED: 'Investigate first-value onboarding friction and offer guided assistance.',
  RETAINED: 'Review product adoption and customer feedback before scaling acquisition.',
};
export function growthReadiness(operations: { pipeline: Array<{ _id: string | null; count: number }>; messages: Array<{ channel: string; accepted: number; replied: number }>; assistance: Array<{ _id: string | null; count: number }> }) {
  const observedLeads = operations.pipeline.reduce((sum, item) => sum + item.count, 0);
  const acceptedMessages = operations.messages.reduce((sum, item) => sum + item.accepted, 0);
  const correlatedReplies = operations.messages.reduce((sum, item) => sum + item.replied, 0);
  return {
    status: 'REVIEW_REQUIRED' as const,
    source: 'Persisted CRM snapshot and provider-accepted message records',
    observedLeads,
    acceptedMessages,
    correlatedReplies,
    assistanceCases: operations.assistance.reduce((sum, item) => sum + item.count, 0),
    recommendation: observedLeads === 0 ? 'Review qualified prospect sourcing and CRM data coverage.' : acceptedMessages === 0 ? 'Review outreach eligibility, consent and approved campaign readiness.' : 'Establish cohort-aligned stage transitions and activation/retention evidence before optimizing conversion.',
    experiment: null,
    requiresApproval: true as const,
    limitations: ['CRM stage counts are a snapshot of leads created in the selected window, not a stage-transition cohort.', 'Replies are correlated message counts, not unique engaged landlords.', 'Verified new paying landlord, new MRR and retention cohorts are not established by these operational counts.', 'No conversion rates, experiment winners or quota attainment can be inferred from this diagnostic.'],
  };
}
export function recommendGrowthExperiment(evidence: FunnelEvidence, minimumDenominator = 20): GrowthRecommendation {
  if (!Number.isSafeInteger(minimumDenominator) || minimumDenominator < 1) throw new Error('Invalid minimum denominator');
  const limitations: string[] = [];
  let weakest: GrowthRecommendation['bottleneck'] = null;
  for (let i = 0; i < funnelStages.length - 1; i++) {
    const from = funnelStages[i]!, to = funnelStages[i + 1]!;
    const numerator = evidence[to], denominator = evidence[from];
    if (numerator === undefined || denominator === undefined) { limitations.push(`Missing ${from} or ${to} evidence`); continue; }
    if (![numerator, denominator].every(n => Number.isSafeInteger(n) && n! >= 0) || numerator > denominator) {
      limitations.push(`Invalid or non-cohort-aligned ${from} to ${to} counts`); continue;
    }
    if (denominator < minimumDenominator) { limitations.push(`Insufficient ${from} sample size`); continue; }
    const conversionBps = Math.floor(numerator * 10000 / denominator);
    if (!weakest || conversionBps < weakest.conversionBps) weakest = { from, to, conversionBps };
  }
  if (!weakest) return { status: 'INSUFFICIENT_EVIDENCE', bottleneck: null, experiment: null, limitations, requiresApproval: true };
  return { status: 'REVIEW_REQUIRED', bottleneck: weakest, experiment: interventions[weakest.to], limitations, requiresApproval: true };
}
