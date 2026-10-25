import { Check, Minus } from 'lucide-react';
import type { PublicPlanCatalog } from '@/lib/acquisition';
import { comparisonCategories, fortKnoxOnlyFeatures } from '@/lib/plans-view-model';
import './plan-feature-matrix.css';

type Plan = PublicPlanCatalog['plans'][number];

function Availability({ plan, feature }: { plan: Plan; feature: string | null }) {
  if (feature === null) return <span className="plan-matrix-status plan-matrix-status--terms">Per agreement</span>;
  const included = plan.features.includes(feature);
  return <span className={`plan-matrix-status ${included ? 'plan-matrix-status--included' : 'plan-matrix-status--absent'}`}>
    {included ? <Check size={15} aria-hidden="true" /> : <Minus size={15} aria-hidden="true" />}
    <span className="plan-matrix-status-full">{included ? 'Included' : 'Not included'}</span>
    <span className="plan-matrix-status-short">{included ? 'Yes' : 'No'}</span>
  </span>;
}

export function PlanFeatureMatrix({ plans }: { plans: PublicPlanCatalog['plans'] }) {
  const ordered = [...plans].sort((a, b) => (a.key === 'CONTROL' ? -1 : b.key === 'CONTROL' ? 1 : 0));
  const fortOnly = new Set(fortKnoxOnlyFeatures(ordered));
  return <div className="plan-feature-matrix">
    <div className="plan-matrix-key"><span><Check size={15} aria-hidden="true" /> Included</span><span className="plan-matrix-exclusive-key" /> Fort Knox addition</div>
    <table aria-label="Control and Fort Knox feature comparison">
      <thead><tr><th scope="col">Capability</th>{ordered.map(plan => <th key={plan.key} scope="col" className={plan.key === 'FORT_KNOX' ? 'plan-matrix-fort-heading' : undefined}>{plan.name}</th>)}</tr></thead>
      {comparisonCategories(ordered).map(category => <tbody key={category.title}>
        <tr className="plan-matrix-category"><th scope="rowgroup" colSpan={ordered.length + 1}>{category.title}</th></tr>
        {category.rows.map(row => <tr key={row.label} className={row.feature && fortOnly.has(row.feature) ? 'plan-matrix-exclusive-row' : undefined}>
          <th scope="row">{row.label}{row.feature && fortOnly.has(row.feature) && <span className="plan-matrix-exclusive-label">Fort Knox addition</span>}{row.description && <span className="plan-matrix-description">{row.description}</span>}</th>
          {ordered.map(plan => <td key={plan.key}><Availability plan={plan} feature={row.feature} /></td>)}
        </tr>)}
      </tbody>)}
    </table>
  </div>;
}
