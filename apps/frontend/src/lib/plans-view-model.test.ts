import { describe, expect, it } from 'vitest';
import { comparisonFeatures, featurePresentation } from './plans-view-model';
import { parseSignupContext, signupHref, type PublicPlanCatalog } from './acquisition';

describe('plans comparison', () => {
  it('includes every catalog entitlement and preserves the selected quote on signup', () => {
    const plans = [
      { key: 'CONTROL', features: ['finance', 'maintenance'] },
      { key: 'FORT_KNOX', features: ['finance', 'cctv', 'advanced-reporting'] },
    ] as PublicPlanCatalog['plans'];
    expect(comparisonFeatures(plans)).toEqual(['finance', 'maintenance', 'cctv', 'advanced-reporting']);
    expect(featurePresentation('cctv').description).toContain('gateway');
    const chosen = { planKey: 'FORT_KNOX' as const, unitCount: 55, prepaidMonths: 6, source: 'PUBLIC_DEMO' as const };
    expect(parseSignupContext(signupHref(chosen).split('?')[1]!)).toEqual(chosen);
  });
});
