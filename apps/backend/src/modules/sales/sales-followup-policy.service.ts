import { salesSmsBody } from '../../integrations/notifications/sales-sms.policy.js';
import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import { AppError } from '../../core/errors/AppError.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { SalesFollowUpPolicy, SalesFollowUp, type SalesFollowUpPolicyRecord } from '../../database/models/SalesFollowUp.js';
import { SalesCampaign } from '../../database/models/SalesCampaign.js';
import { SalesLead } from '../../database/models/SalesLead.js';
import { Job } from '../../database/models/Job.js';
import { assertFreshAdmin } from '../auth/admin-security.js';
import { AuditService } from '../audit/audit.service.js';
import { SalesAgentRepository, salesTransaction } from './sales-agent.repository.js';
import { assertSuccessPermission, SuccessRepository } from './sales-success.repository.js';
import { payloadHash } from './sales-agent.service.js';
import { campaignPayload } from './sales-campaign.service.js';
import { followUpPolicySchema, followUpPolicyDecisionSchema, followUpPolicyListSchema } from './sales-followup.schemas.js';
import { signalSalesFollowUps } from './sales-followup.signal.js';
import { opaqueHash } from './sales-outreach.policy.js';

export function followUpPolicyPayload(value: SalesFollowUpPolicyRecord) {
  return { name: value.name, campaignId: String(value.campaignId), trigger: value.trigger, audienceLeadIds: value.audienceLeadIds.map(String).sort(), responsibleId: String(value.responsibleId), mode: value.mode, initialDelayMinutes: value.initialDelayMinutes, repeatDelayMinutes: value.repeatDelayMinutes, maximumAttempts: value.maximumAttempts, expiresAfterDays: value.expiresAfterDays, subject: value.subject ?? null, body: value.body ?? null, whatsappTemplate: value.whatsappTemplate ? { id: value.whatsappTemplate.id, name: value.whatsappTemplate.name, language: value.whatsappTemplate.language, bindings: [...value.whatsappTemplate.bindings] } : null, templates: value.templates.map(item => ({ subject: item.subject ?? null, body: item.body ?? null, whatsappTemplate: item.whatsappTemplate ? { id: item.whatsappTemplate.id, name: item.whatsappTemplate.name, language: item.whatsappTemplate.language, bindings: [...item.whatsappTemplate.bindings] } : null })), approvalPolicy: value.approvalPolicy, quietHours: value.quietHours, escalation: value.escalation };
}
export async function assertFollowUpIndexes() {
  if (env.NODE_ENV !== 'production') return;
  for (const [model, name, key] of [[SalesFollowUp, 'sales_followup_source_unique', { leadId: 1, trigger: 1, sourceKey: 1 }], [SalesFollowUp, 'sales_followup_active_unique', { leadId: 1 }], [SalesFollowUp, 'sales_followup_command_unique', { createdBy: 1, commandId: 1 }], [Job, 'dedupeKey_1', { dedupeKey: 1 }]] as const) {
    const indexes = await model.collection.indexes().catch(() => []);
    if (!indexes.some(item => item.name === name && item.unique && JSON.stringify(item.key) === JSON.stringify(key) && (name !== 'sales_followup_active_unique' || item.partialFilterExpression?.active === true))) throw new AppError(503, 'SALES_INDEXES_REQUIRED', 'Install follow-up source, active sequence, command and Job indexes first');
  }
}
export async function followUpActor(userId: Types.ObjectId, leadId: string, mode: string) {
  const actor = await SalesAgentRepository.principal(userId);
  assertSuccessPermission(actor, 'sales.followups.manage'); assertSuccessPermission(actor, 'sales.notes.read'); assertSuccessPermission(actor, 'sales.notes.create'); assertSuccessPermission(actor, 'sales.meetings.read'); assertSuccessPermission(actor, 'sales.outreach.read');
  const lead = await SuccessRepository.load(actor, leadId, 'sales.outreach.prepare');
  if (lead.organizationId) assertSuccessPermission(actor, 'sales.onboarding.read');
  if (mode === 'AI_PROPOSAL') { assertSuccessPermission(actor, 'sales.agents.execute'); assertSuccessPermission(actor, 'sales.agents.read'); }
  return { actor, lead };
}
export async function followUpCampaign(policy: SalesFollowUpPolicyRecord) {
  const campaign = await SalesCampaign.findById(policy.campaignId);
  if (!campaign || campaign.status !== 'ACTIVE' || campaign.endsAt <= new Date() || campaign.approvedHash !== payloadHash(campaignPayload(campaign))) throw new AppError(409, 'FOLLOWUP_CAMPAIGN_UNAVAILABLE', 'Use an active, unchanged approved campaign');
  if (campaign.channel === 'WHATSAPP' && policy.mode !== 'HUMAN_TEMPLATE') throw new AppError(400, 'FOLLOWUP_WHATSAPP_TEMPLATE_REQUIRED', 'WhatsApp sequences use reviewed templates, never arbitrary generated text');
  if (policy.mode === 'HUMAN_TEMPLATE') {
    const definitions = policy.templates.length ? policy.templates : [policy];
    if (definitions.length !== policy.maximumAttempts) throw new AppError(400, 'FOLLOWUP_DISTINCT_STEPS_REQUIRED', 'Provide one distinct reviewed template for every permitted contact attempt');
    const fingerprints = definitions.map(item => payloadHash({ body: item.body ?? null, whatsappTemplate: item.whatsappTemplate ? { id: item.whatsappTemplate.id, language: item.whatsappTemplate.language, bindings: [...item.whatsappTemplate.bindings] } : null }));
    if (new Set(fingerprints).size !== fingerprints.length) throw new AppError(400, 'FOLLOWUP_REPEATED_TEMPLATE', 'Repeated follow-up content is not permitted');
    for (const item of definitions) {
      if (campaign.channel === 'SMS' && item.body) salesSmsBody(item.body);
      if (campaign.channel === 'WHATSAPP' && (!item.whatsappTemplate || item.subject || item.body)) throw new AppError(400, 'FOLLOWUP_WHATSAPP_TEMPLATE_REQUIRED', 'WhatsApp steps require approved templates with controlled bindings');
      if (campaign.channel !== 'WHATSAPP' && item.whatsappTemplate) throw new AppError(400, 'FOLLOWUP_TEMPLATE_CHANNEL_MISMATCH', 'Template and campaign channels differ');
      if (campaign.channel !== 'WHATSAPP' && (!item.body || (campaign.channel === 'EMAIL' && !item.subject))) throw new AppError(400, 'FOLLOWUP_CONTENT_REQUIRED', 'Record each exact step body and required email subject');
    }
  }
  return campaign;
}
export class SalesFollowUpPolicyService {
  static async list(auth: AuthenticatedUser, raw: unknown) {
    AuthorizationService.assertPlatformAdmin(auth); const { page, leadId } = followUpPolicyListSchema.parse(raw);
    return { items: await SalesFollowUpPolicy.find(leadId ? { audienceLeadIds: new Types.ObjectId(leadId) } : {}).sort({ createdAt: -1, _id: -1 }).skip((page-1)*20).limit(20).lean(), page, limit: 20 };
  }
  static async create(auth: AuthenticatedUser, raw: unknown) {
    assertFreshAdmin(auth); const input = followUpPolicySchema.parse(raw);
    const customers = await SalesLead.countDocuments({ _id: { $in: input.audienceLeadIds }, mergedInto: { $exists: false } });
    if (customers !== input.audienceLeadIds.length) throw new AppError(409, 'FOLLOWUP_AUDIENCE_CHANGED', 'Select existing canonical customers only');
    const policy = new SalesFollowUpPolicy({ ...input, createdBy: auth.userId }); policy.payloadHash = payloadHash(followUpPolicyPayload(policy));
    await followUpCampaign(policy);
    for (const leadId of input.audienceLeadIds) await followUpActor(policy.responsibleId, leadId, policy.mode);
    const record = policy.toObject();
    return salesTransaction(async session => {
      AuthorizationService.assertPlatformAdmin(await SalesAgentRepository.principal(auth.userId));
      const [created] = await SalesFollowUpPolicy.create([record], { session });
      if (!created) throw new AppError(500, 'FOLLOWUP_POLICY_CREATE_FAILED', 'Could not record the reviewed policy draft');
      await AuditService.record({ actorUserId: auth.userId, action: 'sales.followup.policy.prepared', resourceType: 'SalesFollowUpPolicy', resourceId: created._id, metadata: { payloadHash: created.payloadHash, audienceCount: input.audienceLeadIds.length, trigger: created.trigger, mode: created.mode, freshMessageApprovalRequired: true } }, session);
      return { id: String(created._id), status: created.status, payloadHash: created.payloadHash, revision: created.revision };
    });
  }
  static async decide(auth: AuthenticatedUser, id: string, raw: unknown) {
    assertFreshAdmin(auth); const input = followUpPolicyDecisionSchema.parse(raw); await assertFollowUpIndexes();
    const initial = await SalesFollowUpPolicy.findOne({ _id: id, revision: input.revision, payloadHash: input.payloadHash });
    if (!initial || initial.payloadHash !== payloadHash(followUpPolicyPayload(initial))) throw new AppError(409, 'FOLLOWUP_POLICY_CHANGED', 'Reload the exact policy before reviewing');
    const campaign = input.action === 'ACTIVATE' ? await followUpCampaign(initial) : null;
    if (input.action === 'ACTIVATE') for (const leadId of initial.audienceLeadIds) await followUpActor(initial.responsibleId, String(leadId), initial.mode);
    return salesTransaction(async session => {
      AuthorizationService.assertPlatformAdmin(await SalesAgentRepository.principal(auth.userId));
      const policy = await SalesFollowUpPolicy.findOne({ _id: id, revision: input.revision, payloadHash: input.payloadHash }).session(session);
      if (!policy || policy.status === 'ARCHIVED' || (input.action === 'ACTIVATE' && !['DRAFT', 'PAUSED'].includes(policy.status))) throw new AppError(409, 'FOLLOWUP_POLICY_CHANGED', 'Policy no longer allows that decision');
      policy.status = input.action === 'ACTIVATE' ? 'ACTIVE' : input.action === 'PAUSE' ? 'PAUSED' : 'ARCHIVED';
      if (campaign) { policy.reviewedBy = auth.userId; policy.reviewedAt = new Date(); policy.approvedUntil = new Date(Math.min(campaign.endsAt.getTime(), Date.now()+90*86400000)); }
      policy.revision += 1; await policy.save({ session });
      for (const leadId of policy.audienceLeadIds) await signalSalesFollowUps(leadId, 'policy:' + id + ':' + policy.revision, session);
      await AuditService.record({ actorUserId: auth.userId, action: 'sales.followup.policy.reviewed', resourceType: 'SalesFollowUpPolicy', resourceId: policy._id, metadata: { action: input.action, payloadHash: input.payloadHash, reasonHash: opaqueHash(input.reason), status: policy.status, audienceCount: policy.audienceLeadIds.length } }, session);
      return { status: policy.status, revision: policy.revision, approvedUntil: policy.approvedUntil };
    });
  }
}
