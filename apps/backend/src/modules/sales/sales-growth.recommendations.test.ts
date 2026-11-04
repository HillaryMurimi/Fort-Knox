import { describe, expect, it } from 'vitest';
import { growthReadiness, recommendGrowthExperiment } from './sales-growth.recommendations.js';
describe('advisory growth recommendations', () => {
  it('boots with no landlords or messages and makes no conversion claim', () => {
    const readiness = growthReadiness({ pipeline: [], messages: [], assistance: [] });
    expect(readiness.observedLeads).toBe(0);
    expect(readiness.acceptedMessages).toBe(0);
    expect(readiness.experiment).toBeNull();
    expect(readiness.requiresApproval).toBe(true);
    expect(recommendGrowthExperiment({}).status).toBe('INSUFFICIENT_EVIDENCE');
  });
  it('integrates persisted operational summaries without inventing cohort conversion', () => {
    const result = growthReadiness({ pipeline: [{ _id: 'NEW', count: 15 }], messages: [{ channel: 'EMAIL', accepted: 9, replied: 2 }], assistance: [{ _id: 'OPEN', count: 3 }] });
    expect(result.observedLeads).toBe(15);
    expect(result.correlatedReplies).toBe(2);
    expect(result.experiment).toBeNull();
    expect(result.requiresApproval).toBe(true);
    expect(result.limitations.join(' ')).toContain('not a stage-transition cohort');
  });
  it('does not invent a bottleneck without evidence', () => {
    const result = recommendGrowthExperiment({ RESEARCHED: 100 });
    expect(result.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.experiment).toBeNull();
    expect(result.requiresApproval).toBe(true);
  });
  it('finds the weakest observed cohort transition', () => {
    const result = recommendGrowthExperiment({ RESEARCHED: 200, QUALIFIED: 100, ENGAGED: 20, SIGNED: 10 });
    expect(result.bottleneck).toEqual({ from: 'QUALIFIED', to: 'ENGAGED', conversionBps: 2000 });
    expect(result.status).toBe('REVIEW_REQUIRED');
  });
  it('rejects inconsistent stage counts', () => {
    const result = recommendGrowthExperiment({ RESEARCHED: 20, QUALIFIED: 30 });
    expect(result.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.limitations.join(' ')).toContain('Invalid');
  });
  it('requires sufficient sample sizes', () => {
    expect(recommendGrowthExperiment({ RESEARCHED: 5, QUALIFIED: 1 }).bottleneck).toBeNull();
  });
});
