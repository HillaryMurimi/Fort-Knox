import type { PublicPlanCatalog } from './acquisition';

const featureDetails: Record<string, { label: string; description: string }> = {
  'command-center': { label: 'Portfolio command center', description: 'A consolidated view of properties and operational priorities.' },
  finance: { label: 'Rent and finance', description: 'Rent charges, payments, balances and financial records.' },
  maintenance: { label: 'Maintenance', description: 'Requests and accountable work management.' },
  documents: { label: 'Documents', description: 'Controlled property and tenancy documents.' },
  notifications: { label: 'Notifications', description: 'Operational notices and in-app updates.' },
  security: { label: 'Security operations', description: 'Scoped incidents and security workflows.' },
  cctv: { label: 'CCTV access', description: 'Authorized camera access when hardware and gateway are configured.' },
  evidence: { label: 'Evidence', description: 'Controlled incident and maintenance evidence.' },
  'decision-intelligence': { label: 'Decision intelligence', description: 'Available intelligence views subject to data readiness.' },
  'decision-automation': { label: 'Decision automation', description: 'Policy-governed operational decision support.' },
  'predictive-intelligence': { label: 'Predictive intelligence', description: 'Predictions only when trained models and data are ready.' },
  'model-serving': { label: 'Model serving', description: 'Governed access to available models.' },
  'advanced-reporting': { label: 'Advanced reporting', description: 'Additional portfolio reporting views.' },
};

export function featurePresentation(key: string) {
  return featureDetails[key] ?? { label: key.replaceAll(/[-_.]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()), description: '' };
}

export function comparisonFeatures(plans: PublicPlanCatalog['plans']) {
  return [...new Set(plans.flatMap(plan => plan.features))];
}

const categories = [
  { title: 'Property management', rows: [['command-center', 'Portfolio, buildings and units']] },
  { title: 'Tenant management', rows: [['command-center', 'Tenant and tenancy workflows']] },
  { title: 'Financial management', rows: [['finance', 'Rent, payments and balances']] },
  { title: 'Maintenance management', rows: [['maintenance', 'Requests and work tracking']] },
  { title: 'Staff and operations', rows: [['command-center', 'Role-scoped workspaces'], ['notifications', 'Operational notifications']] },
  { title: 'Reporting and intelligence', rows: [['command-center', 'Portfolio operating view'], ['advanced-reporting', 'Advanced reporting'], ['decision-intelligence', 'Decision intelligence']] },
  { title: 'Security and monitoring', rows: [['security', 'Security operations']] },
  { title: 'CCTV integration', rows: [['cctv', 'Authorized camera access']] },
  { title: 'Audit and accountability', rows: [['documents', 'Controlled documents'], ['evidence', 'Incident and maintenance evidence']] },
  { title: 'Automation and risk intelligence', rows: [['decision-automation', 'Decision automation'], ['predictive-intelligence', 'Predictive intelligence'], ['model-serving', 'Model serving']] },
] as const;

export function comparisonCategories(plans: PublicPlanCatalog['plans']) {
  const offered = new Set(comparisonFeatures(plans));
  const classified = new Set<string>(categories.flatMap(category => category.rows.map(([feature]) => feature)));
  const unclassified = [...offered].filter(feature => !classified.has(feature));
  return [
    ...categories.map(category => ({
      title: category.title,
      rows: category.rows.filter(([feature]) => offered.has(feature)).map(([feature, label]) => ({ feature, label, description: featurePresentation(feature).description })),
    })).filter(category => category.rows.length > 0),
    ...(unclassified.length ? [{ title: 'Other included capabilities', rows: unclassified.map(feature => ({ feature, label: featurePresentation(feature).label, description: featurePresentation(feature).description })) }] : []),
    { title: 'Support', rows: [{ feature: null, label: 'Service support', description: 'Scope and response commitments are defined in the signed agreement.' }] },
  ];
}

export function planHighlights(plan: PublicPlanCatalog['plans'][number]) {
  const priority = plan.key === 'FORT_KNOX'
    ? ['command-center', 'finance', 'security', 'cctv', 'evidence']
    : ['command-center', 'finance', 'maintenance', 'documents', 'notifications'];
  return [...priority.filter(feature => plan.features.includes(feature)), ...plan.features.filter(feature => !priority.includes(feature))].slice(0, 5);
}
