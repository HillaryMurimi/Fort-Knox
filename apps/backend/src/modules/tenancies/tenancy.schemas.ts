import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid MongoDB ObjectId');
const money = z.number().finite().nonnegative();
const date = z.coerce.date();

/**
 * The raw object shape. No refinements here — Zod v4 refuses to let `.omit()`,
 * `.pick()`, `.partial()`, or `.extend()` run on a schema that has refinements,
 * because dropping the refinement silently is almost always a bug.
 *
 * Base shape first, refinements on the derived schemas.
 */
const tenancyBaseSchema = z
  .object({
    tenantId: objectId,
    unitId: objectId,
    leaseNumber: z.string().trim().min(1).max(80),
    startDate: date,
    endDate: date.optional(),
    monthlyRent: money,
    serviceCharge: money.optional(),
    depositAmount: money.optional(),
    billingDay: z.number().int().min(1).max(28).default(1),
    noticePeriodDays: z.number().int().min(0).max(365).default(30),
    signedLeaseDocumentId: objectId.optional(),
    notes: z.string().trim().max(5000).optional(),
  })
  .strict();

export const createTenancySchema = tenancyBaseSchema.superRefine((v, ctx) => {
  if (v.endDate && v.endDate < v.startDate) {
    ctx.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: 'endDate must be on or after startDate',
    });
  }
});

/**
 * The refinement on `createTenancySchema` depends on `startDate`, which the
 * update payload doesn't carry — so it can't be re-applied here. In Zod v3
 * `.omit()` silently dropped the refinement; in v4 we make that intent
 * explicit by deriving from the un-refined base.
 */
export const updateTenancySchema = tenancyBaseSchema
  .omit({ tenantId: true, unitId: true, leaseNumber: true, startDate: true })
  .partial()
  .strict();

export const tenancyParamsSchema = z.object({ tenancyId: objectId }).strict();
export const organizationParamsSchema = z.object({ organizationId: objectId }).strict();
export type CreateTenancyInput = z.infer<typeof createTenancySchema>;
export type UpdateTenancyInput = z.infer<typeof updateTenancySchema>;