import { z } from 'zod';
const oid = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid MongoDB ObjectId');
const evidence = z.array(oid).max(100).default([]);
export const organizationParamsSchema = z.object({ organizationId: oid }).strict();
export const maintenanceParamsSchema = z.object({ maintenanceId: oid }).strict();
export const createMaintenanceSchema = z.object({
  unitId: oid, tenantId: oid.optional(), title: z.string().trim().min(3).max(180), description: z.string().trim().min(3).max(10000),
  category: z.enum(['PLUMBING','ELECTRICAL','STRUCTURAL','SECURITY','CLEANING','APPLIANCE','HVAC','PEST_CONTROL','OTHER']),
  priority: z.enum(['EMERGENCY','HIGH','MEDIUM','LOW']).default('MEDIUM'), evidenceIds: evidence
}).strict();
export const triageMaintenanceSchema = z.object({ priority: z.enum(['EMERGENCY','HIGH','MEDIUM','LOW']).optional(), notes: z.string().trim().max(5000).optional() }).strict();
export const assignMaintenanceSchema = z.object({ assignedToUserId: oid.optional(), contractorId: oid.optional() }).strict().refine((v) => v.assignedToUserId !== undefined || v.contractorId !== undefined, { message: 'An assignee or contractor is required' });
export const quoteMaintenanceSchema = z.object({ quoteAmount: z.number().finite().nonnegative(), notes: z.string().trim().max(5000).optional(), evidenceIds: evidence }).strict();
export const approveMaintenanceSchema = z.object({ approvedAmount: z.number().finite().nonnegative().optional(), notes: z.string().trim().max(5000).optional() }).strict();
export const progressMaintenanceSchema = z.object({ status: z.enum(['IN_PROGRESS','COMPLETED']), actualAmount: z.number().finite().nonnegative().optional(), resolutionNotes: z.string().trim().max(10000).optional(), evidenceIds: evidence }).strict();
export const verifyMaintenanceSchema = z.object({ notes: z.string().trim().max(5000).optional() }).strict();
export const policySchema = z.object({ approvalThreshold: z.number().finite().nonnegative(), emergencyAutoApprove: z.boolean().default(false), autoApproveRoles: z.array(z.string().trim().min(1).max(80)).max(20).default([]), currency: z.string().trim().length(3).default('KES') }).strict();
export type CreateMaintenanceInput = z.infer<typeof createMaintenanceSchema>; export type TriageInput = z.infer<typeof triageMaintenanceSchema>; export type AssignInput = z.infer<typeof assignMaintenanceSchema>; export type QuoteInput = z.infer<typeof quoteMaintenanceSchema>; export type ApproveInput = z.infer<typeof approveMaintenanceSchema>; export type ProgressInput = z.infer<typeof progressMaintenanceSchema>; export type VerifyInput = z.infer<typeof verifyMaintenanceSchema>; export type PolicyInput = z.infer<typeof policySchema>;
