import { z } from 'zod';
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid MongoDB ObjectId');
export const createBuildingSchema = z.object({ propertyId: objectId, name: z.string().trim().min(1).max(160), code: z.string().trim().min(1).max(50), description: z.string().trim().max(3000).optional() }).strict();
export const updateBuildingSchema = createBuildingSchema.omit({ propertyId: true }).partial().extend({ status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(), totalFloors: z.number().int().min(0).max(300).optional() }).strict();
export const buildingParamsSchema = z.object({ buildingId: objectId }).strict();
export const propertyParamsSchema = z.object({ propertyId: objectId }).strict();
export type CreateBuildingInput = z.infer<typeof createBuildingSchema>;
export type UpdateBuildingInput = z.infer<typeof updateBuildingSchema>;
