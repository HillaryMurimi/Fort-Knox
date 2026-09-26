import { z } from 'zod';
const oid=z.string().regex(/^[a-f\d]{24}$/i); const condition=z.enum(['EXCELLENT','GOOD','FAIR','POOR','DAMAGED','NOT_APPLICABLE']);
const checklist=z.object({item:z.string().trim().min(1).max(180),condition,notes:z.string().trim().max(2000).optional(),evidenceIds:z.array(oid).max(50).default([])}).strict();
const meter=z.object({meterType:z.string().trim().min(1).max(50),reading:z.number().finite().nonnegative(),unit:z.string().trim().max(20).optional()}).strict();
export const organizationParamsSchema=z.object({organizationId:oid}).strict(); export const inspectionParamsSchema=z.object({inspectionId:oid}).strict();
export const createInspectionSchema=z.object({unitId:oid,tenancyId:oid.optional(),maintenanceRequestId:oid.optional(),type:z.enum(['MOVE_IN','MOVE_OUT','ROUTINE','MAINTENANCE','SAFETY','INVENTORY']),overallCondition:z.enum(['EXCELLENT','GOOD','FAIR','POOR','DAMAGED']).optional(),checklist:z.array(checklist).max(200).default([]),meterReadings:z.array(meter).max(50).default([]),notes:z.string().trim().max(10000).optional(),evidenceIds:z.array(oid).max(100).default([])}).strict();
export const completeInspectionSchema=z.object({overallCondition:z.enum(['EXCELLENT','GOOD','FAIR','POOR','DAMAGED']).optional(),notes:z.string().trim().max(10000).optional(),evidenceIds:z.array(oid).max(100).default([])}).strict();
export type CreateInspectionInput=z.infer<typeof createInspectionSchema>; export type CompleteInspectionInput=z.infer<typeof completeInspectionSchema>;
