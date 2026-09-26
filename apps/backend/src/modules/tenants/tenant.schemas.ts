import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid MongoDB ObjectId');
const phone = z.string().trim().min(7).max(40);

export const createTenantSchema = z.object({
  userId: objectId,
  status: z.enum(['PROSPECT', 'ACTIVE', 'INACTIVE', 'BLACKLISTED']).default('PROSPECT'),
  nationalIdLast4: z.string().regex(/^\d{4}$/).optional(),
  dateOfBirth: z.coerce.date().optional(),
  emergencyContact: z.object({ name: z.string().trim().min(1).max(160), phone, relationship: z.string().trim().min(1).max(80) }).optional(),
  notes: z.string().trim().max(5000).optional()
}).strict();

export const updateTenantSchema = createTenantSchema.omit({ userId: true }).partial().strict();
export const tenantParamsSchema = z.object({ tenantId: objectId }).strict();
export const organizationParamsSchema = z.object({ organizationId: objectId }).strict();
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
