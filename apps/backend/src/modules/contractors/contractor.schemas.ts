import { z } from 'zod';
const oid=z.string().regex(/^[a-f\d]{24}$/i);
export const organizationParamsSchema=z.object({organizationId:oid}).strict(); export const contractorParamsSchema=z.object({contractorId:oid}).strict();
export const createContractorSchema=z.object({userId:oid.optional(),name:z.string().trim().min(2).max(160),phone:z.string().trim().min(3).max(40),email:z.string().email().max(254).optional(),trade:z.string().trim().min(2).max(100),notes:z.string().trim().max(5000).optional()}).strict();
export const updateContractorSchema=createContractorSchema.partial().extend({status:z.enum(['ACTIVE','INACTIVE','SUSPENDED']).optional(),rating:z.number().finite().min(0).max(5).optional()}).strict();
export type CreateContractorInput=z.infer<typeof createContractorSchema>; export type UpdateContractorInput=z.infer<typeof updateContractorSchema>;
