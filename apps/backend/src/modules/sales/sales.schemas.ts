import { z } from 'zod';

export const demoRequestSchema = z.object({
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(7).max(40),
  email: z.string().trim().email().max(240),
  properties: z.coerce.number().int().min(1).max(100000),
  units: z.string().trim().min(1).max(40),
  challenge: z.string().trim().min(5).max(5000),
  source: z.string().trim().max(120).optional(),
  sourceUrl: z.string().url().max(1000).optional(),
}).strict();

export const organizationParamsSchema = z.object({ organizationId: z.string().regex(/^[a-f\\d]{24}$/i) }).strict();

export const propertyOnboardingRequestSchema = z.object({
  properties: z.array(z.object({
    name: z.string().trim().min(2).max(180),
    location: z.string().trim().max(240).optional(),
    buildings: z.number().int().min(1).max(1000),
    units: z.number().int().min(1).max(100000),
  }).strict()).min(1).max(100),
  preferredDate: z.coerce.date().optional(),
  notes: z.string().trim().max(5000).optional(),
}).strict();

export type DemoRequestInput = z.infer<typeof demoRequestSchema>;
export type PropertyOnboardingRequestInput = z.infer<typeof propertyOnboardingRequestSchema>;