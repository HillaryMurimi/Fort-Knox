import { z } from 'zod';
import { createUnitSchema } from '../units/unit.schemas.js';
import { propertySetupSchema } from '../properties/property-setup.schemas.js';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i);
export const directoryQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['ALL', 'PILOT', 'PAID', 'INCOMPLETE']).default('ALL'),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();
export const supportRequestSchema = z.object({
  organizationId: objectId,
  ownerUserId: objectId,
  purpose: z.string().trim().min(10).max(500),
  permission: z.literal('PROPERTY_SETUP'),
}).strict();
export const supportUnitSchema = createUnitSchema;
export const supportPropertySetupSchema = propertySetupSchema;
export const pilotGrantSchema = z.object({ ownerUserId: objectId, planKey: z.enum(['CONTROL', 'FORT_KNOX']), durationDays: z.number().int().min(1).max(60) }).strict();
export const pilotExtendSchema = z.object({ additionalDays: z.number().int().min(1).max(60) }).strict();
export const conversionSchema = z.object({ planKey: z.enum(['CONTROL', 'FORT_KNOX']) }).strict();
export const createAssistedOrganizationSchema = z.object({ name: z.string().trim().min(2).max(160), ownerEmail: z.email() }).strict();
