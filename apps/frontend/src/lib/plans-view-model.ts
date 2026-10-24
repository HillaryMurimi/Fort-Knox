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
