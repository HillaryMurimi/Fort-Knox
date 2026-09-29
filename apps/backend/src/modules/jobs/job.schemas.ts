import { z } from 'zod';
import { paginationQuerySchema } from '../../core/api/pagination.js';

export const enqueueJobSchema=z.object({organizationId:z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),type:z.string().min(1).max(160).refine(value=>!value.startsWith('domain-event.'),'Domain event jobs are system-owned'),payload:z.record(z.string(),z.unknown()).default({}),priority:z.number().int().min(-100).max(100).default(0),availableAt:z.coerce.date().optional(),maxAttempts:z.number().int().min(1).max(20).default(5),dedupeKey:z.string().max(500).refine(value=>!value.startsWith('domain-event:'),'Domain event keys are system-owned').optional()}).strict();
export const jobQuerySchema=paginationQuerySchema.extend({status:z.enum(['QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED','DEAD_LETTER']).optional(),type:z.string().optional()}).strict();
export const replayEventSchema=z.object({eventId:z.uuid()}).strict();
