import { z } from 'zod';
import { isLegacyKesAmount } from '../../core/money/legacy-finance.js';
const oid = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid MongoDB ObjectId');
const evidence = z.array(oid).max(100).default([]);
const money = z.number().finite().nonnegative().refine(isLegacyKesAmount, 'Use an amount representable in KES cents');
export const organizationParamsSchema = z.object({ organizationId: oid }).strict();
export const maintenanceParamsSchema = z.object({ maintenanceId: oid }).strict();
export const createMaintenanceSchema = z.object({
  unitId: oid, tenantId: oid.optional(), title: z.string().trim().min(3).max(180), description: z.string().trim().min(3).max(10000),
  category: z.enum(['PLUMBING','ELECTRICAL','STRUCTURAL','SECURITY','CLEANING','APPLIANCE','HVAC','PEST_CONTROL','OTHER']),
  priority: z.enum(['EMERGENCY','HIGH','MEDIUM','LOW']).default('MEDIUM'), evidenceIds: evidence
}).strict();
export const triageMaintenanceSchema = z.object({ priority: z.enum(['EMERGENCY','HIGH','MEDIUM','LOW']).optional(), notes: z.string().trim().max(5000).optional() }).strict();
export const assignMaintenanceSchema = z.object({ assignedToUserId: oid.optional(), contractorId: oid.optional() }).strict().refine((v) => v.assignedToUserId !== undefined || v.contractorId !== undefined, { message: 'An assignee or contractor is required' });
export const quoteMaintenanceSchema = z.object({ quoteAmount: money, notes: z.string().trim().max(5000).optional(), evidenceIds: evidence }).strict();
export const approveMaintenanceSchema = z.object({ approvedAmount: money.optional(), notes: z.string().trim().max(5000).optional() }).strict();
export const progressMaintenanceSchema = z.object({ status: z.enum(['IN_PROGRESS','COMPLETED']), actualAmount: money.optional(), resolutionNotes: z.string().trim().max(10000).optional(), evidenceIds: evidence }).strict();
export const verifyMaintenanceSchema = z.object({ notes: z.string().trim().max(5000).optional() }).strict();
export const policySchema = z.object({ approvalThreshold: money, emergencyAutoApprove: z.boolean().default(false), autoApproveRoles: z.array(z.string().trim().min(1).max(80)).max(20).default([]), currency: z.literal('KES').default('KES') }).strict();
export type CreateMaintenanceInput = z.infer<typeof createMaintenanceSchema>; export type TriageInput = z.infer<typeof triageMaintenanceSchema>; export type AssignInput = z.infer<typeof assignMaintenanceSchema>; export type QuoteInput = z.infer<typeof quoteMaintenanceSchema>; export type ApproveInput = z.infer<typeof approveMaintenanceSchema>; export type ProgressInput = z.infer<typeof progressMaintenanceSchema>; export type VerifyInput = z.infer<typeof verifyMaintenanceSchema>; export type PolicyInput = z.infer<typeof policySchema>;
