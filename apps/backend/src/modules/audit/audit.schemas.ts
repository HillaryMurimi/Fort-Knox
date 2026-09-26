import { z } from 'zod';
const oid=z.string().regex(/^[0-9a-fA-F]{24}$/,'Invalid ObjectId');
export const auditQuerySchema=z.object({organizationId:oid,resourceType:z.string().max(80).optional(),resourceId:oid.optional(),actorUserId:oid.optional(),action:z.string().max(160).optional(),from:z.coerce.date().optional(),to:z.coerce.date().optional(),limit:z.coerce.number().int().min(1).max(200).default(50)}).strict();
export const eventQuerySchema=z.object({organizationId:oid,name:z.string().max(160).optional(),aggregateType:z.string().max(80).optional(),aggregateId:oid.optional(),from:z.coerce.date().optional(),to:z.coerce.date().optional(),limit:z.coerce.number().int().min(1).max(200).default(50)}).strict();
