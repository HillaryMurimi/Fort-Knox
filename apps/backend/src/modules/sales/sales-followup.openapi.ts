import { z } from 'zod';
import { followUpPolicySchema, followUpPolicyDecisionSchema, followUpEnrollSchema, followUpControlSchema } from './sales-followup.schemas.js';
const operation = (summary: string, ids: string[], body?: z.ZodType) => ({
  summary, security: [{ bearerAuth: [] }],
  parameters: [...ids.map(name => ({ name, in: 'path', required: true, schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } })), ...(!body ? [{ name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 } }] : [])],
  ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: z.toJSONSchema(body) } } } } : {}),
  responses: { 200: { description: 'Scoped bounded result or revision-bound decision' }, 201: { description: 'Durably recorded policy or sequence' }, 400: { description: 'Invalid date, content, trigger or controlled template' }, 401: { description: 'Authentication required' }, 403: { description: 'Explicit constituent permissions, assignment or fresh dual-channel administrator proof required' }, 404: { description: 'Customer or resource unavailable in current scope' }, 409: { description: 'Source changed, sequence already recorded, changed hash/revision, consent unavailable or unsafe retry' }, 503: { description: 'Optional control disabled or prerequisite unavailable' } },
});
export const salesFollowUpPaths = {
  '/sales/success/followups/policies': {
    get: { ...operation('Administrator policy history; page size 20, optional leadId cohort filter', []), parameters: [...operation('', []).parameters, { name: 'leadId', in: 'query', required: false, schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } }] },
    post: operation('Create immutable policy draft with a bounded exact customer cohort; no activation or delivery', [], followUpPolicySchema),
  },
  '/sales/success/followups/policies/{policyId}/decisions': { post: operation('Fresh administrator review of exact policy hash and revision; activation can enroll current eligible sources, never approve messages', ['policyId'], followUpPolicyDecisionSchema) },
  '/sales/success/customers/{id}/followups': { get: operation('Assigned customer sequence history; constituent onboarding permission required for linked organizations', ['id']), post: operation('Enroll current source under approved policy with command idempotency and one active sequence per customer', ['id'], followUpEnrollSchema) },
  '/sales/success/customers/{id}/followups/options': { get: operation('Minimal approved customer-cohort policies and actual automation switch state', ['id']) },
  '/sales/success/customers/{id}/followups/{planId}/controls': { post: operation('Pause, resume, reschedule, cancel or escalate; current evidence and revision checked, no baseline reset or automatic resend', ['id', 'planId'], followUpControlSchema) },
};
