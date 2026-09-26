import { API_CONTRACT_VERSION, API_VERSION } from './api-contract.js';

export function buildOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Property Management Command Center API',
      version: API_VERSION,
      description: 'Versioned REST API for the Property Management Command Center. Authentication uses Bearer access tokens. Mutating requests may use Idempotency-Key.',
      'x-contract-version': API_CONTRACT_VERSION,
    },
    servers: [{ url: '/api/v1' }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      parameters: {
        RequestId: { name: 'X-Request-ID', in: 'header', required: false, schema: { type: 'string' } },
        IdempotencyKey: { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string', minLength: 16, maxLength: 200 } },
        IfMatch: { name: 'If-Match', in: 'header', required: false, description: 'Optional entity version for optimistic concurrency.', schema: { type: 'string' } },
      },
      schemas: {
        SuccessResponse: { type: 'object', required: ['success', 'data'], properties: { success: { const: true }, data: {} } },
        ErrorResponse: { type: 'object', required: ['success', 'error', 'requestId'], properties: { success: { const: false }, error: { type: 'object' }, requestId: { type: 'string' } } },
        PaginationMeta: { type: 'object', required: ['page', 'pageSize', 'total', 'totalPages', 'hasNextPage', 'hasPreviousPage'], properties: { page: { type: 'integer' }, pageSize: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' }, hasNextPage: { type: 'boolean' }, hasPreviousPage: { type: 'boolean' } } },
      },
    },
    paths: {
      '/auth/social/providers': { get: { security: [], summary: 'Configured social sign-in providers' } },
      '/auth/social/{provider}/start': { post: { security: [], summary: 'Start browser-bound social authorization' } },
      '/auth/social/{provider}/callback': { get: { security: [], summary: 'Verify provider authorization and continue owner setup' } },
      '/auth/social/session': { get: { security: [], summary: 'Get pending social owner setup status' } },
      '/auth/social/challenge': { post: { security: [], summary: 'Send social owner phone verification code' } },
      '/auth/social/finish': { post: { security: [], summary: 'Verify phone and issue owner session' } },
      '/health/live': { get: { security: [], summary: 'Liveness probe', responses: { '200': { description: 'Process is alive' } } } },
      '/health/ready': { get: { security: [], summary: 'Readiness probe', responses: { '200': { description: 'API and database are ready' }, '503': { description: 'Not ready' } } } },
      '/operations/readiness': { get: { summary: 'Protected readiness diagnostics', responses: { '200': { description: 'Ready' }, '503': { description: 'Not ready' } } } },
      '/organizations/{organizationId}/command-center': { get: { summary: 'Landlord command center', parameters: [{ name: 'organizationId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Command center data' } } } },
      '/organizations/{organizationId}/decision-automation': { get: { summary: 'Decision automation overview', parameters: [{ name: 'organizationId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Decision automation data' } } } },
      '/organizations/{organizationId}/model-serving/policy': { get: { summary: 'Model serving policy' }, patch: { summary: 'Update model serving policy' } },
      '/billing/plans': { get: { summary: 'List subscription plans' }, post: { summary: 'Create subscription plan' } },
      '/billing/organizations/{organizationId}/subscription': { get: { summary: 'Get organization subscription' }, post: { summary: 'Subscribe organization' } },
      '/billing/organizations/{organizationId}/subscription/change-plan': { post: { summary: 'Change subscription plan' } },
      '/billing/organizations/{organizationId}/subscription/cancel': { post: { summary: 'Cancel subscription' } },
      '/billing/organizations/{organizationId}/invoices': { get: { summary: 'List subscription invoices' } },
      '/billing/organizations/{organizationId}/entitlements': { get: { summary: 'Get subscription entitlements' } },
      '/integrations/payments/{paymentId}/provider-initiate': { post: { summary: 'Initiate an M-Pesa or Paystack payment' } },
      '/integrations/payments/{paymentId}/provider-reconcile': { post: { summary: 'Reconcile provider payment' } },
      '/integrations/organizations/{organizationId}/storage/signed-url': { post: { summary: 'Get provider storage URL' } },
      '/maintenance/{maintenanceId}/evidence': { post: { summary: 'Attach tenant-authorized photo or video evidence to maintenance', requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { media: { type: 'array', maxItems: 5, items: { type: 'string', format: 'binary' } } } } } } } } },
      '/integrations/organizations/{organizationId}/cctv/provider-health': { get: { summary: 'Get external CCTV provider health' } },
      '/integrations/integrations/health': { get: { summary: 'External integration health' } },
      '/integrations/webhooks/{provider}': { post: { security: [], summary: 'Verified M-Pesa or Paystack webhook ingress' } },
    },
  };
}
