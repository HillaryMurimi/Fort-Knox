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

export function fortKnoxOnlyFeatures(plans: PublicPlanCatalog['plans']) {
  const control = plans.find(plan => plan.key === 'CONTROL');
  const fortKnox = plans.find(plan => plan.key === 'FORT_KNOX');
  if (!control || !fortKnox) return [];
  return fortKnox.features.filter(feature => !control.features.includes(feature));
}

const categories = [
  { title: 'Property & portfolio', rows: [
    ['command-center', 'Centralized portfolio dashboard'], ['command-center', 'Multiple properties and buildings'],
    ['command-center', 'Floors, units and unit categories'], ['finance', 'Individual unit asking rent'],
    ['command-center', 'Occupancy and vacancy records'], ['command-center', 'Property and unit records'],
  ] },
  { title: 'Rent & financial management', rows: [
    ['finance', 'Rent charges and payment history'], ['finance', 'Outstanding balances and arrears'],
    ['finance', 'Payment reconciliation and reversals'], ['finance', 'Expenses and service charges'],
    ['finance', 'Financial reports and periods'], ['notifications', 'Operational payment notices'],
  ] },
  { title: 'Tenant management', rows: [
    ['command-center', 'Tenant profiles and assigned tenancies'], ['command-center', 'Controlled tenant onboarding'],
    ['command-center', 'Move-out workflow'], ['finance', 'Tenant rent and payment records'],
    ['maintenance', 'Tenant service requests'], ['documents', 'Authorized tenancy documents'],
  ] },
  { title: 'Maintenance & operations', rows: [
    ['maintenance', 'Maintenance request submission'], ['maintenance', 'Ticket status and work history'],
    ['maintenance', 'Contractor assignment and quotations'], ['maintenance', 'Approval and verification workflow'],
    ['maintenance', 'Maintenance evidence and costs'], ['notifications', 'Operational notifications'],
  ] },
  { title: 'Staff & access', rows: [
    ['command-center', 'Role-based workspaces'], ['command-center', 'Role and property-scoped access'],
    ['command-center', 'Staff invitations and account management'],
  ] },
  { title: 'Reporting & intelligence', rows: [
    ['command-center', 'Portfolio operating view'], ['advanced-reporting', 'Advanced reporting'],
    ['decision-intelligence', 'Decision intelligence'],
  ] },
  { title: 'Security & monitoring', rows: [['security', 'Security incidents and escalation'], ['cctv', 'Authorized CCTV access']] },
  { title: 'Documents & accountability', rows: [['documents', 'Controlled documents'], ['evidence', 'Incident and maintenance evidence']] },
  { title: 'Automation & risk intelligence', rows: [['decision-automation', 'Decision automation'], ['predictive-intelligence', 'Predictive intelligence'], ['model-serving', 'Model serving']] },
] as const;

const conditionalNotes: Record<string, string> = {
  cctv: 'Requires supported hardware and a configured streaming gateway.',
  notifications: 'Delivery channels depend on configured providers.',
  'decision-intelligence': 'Views depend on available portfolio data and service readiness.',
  'decision-automation': 'Subject to configured policies and service readiness.',
  'predictive-intelligence': 'Requires a trained, ready model and sufficient data.',
  'model-serving': 'Requires an available, authorized model.',
};

export function comparisonCategories(plans: PublicPlanCatalog['plans']) {
  const offered = new Set(comparisonFeatures(plans));
  const classified = new Set<string>(categories.flatMap(category => category.rows.map(([feature]) => feature)));
  const unclassified = [...offered].filter(feature => !classified.has(feature));
  return [
    ...categories.map(category => ({
      title: category.title,
      rows: category.rows.filter(([feature]) => offered.has(feature)).map(([feature, label]) => ({ feature, label, description: conditionalNotes[feature] ?? '' })),
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
