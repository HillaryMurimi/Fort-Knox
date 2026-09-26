import { z } from 'zod';

export const requestOtpSchema = z.object({ phone: z.string().trim().min(7).max(40) });
export const verifyOtpSchema = z.object({ phone: z.string().trim().min(7).max(40), code: z.string().regex(/^\d{6}$/) });

export const loginSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('email'), email: z.string().email(), password: z.string().min(8).max(200) }).strict(),
  z.object({ method: z.literal('phone'), phone: z.string().trim().min(7).max(40) }).strict(),
]);

export const verifyStepUpSchema = z.object({ email: z.string().email(), code: z.string().regex(/^\d{6}$/) }).strict();

export const bootstrapLandlordSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().email(),
  phone: z.string().trim().min(7).max(40),
  password: z.string().min(12).max(200),
  organization: z.object({ name: z.string().trim().min(2).max(120), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(80).optional() }).strict(),
}).strict();

export const acceptInvitationSchema = z.object({
  token: z.string().min(32).max(256),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(7).max(40),
  email: z.string().email().optional(),
}).strict();
