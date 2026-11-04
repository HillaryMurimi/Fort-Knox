import { z } from 'zod';
import { objectId } from './sales-success.schemas.js';
export const assistanceListSchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) }).strict();
export const assistanceControlSchema = z.object({
  revision: z.number().int().nonnegative(),
  action: z.enum(['ASSIGN', 'SCHEDULE', 'START', 'COMPLETE', 'CANCEL']),
  reason: z.string().trim().min(20).max(2000),
  assignedTo: objectId.optional(),
  preferredDate: z.iso.datetime({ offset: true }).optional(),
}).strict().refine(value => (value.action === 'ASSIGN') === !!value.assignedTo, 'Assignment requires an assignee, only for ASSIGN')
  .refine(value => (value.action === 'SCHEDULE') === !!value.preferredDate, 'Scheduling requires a date, only for SCHEDULE');
