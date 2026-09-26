import { z } from 'zod';
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid MongoDB ObjectId');
const phone = z.string().trim().min(7).max(40);
export const startOnboardingSchema = z.object({ phone, firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), email: z.string().email().optional(), unitId: objectId, expiresInDays: z.number().int().min(1).max(30).default(7) }).strict();
export const verifyOnboardingSchema = z.object({ phone, otp: z.string().regex(/^\d{6}$/, 'OTP must be six digits') }).strict();
export const onboardingParamsSchema = z.object({ onboardingId: objectId }).strict();
export const organizationParamsSchema = z.object({ organizationId: objectId }).strict();
export type StartOnboardingInput = z.infer<typeof startOnboardingSchema>;
export type VerifyOnboardingInput = z.infer<typeof verifyOnboardingSchema>;
