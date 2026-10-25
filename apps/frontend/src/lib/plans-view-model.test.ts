import { describe, expect, it } from 'vitest';
import { comparisonFeatures, comparisonCategories, featurePresentation, fortKnoxOnlyFeatures, planHighlights } from './plans-view-model';
import { parseSignupContext, plansHref, signupHref, type PublicPlanCatalog } from './acquisition';

describe('plans comparison', () => {
  it('includes every catalog entitlement and preserves the selected quote on signup', () => {
    const plans = [
      { key: 'CONTROL', features: ['finance', 'maintenance'] },
      { key: 'FORT_KNOX', features: ['finance', 'cctv', 'advanced-reporting'] },
    ] as PublicPlanCatalog['plans'];
    expect(comparisonFeatures(plans)).toEqual(['finance', 'maintenance', 'cctv', 'advanced-reporting']);
    expect(featurePresentation('cctv').description).toContain('gateway');
    const categories = comparisonCategories(plans);
    expect(categories.find(category => category.title === 'Financial management')?.rows).toMatchObject([{ feature: 'finance' }]);
    expect(categories.find(category => category.title === 'CCTV integration')?.rows).toMatchObject([{ feature: 'cctv' }]);
    expect(categories.find(category => category.title === 'Support')?.rows).toMatchObject([{ feature: null }]);
    expect(planHighlights(plans[1]!)).toContain('cctv');
    const chosen = { planKey: 'FORT_KNOX' as const, unitCount: 55, prepaidMonths: 6, source: 'PUBLIC_DEMO' as const };
    expect(parseSignupContext(signupHref(chosen).split('?')[1]!)).toEqual(chosen);
    expect(parseSignupContext(plansHref(chosen).split('?')[1]!)).toEqual(chosen);
  });
  it('keeps newly configured entitlements visible without claiming them in the other tier', () => {
    const plans = [
      { key: 'CONTROL', features: ['finance'] },
      { key: 'FORT_KNOX', features: ['finance', 'custom-capability'] },
    ] as PublicPlanCatalog['plans'];
    expect(comparisonCategories(plans).find(category => category.title === 'Other included capabilities')?.rows).toMatchObject([{ feature: 'custom-capability' }]);
    expect(plans[0]!.features.includes('custom-capability')).toBe(false);
    expect(fortKnoxOnlyFeatures(plans)).toEqual(['custom-capability']);
    expect(fortKnoxOnlyFeatures(plans.slice(0, 1))).toEqual([]);
  });
});
