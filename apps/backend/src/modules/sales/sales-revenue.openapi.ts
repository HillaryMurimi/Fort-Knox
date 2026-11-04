import { z } from 'zod';
import { createRevenueTargetSchema, updateRevenueTargetSchema, revenueQuerySchema, revenueTargetPageSchema } from './sales-revenue.schemas.js';
const responses = { '200': { description: 'Evidence-scoped revenue or target result; amounts are decimal minor-unit strings, unavailable actuals are null' }, '201': { description: 'Target recorded' }, '400': { description: 'Invalid date, policy or campaign' }, '401': { description: 'Authentication required' }, '403': { description: 'Platform admin required; writes require fresh dual-channel step-up' }, '404': { description: 'Target not found' }, '409': { description: 'Command or revision conflict' }, '503': { description: 'SALES_ANALYTICS disabled or production indexes missing' } };
const op = (summary: string, body?: z.ZodType, query?: z.ZodObject, target = false) => ({ summary, tags: ['Sales revenue'], security: [{ bearerAuth: [] }], responses,
  parameters: [...(query ? Object.entries(query.shape).map(([name, schema]) => ({ in: 'query', name, required: !schema.isOptional(), schema: z.toJSONSchema(schema) })) : []), ...(target ? [{ in: 'path', name: 'targetId', required: true, schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } }] : [])],
  ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: z.toJSONSchema(body) } } } } : {}),
});
export const salesRevenuePaths = {
  '/sales/success/revenue': { get: op('Current recurring revenue and period gross collections; operations are global CRM counts even when campaign filters cash', undefined, revenueQuerySchema) },
  '/sales/success/revenue/targets': { get: op('Paginated administrator targets (20 per page)', undefined, revenueTargetPageSchema), post: op('Idempotently record a target without changing billing', createRevenueTargetSchema) },
  '/sales/success/revenue/targets/{targetId}': { get: op('Evaluate target and show last 20 audited revisions', undefined, undefined, true), patch: op('Revise a target with optimistic concurrency and audit', updateRevenueTargetSchema, undefined, true) },
};
