import { z } from "zod";
export const createOrganizationSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .min(2)
    .max(80),
});
export const organizationSettingsSchema = z
  .object({
    managementPhone: z.string().trim().min(7).max(40).optional(),
    managementEmail: z.string().trim().email().max(254).optional(),
    emergencyPhone: z.string().trim().min(7).max(40).optional(),
    officeHours: z.string().trim().min(2).max(160).optional(),
  })
  .strict();
export const updateOrganizationSchema = createOrganizationSchema
  .partial()
  .extend({ settings: organizationSettingsSchema.optional() })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one organization field is required",
  });
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export const addMemberSchema = z.object({
  userId: z.string().regex(/^[a-f\d]{24}$/i),
  roleIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1),
  scope: z
    .object({
      allProperties: z.boolean().default(false),
      propertyIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).default([]),
      buildingIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).default([]),
      unitIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).default([]),
    })
    .default({
      allProperties: false,
      propertyIds: [],
      buildingIds: [],
      unitIds: [],
    }),
});
