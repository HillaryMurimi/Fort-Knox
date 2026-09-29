import { z } from 'zod';
import { isLegacyKesAmount } from '../../core/money/legacy-finance.js';
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid MongoDB ObjectId');
export const unitType = z.enum(['SINGLE_ROOM', 'BEDSITTER', 'STUDIO', 'ONE_BEDROOM', 'TWO_BEDROOM', 'THREE_PLUS_BEDROOM', 'FOUR_BEDROOM', 'FIVE_PLUS_BEDROOM', 'MAISONETTE', 'SHOP', 'OFFICE', 'RETAIL', 'COMMERCIAL_UNIT', 'OTHER']);
export const createUnitSchema = z.object({
  floorId: objectId, name: z.string().trim().min(1).max(100), code: z.string().trim().min(1).max(50), unitType,
  unitTypeLabel: z.string().trim().min(1).max(100).optional(),
  monthlyRent: z.number().finite().nonnegative().refine(isLegacyKesAmount), serviceCharge: z.number().finite().nonnegative().refine(isLegacyKesAmount).optional(), areaSqm: z.number().positive().optional(),
  bedrooms: z.number().int().nonnegative().max(100).optional(), bathrooms: z.number().int().nonnegative().max(100).optional(),
  amenities: z.array(z.string().trim().min(1).max(100)).max(100).optional()
}).strict();
export const updateUnitSchema = createUnitSchema.omit({ floorId: true }).partial().extend({
  status: z.enum(['VACANT', 'OCCUPIED', 'RESERVED', 'MAINTENANCE', 'INACTIVE']).optional()
}).strict();
export const unitParamsSchema = z.object({ unitId: objectId }).strict();
export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
