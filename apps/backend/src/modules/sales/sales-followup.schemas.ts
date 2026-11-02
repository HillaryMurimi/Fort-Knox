import { z } from 'zod';
import { objectId } from './sales-success.schemas.js';
import { waTemplateInput } from '../../integrations/notifications/sales-whatsapp.provider.js';
export const followUpTriggers = ['QUALIFIED_NOT_CONTACTED', 'DELIVERED_NO_REPLY', 'PROSPECT_REPLIED', 'DEMO_BOOKED', 'DEMO_MISSED', 'DEMO_COMPLETED', 'MEETING_NOT_HELD', 'REGISTRATION_INCOMPLETE', 'EMAIL_VERIFICATION_PENDING', 'CHECKOUT_INCOMPLETE', 'PAYMENT_FAILED', 'SUBSCRIPTION_ACTIVATED', 'PROPERTY_ONBOARDING_NOT_STARTED', 'UNIT_ONBOARDING_STALLED', 'ASSISTANCE_UNRESOLVED', 'CUSTOMER_REQUESTED'] as const;
export const followUpPolicySchema = z.object({
  name: z.string().trim().min(3).max(160), campaignId: objectId, trigger: z.enum(followUpTriggers),
  audienceLeadIds: z.array(objectId).min(1).max(100).refine(ids => new Set(ids).size === ids.length, 'Choose unique customer IDs'),
  responsibleId: objectId, mode: z.enum(['HUMAN_TEMPLATE', 'AI_PROPOSAL']),
  initialDelayMinutes: z.number().int().min(60).max(43200).default(1440), repeatDelayMinutes: z.number().int().min(60).max(43200).default(2880),
  maximumAttempts: z.number().int().min(1).max(5).default(2), expiresAfterDays: z.number().int().min(1).max(90).default(30),
  subject: z.string().trim().min(3).max(200).optional(), body: z.string().trim().min(10).max(8000).optional(), whatsappTemplate: waTemplateInput.optional(),
  templates: z.array(z.object({ subject: z.string().trim().min(3).max(200).optional(), body: z.string().trim().min(10).max(8000).optional(), whatsappTemplate: waTemplateInput.optional() }).strict()).min(1).max(5).optional(),
  approvalPolicy: z.literal('FRESH_HUMAN_EACH_MESSAGE').default('FRESH_HUMAN_EACH_MESSAGE'),
  quietHours: z.literal('RECIPIENT_WEEKDAYS_08_20').default('RECIPIENT_WEEKDAYS_08_20'),
  escalation: z.literal('MANUAL_REVIEW').default('MANUAL_REVIEW'),
}).strict().refine(value => value.mode === 'AI_PROPOSAL' || !!value.body || !!value.whatsappTemplate || !!value.templates?.length, 'Human-template policies require messages or approved WhatsApp templates').refine(value => value.mode !== 'AI_PROPOSAL' || (!value.body && !value.subject && !value.whatsappTemplate && !value.templates), 'AI proposal policies do not accept unused fixed message content').refine(value => !value.templates || (!value.body && !value.subject && !value.whatsappTemplate), 'Choose per-step templates or a single template, not both');
export const followUpPolicyDecisionSchema = z.object({ revision: z.number().int().min(0), payloadHash: z.string().regex(/^[a-f\d]{64}$/), action: z.enum(['ACTIVATE', 'PAUSE', 'ARCHIVE']), reason: z.string().trim().min(20).max(2000) }).strict();
export const followUpEnrollSchema = z.object({ policyId: objectId, commandId: z.uuid(), evidence: z.string().trim().min(20).max(2000), nextContactAt: z.iso.datetime({ offset: true }).optional() }).strict();
export const followUpControlSchema = z.object({ revision: z.number().int().min(0), action: z.enum(['PAUSE', 'RESUME', 'CANCEL', 'RESCHEDULE', 'ESCALATE']), nextContactAt: z.iso.datetime({ offset: true }).optional(), context: z.string().trim().min(20).max(2000) }).strict().refine(value => value.action !== 'RESCHEDULE' || !!value.nextContactAt, 'Choose the next contact date');
export const followUpPageSchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) }).strict();
export const followUpPolicyListSchema = followUpPageSchema.extend({ leadId: objectId.optional() });
