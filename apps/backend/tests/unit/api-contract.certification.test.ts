import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../../src/core/api/openapi.js';
import { API_CONTRACT_VERSION, API_VERSION } from '../../src/core/api/api-contract.js';
import { PERMISSIONS } from '../../src/modules/permissions/permission.catalog.js';

describe('final API contract certification', () => {
  it('publishes the current versioned contract', () => {
    const doc = buildOpenApiDocument() as { openapi: string; info: { version: string; 'x-contract-version': string }; paths: Record<string, unknown> };
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.version).toBe(API_VERSION);
    expect(doc.info['x-contract-version']).toBe(API_CONTRACT_VERSION);
  });

  it('publishes all release-critical integration paths', () => {
    const paths = Object.keys(buildOpenApiDocument().paths);
    for (const path of ['/billing/organizations/{organizationId}/subscription', '/billing/organizations/{organizationId}/invoices', '/integrations/payments/{paymentId}/provider-initiate', '/integrations/payments/{paymentId}/provider-reconcile', '/integrations/webhooks/{provider}', '/organizations/{organizationId}/command-center']) expect(paths).toContain(path);
  });

  it('has no duplicate permission keys', () => {
    const keys = [...PERMISSIONS];
    expect(new Set(keys).size).toBe(keys.length);
  });
});
