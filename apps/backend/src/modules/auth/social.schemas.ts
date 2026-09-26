import { z } from 'zod';

export const socialSignupSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Use an international phone number, such as +254700000000.'),
  organizationName: z.string().trim().min(2).max(120),
}).strict();
export const socialCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();
export const socialLinkSchema = z.object({
  existingAccount: z.literal(true),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(200),
}).strict();
