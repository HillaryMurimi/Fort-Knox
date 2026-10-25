import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PublicPlanCatalog } from '@/lib/acquisition';
import { PlanFeatureMatrix } from './plan-feature-matrix';

const plans = [
  { key: 'CONTROL', name: 'Control', features: ['command-center', 'finance', 'maintenance'] },
  { key: 'FORT_KNOX', name: 'Fort Knox', features: ['command-center', 'finance', 'maintenance', 'security', 'cctv'] },
] as PublicPlanCatalog['plans'];

describe('shared plan feature matrix', () => {
  it('aligns both tiers and highlights only published Fort Knox additions', () => {
    const html = renderToStaticMarkup(<PlanFeatureMatrix plans={[plans[1]!, plans[0]!]} />);
    expect(html).toContain('Control and Fort Knox feature comparison');
    expect(html.indexOf('>Control</th>')).toBeLessThan(html.indexOf('>Fort Knox</th>'));
    expect(html).toContain('Centralized portfolio dashboard');
    expect(html).toContain('Authorized CCTV access');
    expect(html).toContain('Requires supported hardware');
    expect(html).toContain('plan-matrix-exclusive-row');
    expect(html).not.toContain('Advanced financial anomaly detection');
  });
  it('does not invent a Fort Knox addition when only Control is published', () => {
    const html = renderToStaticMarkup(<PlanFeatureMatrix plans={[plans[0]!]} />);
    expect(html).not.toContain('plan-matrix-exclusive-row');
    expect(html).not.toContain('plan-matrix-fort-heading');
  });
});
