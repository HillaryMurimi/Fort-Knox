import { z } from 'zod';
import { campaignSchema, campaignUpdateSchema, campaignCommandSchema, trackingLinkSchema, trackingResolveSchema, trackingVisitSchema } from './sales-campaign.schemas.js';
const responses = { '200': { description: 'Persisted result; no delivery or payment confirmation implied' }, '201': { description: 'Draft or opaque one-time invitation created' }, '400': { description: 'Invalid schema or destination' }, '401': { description: 'Authentication required for governance routes' }, '403': { description: 'SUPER_ADMIN or fresh dual-channel assurance required' }, '404': { description: 'Invitation unavailable, expired or suppressed' }, '409': { description: 'Revision, approval, schedule or state conflict' }, '429': { description: 'Public request limit reached' }, '503': { description: 'Feature or index prerequisite unavailable' } };
const op = (summary: string, schema?: z.ZodType, param?: string, publicRoute = false) => ({
  summary, responses, security: publicRoute ? [] : [{ bearerAuth: [] }],
  ...(param ? { parameters: [{ in: 'path', name: param, required: true, schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } }] } : {}),
  ...(schema ? { requestBody: { required: true, content: { 'application/json': { schema: z.toJSONSchema(schema) } } } } : {}),
});
const page = { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 } };
export const salesCampaignPaths = {
  '/sales/success/campaigns': { get: { ...op('SUPER_ADMIN paginated campaign governance'), parameters: [page] }, post: op('Create bounded campaign draft; does not send', campaignSchema) },
  '/sales/success/campaigns/{id}/commands': { post: op('Versioned campaign state transition; exact hash and fresh assurance for approval', campaignCommandSchema, 'id') },
  '/sales/success/campaigns/{id}': { patch: op('Edit current draft revision only; any prior approval is cleared', campaignUpdateSchema, 'id') },
  '/sales/success/campaigns/{id}/links': { get: { ...op('List invitation metadata without token hashes', undefined, 'id'), parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }, page] }, post: op('Create one-time opaque link for active approved campaign and unsuppressed customer', trackingLinkSchema, 'id') },
  '/sales/success/tracking-links/{linkId}/revoke': { post: op('Revoke invitation and audit; no token required', undefined, 'linkId') },
  '/acquisition/referrals/resolve': { post: op('Public fixed-destination invitation lookup; no analytics, no customer PII', trackingResolveSchema, undefined, true) },
  '/acquisition/referrals/visits': { post: op('Public explicit-consent first-party visit; reuses existing anonymous acquisition journey', trackingVisitSchema, undefined, true) },
};
