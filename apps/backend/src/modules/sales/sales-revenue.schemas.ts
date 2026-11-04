import { z } from 'zod';
import { agentKeys } from './sales-agent.schemas.js';
import { objectId } from './sales-success.schemas.js';
export const minorUnits = z.string().regex(/^(0|[1-9][0-9]{0,14})$/);
export const revenueMetrics = ['COLLECTED_CASH', 'CURRENT_MRR', 'CURRENT_ARR', 'NEW_MRR', 'RECOGNIZED_REVENUE'] as const;
export const revenueQuerySchema = z.object({ from: z.iso.date(), to: z.iso.date(), currency: z.enum(['KES', 'USD', 'NGN', 'GHS', 'ZAR']).default('KES'), campaignId: objectId.optional() }).strict();
export const revenueTargetPolicySchema = z.object({
  name: z.string().trim().min(3).max(120), metric: z.enum(revenueMetrics), currency: z.enum(['KES', 'USD', 'NGN', 'GHS', 'ZAR']),
  period: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']), periodStart: z.iso.date(),
  baselineMinor: minorUnits.refine(value => value !== '0', 'Quota must be positive'),
  scope: z.enum(['DEPARTMENT', 'CAMPAIGN', 'AGENT', 'TEAM']), scopeId: z.string().trim().min(1).max(120).optional(),
  pipelineCoverageBps: z.number().int().min(10000).max(1000000),
  forecastMinor: minorUnits.optional(), forecastRationale: z.string().trim().min(20).max(2000).optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.scope !== 'DEPARTMENT') !== !!value.scopeId) ctx.addIssue({ code: 'custom', message: 'Provide an assignment only for a campaign, agent or team' });
  if (value.scope === 'CAMPAIGN' && !objectId.safeParse(value.scopeId).success) ctx.addIssue({ code: 'custom', message: 'Select a valid campaign' });
  if (value.scope === 'AGENT' && !(agentKeys as readonly string[]).includes(value.scopeId ?? '')) ctx.addIssue({ code: 'custom', message: 'Select a supported agent' });
  if ((value.forecastMinor !== undefined) !== !!value.forecastRationale) ctx.addIssue({ code: 'custom', message: 'A forecast requires a documented assumption' });
  const [year, month, day] = value.periodStart.split('-').map(Number);
  if (!year || year < 2020 || year > 2100 || day !== 1 || (value.period === 'QUARTERLY' && ![1, 4, 7, 10].includes(month ?? 0)) || (value.period === 'ANNUAL' && month !== 1)) ctx.addIssue({ code: 'custom', message: 'Choose the first day of the calendar month, quarter or year (2020-2100)' });
});
export const createRevenueTargetSchema = z.object({ commandId: z.uuid(), policy: revenueTargetPolicySchema, reason: z.string().trim().min(20).max(2000) }).strict();
export const updateRevenueTargetSchema = z.object({ revision: z.number().int().nonnegative(), policy: revenueTargetPolicySchema, reason: z.string().trim().min(20).max(2000) }).strict();
export const revenueTargetPageSchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) }).strict();
export type RevenueTargetPolicy = z.infer<typeof revenueTargetPolicySchema>;
