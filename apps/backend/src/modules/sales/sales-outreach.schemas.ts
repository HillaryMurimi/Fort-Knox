import { z } from 'zod';
import { objectId } from './sales-success.schemas.js';
export const salesChannelSchema = z.enum(['EMAIL', 'SMS', 'WHATSAPP']);
export const salesTimezoneSchema = z.string().min(3).max(80).refine(v => { try { new Intl.DateTimeFormat('en', { timeZone: v }).format(); return true; } catch { return false; } }, { message: 'Use a valid IANA timezone' });
export const consentEvidenceSchema = z.object({
  channel: salesChannelSchema, decision: z.enum(['OPT_IN', 'OPT_OUT']),
  evidence: z.string().trim().min(20).max(2000), timezone: salesTimezoneSchema.default('Africa/Nairobi'),
  acknowledgePreviousSuppression: z.boolean().default(false), revision: z.number().int().nonnegative(),
}).strict();
export const outreachDraftSchema = z.object({
  campaignId: objectId, commandId: z.uuid(), originApprovalId: objectId.optional(),
  subject: z.string().trim().min(3).max(200).refine(v => !/[\r\n]/.test(v)).optional(),
  body: z.string().trim().min(10).max(8000).optional(),
}).strict().refine(v => v.originApprovalId || (v.subject && v.body), { message: 'Provide an approved agent draft or a subject and body for review' });
export const outreachDecisionSchema = z.object({
  action: z.enum(['SUBMIT', 'APPROVE', 'REJECT', 'CANCEL', 'RESUME']), revision: z.number().int().nonnegative(),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/), reason: z.string().trim().min(10).max(2000),
}).strict();
export const outreachPageSchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) }).strict();
export const unsubscribeSchema = z.object({ token: z.string().regex(/^[\w-]{43}$/), confirm: z.literal(true) }).strict();
