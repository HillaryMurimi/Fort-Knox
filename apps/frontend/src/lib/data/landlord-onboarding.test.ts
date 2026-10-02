import { afterEach, describe, expect, it, vi } from 'vitest';
import { landlordOnboardingClient as client, onboardingStepIndex, type LandlordProgress } from './landlord-onboarding';
import { api } from '../api';
vi.mock('../api', () => ({ api: vi.fn() }));
afterEach(() => vi.clearAllMocks());
describe('resumable landlord onboarding', () => {
  it.each([['DETAILS', 0], ['PLAN', 1], ['SIGNATURE', 2], ['PAYMENT', 3], ['COMPLETE', 4]])('routes backend step %s to guided step %s', (nextStep, step) => {
    expect(onboardingStepIndex({ nextStep } as LandlordProgress)).toBe(step);
  });
  it('submits reviewed hash, typed signature and explicit consent without payment success claims', async () => {
    const input = { contractId: 'contract', documentHash: 'hash', signatoryName: 'Owner', authorityConfirmed: true as const, termsAccepted: true as const };
    await client.sign('org-one', input);
    expect(api).toHaveBeenCalledWith('/organizations/org-one/landlord-onboarding/signature', { method: 'POST', body: JSON.stringify(input) });
    expect(JSON.stringify(vi.mocked(api).mock.calls)).not.toContain('ACTIVE');
  });
  it('uses server progress, commercial quote and provider reconciliation routes', async () => {
    await client.status('org-one'); await client.quote('org-one', 'CONTROL', 3); await client.reconcile('org-one');
    expect(api).toHaveBeenNthCalledWith(1, '/organizations/org-one/landlord-onboarding');
    expect(api).toHaveBeenNthCalledWith(2, '/organizations/org-one/landlord-onboarding/quote?planKey=CONTROL&prepaidMonths=3');
    expect(api).toHaveBeenNthCalledWith(3, '/organizations/org-one/landlord-onboarding/reconcile', { method: 'POST' });
  });
});
