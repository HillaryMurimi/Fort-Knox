import { z } from 'zod';
import { objectId } from './sales-success.schemas.js';
export const campaignSchema = z.object({
  name: z.string().trim().min(3).max(160), description: z.string().trim().min(10).max(4000),
  audience: z.string().trim().min(10).max(2000), market: z.string().trim().min(2).max(120),
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP']),
  startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }),
  messaging: z.string().trim().min(10).max(12000), selectionCriteria: z.string().trim().min(10).max(2000),
  dailySendLimit: z.number().int().min(1).max(1000), perContactLimit: z.number().int().min(1).max(5),
  followUpDays: z.array(z.number().int().min(1).max(90)).max(4).default([]),
  budgetMicroUsd: z.number().int().min(0).max(1_000_000_000), attributionDays: z.number().int().min(1).max(90).default(30),
}).strict().refine(v => Date.parse(v.endsAt) > Date.parse(v.startsAt), { message: 'Campaign must end after it starts' })
  .refine(v => v.followUpDays.every((n, i) => i === 0 || n > v.followUpDays[i - 1]!), { message: 'Follow-up days must be distinct and increasing' });
export const campaignCommandSchema = z.object({
  revision: z.number().int().nonnegative(), action: z.enum(['SUBMIT', 'APPROVE', 'REJECT', 'ACTIVATE', 'PAUSE', 'RESUME', 'COMPLETE', 'CANCEL']),
  payloadHash: z.string().regex(/^[a-f\d]{64}$/).optional(), reason: z.string().trim().min(10).max(2000),
}).strict();
export const campaignUpdateSchema = z.object({ revision: z.number().int().nonnegative(), campaign: campaignSchema }).strict();
export const trackingLinkSchema = z.object({ leadId: objectId, destination: z.enum(['PLANS', 'SIGNUP', 'DEMO']), expiresAt: z.iso.datetime({ offset: true }) }).strict();
export const trackingResolveSchema = z.object({ token: z.string().regex(/^[\w-]{43}$/) }).strict();
export const trackingVisitSchema = trackingResolveSchema.extend({ consent: z.literal(true), journeyToken: z.string().regex(/^[\w-]{43}$/).optional() }).strict();
export const campaignPageSchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) }).strict();
