import { z } from 'zod';
const oid=z.string().regex(/^[0-9a-fA-F]{24}$/,'Invalid ObjectId');
export const notificationQuerySchema=z.object({status:z.enum(['QUEUED','SENT','DELIVERED','READ','FAILED','CANCELLED']).optional(),limit:z.coerce.number().int().min(1).max(100).default(50)}).strict();
export const preferenceSchema=z.object({eventType:z.string().min(1).max(160),channels:z.array(z.enum(['IN_APP','EMAIL','SMS','PUSH','WHATSAPP'])).min(1).max(5),enabled:z.boolean()}).strict();
export const createNotificationSchema=z.object({recipientUserId:oid,channel:z.enum(['IN_APP','EMAIL','SMS','PUSH','WHATSAPP']),type:z.string().min(1).max(160),title:z.string().min(1).max(240),body:z.string().min(1).max(10000),data:z.record(z.string(),z.unknown()).default({}),priority:z.enum(['LOW','NORMAL','HIGH','URGENT']).default('NORMAL'),scheduledFor:z.coerce.date().optional(),dedupeKey:z.string().max(500).optional()}).strict();
