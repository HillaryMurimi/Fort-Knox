import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { buildOpenApiDocument } from '../src/core/api/openapi.js';
import { PERMISSIONS } from '../src/modules/permissions/permission.catalog.js';

async function routeFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await routeFiles(path));
    else if (entry.name.endsWith('.routes.ts')) files.push(path);
  }
  return files;
}

const files = await routeFiles('src/modules');
const unauthenticated = [] as string[];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  if (!source.includes('requireAuth')) unauthenticated.push(file);
}
const normalized = (file: string) => relative(process.cwd(), file).replaceAll('\\', '/');
const allowed = new Set(['src/modules/auth/auth.routes.ts']);
const unexpected = unauthenticated.map(normalized).filter((file) => !allowed.has(file));
if (unexpected.length) throw new Error(`Authorization audit failed: ${unexpected.join(', ')}`);

const keys = [...PERMISSIONS];
if (new Set(keys).size !== keys.length) throw new Error('Duplicate permission keys detected');

const criticalPaths = [
  '/integrations/webhooks/{provider}',
  '/integrations/payments/{paymentId}/provider-initiate',
  '/integrations/payments/{paymentId}/provider-reconcile',
  '/billing/organizations/{organizationId}/subscription',
  '/billing/organizations/{organizationId}/invoices',
  '/organizations/{organizationId}/command-center',
  '/sales/demos/{id}/commands',
  '/sales/demos/{id}/pilot',
  '/sales/organizations/{organizationId}/pilot/import/confirm',
  '/platform-control/sales-intelligence',
];
const paths = Object.keys(buildOpenApiDocument().paths);
const missing = criticalPaths.filter((path) => !paths.includes(path));
if (missing.length) throw new Error(`OpenAPI certification failed: missing ${missing.join(', ')}`);

console.log(JSON.stringify({ status: 'CERTIFIED_STATIC', routeFiles: files.length, permissionCount: keys.length, criticalPaths: criticalPaths.length }, null, 2));
