import { z } from 'zod';
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid MongoDB ObjectId');
export const createFloorSchema = z.object({ buildingId: objectId, name: z.string().trim().min(1).max(100), level: z.number().int().min(-10).max(300), code: z.string().trim().min(1).max(50) }).strict();
export const updateFloorSchema = createFloorSchema.omit({ buildingId: true }).partial().extend({ status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional() }).strict();
export const floorParamsSchema = z.object({ floorId: objectId }).strict();
export type CreateFloorInput = z.infer<typeof createFloorSchema>;
export type UpdateFloorInput = z.infer<typeof updateFloorSchema>;
