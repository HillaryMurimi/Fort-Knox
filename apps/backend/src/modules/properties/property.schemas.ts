import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid MongoDB ObjectId');
const address = z.object({
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  county: z.string().trim().max(100).optional(),
  country: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().max(30).optional()
}).strict();
const location = z.object({ type: z.literal('Point'), coordinates: z.tuple([z.number().gte(-180).lte(180), z.number().gte(-90).lte(90)]) }).strict();

export const createPropertySchema = z.object({
  name: z.string().trim().min(1).max(160), code: z.string().trim().min(1).max(50), description: z.string().trim().max(5000).optional(),
  propertyType: z.enum(['APARTMENT', 'RESIDENTIAL_ESTATE', 'COMMERCIAL', 'MIXED_USE', 'OFFICE', 'RETAIL', 'WAREHOUSE', 'OTHER']),
  address, location: location.optional()
}).strict();
export const updatePropertySchema = createPropertySchema.partial().extend({ status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional() }).strict();
export const propertyIdSchema = z.object({ propertyId: objectId }).strict();
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
