import { z } from 'zod';

export const createPlanSchema = z.object({
  key: z.string().min(2).max(50).regex(/^[A-Z0-9_]+$/),
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional(),
  currency: z.string().length(3).default('KES'),
  amount: z.number().nonnegative(),
  billingInterval: z.enum(['MONTH', 'QUARTER', 'YEAR']),
  trialDays: z.number().int().nonnegative().max(365).default(0),
  entitlements: z.object({ maxProperties: z.number().int().min(-1), maxUnits: z.number().int().min(-1), maxUsers: z.number().int().min(-1), maxTenants: z.number().int().min(-1), features: z.array(z.string()).default([]) }),
  active: z.boolean().default(true)
});

export const updatePlanSchema = createPlanSchema.partial().omit({ key: true });
export const createSubscriptionSchema = z.object({ planKey: z.string().min(2).max(50), provider: z.enum(['PAYSTACK', 'INTERNAL']).default('PAYSTACK'), email: z.string().email().optional() });
export const changePlanSchema = z.object({ planKey: z.string().min(2).max(50), atPeriodEnd: z.boolean().default(true) });
export const cancelSubscriptionSchema = z.object({ atPeriodEnd: z.boolean().default(true) });
export const recordUsageSchema = z.object({ metric: z.enum(['PROPERTIES', 'UNITS', 'USERS', 'TENANTS', 'STORAGE_BYTES', 'API_REQUESTS']), periodStart: z.coerce.date(), periodEnd: z.coerce.date(), quantity: z.number().nonnegative(), source: z.enum(['SNAPSHOT', 'EVENT', 'MANUAL', 'SYSTEM']).default('SYSTEM'), sourceRef: z.string().max(200).optional() });
export const listInvoiceSchema = z.object({ status: z.enum(['DRAFT', 'OPEN', 'PAID', 'PAST_DUE', 'VOID', 'UNCOLLECTIBLE']).optional(), page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
