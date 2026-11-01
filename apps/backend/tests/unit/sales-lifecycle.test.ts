import { describe, expect, it } from 'vitest';
import { sourceStage, salesLifecycleEvents, salesLifecycleAudits } from '../../src/modules/sales/sales-lifecycle.catalog.js';
import { lifecycleReplaySchema, mergeProposalSchema } from '../../src/modules/sales/sales-identity.schemas.js';
describe('CRM lifecycle evidence boundaries', () => {
  it('separates subscription evidence from tenant rent payment events', () => {
    expect(sourceStage('payment.confirmed')).toBeNull();
    expect(sourceStage('payment.confirmed', 'PAYMENT_VERIFIED')).toBeNull();
    expect(sourceStage('landlord.onboarding.transition', 'PAYMENT_VERIFIED')).toEqual({ rank: 12, stage: 'PAYMENT_VERIFIED' });
    expect(salesLifecycleEvents).not.toContain('payment.confirmed');
  });
  it('uses existing source names and leaves unrelated events unmapped', () => {
    expect(sourceStage('landlord.signup.created')).toEqual({ rank: 9, stage: 'REGISTERED' });
    expect(sourceStage('organization.activated')?.rank).toBe(13);
    expect(salesLifecycleAudits).toContain('landlord.onboarding.transition');
    expect(sourceStage('tenant.created')).toBeNull();
  });
  it('does not accept arbitrary Mongo filters or mutation instructions in replay and merge commands', () => {
    expect(lifecycleReplaySchema.safeParse({ organizationId: { $ne: null } }).success).toBe(false);
    expect(mergeProposalSchema.safeParse({ sourceId: 'a'.repeat(24), targetId: 'b'.repeat(24), sourceRevision: 0, targetRevision: 0, reason: 'Review matching contacts', deleteBillingRecords: true }).success).toBe(false);
  });
});
