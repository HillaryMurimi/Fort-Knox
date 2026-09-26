import { z } from 'zod';
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const targetRole = z.enum(['PROPERTY_MANAGER', 'CARETAKER', 'CONTRACTOR', 'TENANT']);
export const createInvitationSchema = z.object({
  email: z.string().email().optional(), phone: z.string().trim().min(7).max(40).optional(), role: targetRole,
  propertyIds: z.array(objectId).default([]), buildingIds: z.array(objectId).default([]), unitIds: z.array(objectId).default([]), tenancyId: objectId.optional(), contractorId: objectId.optional(), expiresInDays: z.number().int().min(1).max(30).default(7),
}).strict().refine((v) => Boolean(v.email || v.phone), { message: 'Email or phone is required', path: ['email'] });
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
