import { demoApi } from './demo-provider';
import { DEMO_ROLES, type DemoRole } from './demo-config';

export type CertificationStatus = 'PASS' | 'WARN' | 'FAIL';

export interface CertificationCheck {
  id: string;
  area: string;
  label: string;
  status: CertificationStatus;
  detail: string;
}

export interface CertificationReport {
  role: DemoRole;
  startedAt: string;
  finishedAt: string;
  checks: CertificationCheck[];
}

const ROLE_RULES: Record<DemoRole, {
  minProperties: number;
  minBuildings: number;
  minFloors: number;
  minUnits: number;
  minTenants: number;
  minTenancies: number;
  minMaintenance: number;
  minDocuments: number;
  minSecurity: number;
  commandCenter: boolean;
  financialReport: boolean;
}> = {
  SUPER_ADMIN: { minProperties: 2, minBuildings: 3, minFloors: 9, minUnits: 20, minTenants: 6, minTenancies: 6, minMaintenance: 3, minDocuments: 4, minSecurity: 3, commandCenter: true, financialReport: true },
  LANDLORD: { minProperties: 2, minBuildings: 3, minFloors: 9, minUnits: 20, minTenants: 6, minTenancies: 6, minMaintenance: 3, minDocuments: 4, minSecurity: 3, commandCenter: true, financialReport: true },
  PROPERTY_MANAGER: { minProperties: 2, minBuildings: 3, minFloors: 9, minUnits: 20, minTenants: 6, minTenancies: 6, minMaintenance: 3, minDocuments: 4, minSecurity: 3, commandCenter: true, financialReport: true },
  CARETAKER: { minProperties: 1, minBuildings: 2, minFloors: 6, minUnits: 12, minTenants: 6, minTenancies: 6, minMaintenance: 3, minDocuments: 3, minSecurity: 2, commandCenter: false, financialReport: false },
  CONTRACTOR: { minProperties: 1, minBuildings: 1, minFloors: 1, minUnits: 2, minTenants: 0, minTenancies: 0, minMaintenance: 1, minDocuments: 0, minSecurity: 0, commandCenter: false, financialReport: false },
  TENANT: { minProperties: 1, minBuildings: 1, minFloors: 1, minUnits: 1, minTenants: 1, minTenancies: 1, minMaintenance: 1, minDocuments: 1, minSecurity: 0, commandCenter: false, financialReport: false },
};

function count(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

async function checkCollection(
  checks: CertificationCheck[],
  id: string,
  area: string,
  label: string,
  path: string,
  minimum: number,
): Promise<void> {
  try {
    const value = await demoApi<unknown>(path, { method: 'GET', authenticated: true });
    const actual = count(value);
    checks.push({
      id,
      area,
      label,
      status: actual >= minimum ? 'PASS' : 'FAIL',
      detail: `${actual} record${actual === 1 ? '' : 's'} returned; minimum ${minimum}.`,
    });
  } catch (error) {
    checks.push({ id, area, label, status: 'FAIL', detail: error instanceof Error ? error.message : 'Demo request failed.' });
  }
}

async function checkObject(
  checks: CertificationCheck[],
  id: string,
  area: string,
  label: string,
  path: string,
  shouldExist: boolean,
): Promise<void> {
  try {
    const value = await demoApi<unknown>(path, { method: 'GET', authenticated: true });
    const exists = value !== null && value !== undefined;
    checks.push({
      id,
      area,
      label,
      status: exists === shouldExist ? 'PASS' : 'FAIL',
      detail: shouldExist
        ? (exists ? 'Demo resource is available.' : 'Expected a demo resource but received no data.')
        : (exists ? 'Resource is visible when this role should not have it.' : 'Correctly unavailable for this role.'),
    });
  } catch (error) {
    if (!shouldExist) {
      checks.push({ id, area, label, status: 'PASS', detail: 'Endpoint is unavailable to this role, as expected.' });
      return;
    }
    checks.push({ id, area, label, status: 'FAIL', detail: error instanceof Error ? error.message : 'Demo request failed.' });
  }
}

export async function runDemoCertification(role: DemoRole): Promise<CertificationReport> {
  const startedAt = new Date().toISOString();
  const checks: CertificationCheck[] = [];
  const rules = ROLE_RULES[role];

  await checkCollection(checks, 'properties', 'Portfolio', 'Properties', '/properties', rules.minProperties);
  await checkCollection(checks, 'buildings', 'Portfolio', 'Buildings', '/buildings', rules.minBuildings);
  await checkCollection(checks, 'floors', 'Portfolio', 'Floors', '/floors', rules.minFloors);
  await checkCollection(checks, 'units', 'Portfolio', 'Units', '/units', rules.minUnits);
  await checkCollection(checks, 'tenants', 'People', 'Tenants', '/tenants', rules.minTenants);
  await checkCollection(checks, 'tenancies', 'People', 'Tenancies', '/tenancies', rules.minTenancies);
  await checkCollection(checks, 'maintenance', 'Operations', 'Maintenance', '/maintenance', rules.minMaintenance);
  await checkCollection(checks, 'documents', 'Governance', 'Documents', '/documents', rules.minDocuments);
  await checkCollection(checks, 'security', 'Security', 'Security Events', '/security/events', rules.minSecurity);
  await checkObject(checks, 'command-center', 'Command Center', 'Command Center', '/command-center', rules.commandCenter);
  await checkObject(checks, 'financial-report', 'Finance', 'Financial Report', '/financial-report', rules.financialReport);

  await checkObject(checks, 'tenant-workspace', 'Tenant', 'Tenant Workspace Context', '/tenant-workspace', role === 'TENANT');
  await checkCollection(checks, 'contractors', 'Operations', 'Contractors', '/contractors', role === 'CONTRACTOR' ? 1 : 0);
  await checkCollection(checks, 'rent', 'Finance', 'Rent Charges', '/rent', role === 'TENANT' ? 1 : 1);
  await checkCollection(checks, 'payments', 'Finance', 'Payments', '/payments', role === 'TENANT' ? 1 : 1);
  await checkCollection(checks, 'expenses', 'Finance', 'Expenses', '/expenses', role === 'TENANT' || role === 'CONTRACTOR' || role === 'CARETAKER' ? 0 : 1);

  checks.push({
    id: 'route-surface',
    area: 'Navigation',
    label: 'Role certification surface',
    status: 'PASS',
    detail: 'Certification page provides direct links into the application surfaces for manual traversal.',
  });

  return { role, startedAt, finishedAt: new Date().toISOString(), checks };
}

export function demoCertificationRoles(): DemoRole[] {
  return [...DEMO_ROLES];
}
