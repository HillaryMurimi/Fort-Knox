import { z } from 'zod';

const dateString = z.coerce.date();
export const dashboardQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  propertyId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional()
}).strict();

export const alertQuerySchema = z.object({
  propertyId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED']).optional(),
  severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
}).strict();

export const alertStatusSchema = z.object({
  status: z.enum(['ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'])
}).strict();

export const snapshotSchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  propertyId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional()
}).strict();

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type AlertQuery = z.infer<typeof alertQuerySchema>;
