import { randomUUID } from 'node:crypto';
import { Types, type ClientSession, type HydratedDocument } from 'mongoose';
import { z } from 'zod';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import { AppError } from '../../core/errors/AppError.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { SalesFollowUp, SalesFollowUpPolicy, type SalesFollowUpRecord } from '../../database/models/SalesFollowUp.js';
import { SalesMessage } from '../../database/models/SalesCommunication.js';
import { SalesAgentRun, SalesAgentApproval } from '../../database/models/SalesAgent.js';
import { SalesActivity } from '../../database/models/SalesActivity.js';
import { Job } from '../../database/models/Job.js';
import { Notification } from '../../database/models/Notification.js';
import { PlatformSwitch } from '../../database/models/PlatformSwitch.js';
import { AuditService } from '../audit/audit.service.js';
import { assertSwitchEnabled } from '../platform-control/platform-control.guard.js';
import { SalesAgentService, payloadHash } from './sales-agent.service.js';
import { SalesAgentRepository, salesTransaction } from './sales-agent.repository.js';
import { assertSuccessPermission, SuccessRepository } from './sales-success.repository.js';
import { SalesConsentService } from './sales-consent.service.js';
import { SalesOutreachService } from './sales-outreach.service.js';
import { assertFollowUpIndexes, followUpActor, followUpCampaign, followUpPolicyPayload } from './sales-followup-policy.service.js';
import { followUpEvidence } from './sales-followup-evidence.repository.js';
import { followUpStopReason } from './sales-followup.policy.js';
import { followUpControlSchema, followUpEnrollSchema, followUpPageSchema } from './sales-followup.schemas.js';
import { nextOutreachWindow, opaqueHash } from './sales-outreach.policy.js';

async function schedule(planId: Types.ObjectId, at: Date, suffix: string, session?: ClientSession) {
  await Job.updateOne({ dedupeKey: 'sales-followup-wake:' + planId + ':' + suffix }, { $setOnInsert: { type: 'sales.followup.wake', payload: { planId: String(planId) }, availableAt: at, maxAttempts: 5 } }, { upsert: true, ...(session ? { session } : {}) });
}
export class SalesFollowUpService {
  static async options(auth: AuthenticatedUser, leadId: string, raw: unknown) {
    assertSuccessPermission(auth, 'sales.followups.manage');
    const lead = await SuccessRepository.load(auth, leadId, 'sales.outreach.prepare'); if (lead.organizationId) assertSuccessPermission(auth, 'sales.onboarding.read');
    const { page } = followUpPageSchema.parse(raw);
    return { items: await SalesFollowUpPolicy.find({ status: 'ACTIVE', audienceLeadIds: lead._id, approvedUntil: { $gt: new Date() } }).select('name trigger mode responsibleId approvedUntil').sort({ createdAt: -1, _id: -1 }).skip((page-1)*20).limit(20).lean(), page, limit: 20, automationEnabled: !!await PlatformSwitch.exists({ key: 'SALES_FOLLOWUPS', enabled: true, mode: 'ON' }) };
  }
  static async list(auth: AuthenticatedUser, leadId: string, raw: unknown) {
    const lead = await SuccessRepository.load(auth, leadId, 'sales.leads.read'); assertSuccessPermission(auth, 'sales.followups.read');
    if (lead.organizationId) assertSuccessPermission(auth, 'sales.onboarding.read');
    const { page } = followUpPageSchema.parse(raw);
    return { items: await SalesFollowUp.find({ leadId: { $in: [lead._id, ...lead.mergedLeadIds] } }).select('-baseline -commandHash -leaseOwner -leaseUntil').sort({ createdAt: -1, _id: -1 }).skip((page-1)*20).limit(20).lean(), page, limit: 20 };
  }
  static async enroll(auth: AuthenticatedUser, leadId: string, raw: unknown, automatic = false) {
    const input = followUpEnrollSchema.parse(raw); await assertFollowUpIndexes(); await assertSwitchEnabled('SALES_FOLLOWUPS');
    assertSuccessPermission(auth, 'sales.followups.manage'); assertSuccessPermission(auth, 'sales.notes.create');
    const lead = await SuccessRepository.load(auth, leadId, 'sales.outreach.prepare');
    if (lead.organizationId) assertSuccessPermission(auth, 'sales.onboarding.read');
    const digest = payloadHash({ ...input, leadId });
    const existing = await SalesFollowUp.findOne({ createdBy: auth.userId, commandId: input.commandId });
    if (existing) { if (existing.commandHash !== digest) throw new AppError(409, 'COMMAND_REUSED', 'Follow-up command belongs to other content'); return { id: String(existing._id), status: existing.status }; }
    const policy = await SalesFollowUpPolicy.findOne({ _id: input.policyId, status: 'ACTIVE', approvedUntil: { $gt: new Date() }, audienceLeadIds: lead._id });
    if (!policy || policy.payloadHash !== payloadHash(followUpPolicyPayload(policy))) throw new AppError(409, 'FOLLOWUP_POLICY_UNAVAILABLE', 'Select an active unchanged policy approved for this customer');
    await followUpActor(policy.responsibleId, leadId, policy.mode);
    const campaign = await followUpCampaign(policy), evidence = await followUpEvidence(leadId, policy.trigger);
    if (!evidence.source || evidence.optedOut) throw new AppError(409, 'FOLLOWUP_NOT_ELIGIBLE', 'Current recorded evidence does not support this follow-up');
    const consent = await SalesConsentService.eligible(lead._id, campaign.channel);
    const expiresAt = new Date(Math.min(Date.now()+policy.expiresAfterDays*86400000, campaign.endsAt.getTime(), policy.approvedUntil!.getTime()));
    const requested = input.nextContactAt ? new Date(input.nextContactAt) : new Date(Math.max(Date.now()+policy.initialDelayMinutes*60000, policy.trigger === 'CUSTOMER_REQUESTED' ? lead.nextActionDate?.getTime() ?? 0 : 0));
    const next = nextOutreachWindow(new Date(Math.max(requested.getTime(), campaign.startsAt.getTime())), consent.event.timezone);
    if (requested <= new Date() || next >= expiresAt) throw new AppError(409, 'FOLLOWUP_WINDOW_UNAVAILABLE', 'Choose a future contact date inside the approved sequence and campaign window');
    try {
      return await salesTransaction(async session => {
        const currentActor = await SalesAgentRepository.principal(auth.userId);
        assertSuccessPermission(currentActor, 'sales.followups.manage'); assertSuccessPermission(currentActor, 'sales.notes.create');
        const currentLead = await SuccessRepository.load(currentActor, leadId, 'sales.outreach.prepare', session);
        if (currentLead.organizationId) assertSuccessPermission(currentActor, 'sales.onboarding.read');
        const [plan] = await SalesFollowUp.create([{ leadId: lead._id, policyId: policy._id, policyHash: policy.payloadHash, trigger: policy.trigger, sourceKey: evidence.source!.key, sourceId: evidence.source!.id, sourceAt: evidence.source!.at, sourceKind: evidence.source!.kind, responsibleId: policy.responsibleId, createdBy: auth.userId, commandId: input.commandId, commandHash: digest, baseline: { ...evidence.baseline, sourceStatus: evidence.source!.status }, nextContactAt: next, expiresAt, startedAt: new Date(), steps: [{ index: 0, commandId: randomUUID(), status: 'DUE' }] }], { session });
        if (!plan) throw new AppError(500, 'FOLLOWUP_CREATE_FAILED', 'Could not reserve the follow-up sequence');
        await schedule(plan._id, next, 'initial', session);
        await SalesActivity.create([{ leadId: lead._id, actorUserId: auth.userId, kind: 'sales.followup.enrolled', text: automatic ? 'Approved policy enrolled recorded source evidence. Every message still requires fresh review.' : input.evidence, resourceId: plan._id, followUpId: plan._id }], { session });
        await AuditService.record({ actorUserId: auth.userId, action: 'sales.followup.enrolled', resourceType: 'SalesFollowUp', resourceId: plan._id, metadata: { policyId: String(policy._id), policyHash: policy.payloadHash, trigger: policy.trigger, sourceKey: evidence.source!.key, sourceKind: evidence.source!.kind, evidenceHash: opaqueHash(input.evidence), nextContactAt: next, automatic, approvalPolicy: policy.approvalPolicy } }, session);
        return { id: String(plan._id), status: plan.status };
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
        const duplicate = await SalesFollowUp.findOne({ leadId: lead._id, $or: [{ sourceKey: evidence.source.key }, { active: true }] });
        throw new AppError(409, 'FOLLOWUP_ALREADY_RECORDED', duplicate?.active ? 'This customer already has an active or paused sequence' : 'This source event already has a follow-up history; review that sequence instead of replaying it');
      }
      throw error;
    }
  }
  static async control(auth: AuthenticatedUser, leadId: string, planId: string, raw: unknown) {
    const input = followUpControlSchema.parse(raw); assertSuccessPermission(auth, 'sales.followups.manage'); assertSuccessPermission(auth, 'sales.notes.create');
    const lead = await SuccessRepository.load(auth, leadId, 'sales.outreach.prepare'); if (lead.organizationId) assertSuccessPermission(auth, 'sales.onboarding.read');
    const initial = await SalesFollowUp.findOne({ _id: planId, leadId: { $in: [lead._id, ...lead.mergedLeadIds] }, revision: input.revision });
    if (!initial) throw new AppError(409, 'FOLLOWUP_CHANGED', 'Reload the current sequence');
    if (['RESUME', 'RESCHEDULE'].includes(input.action)) {
      const current = await followUpEvidence(leadId, initial.trigger, initial.sourceId ?? undefined), stopped = followUpStopReason(initial, current);
      if (stopped) throw new AppError(409, 'FOLLOWUP_SOURCE_CHANGED', 'The customer advanced or the source changed; do not restart the old sequence');
      await this.current({ ...initial.toObject(), status: 'ACTIVE', active: true });
      const lastMessageId = initial.steps.at(-1)?.messageId;
      const lastMessage = lastMessageId ? await SalesMessage.findOne({ _id: lastMessageId, followUpId: initial._id }).select('status deliveryStatus').lean() : null;
      if (lastMessage && (['FAILED', 'UNCERTAIN', 'REJECTED', 'CANCELLED', 'EXPIRED', 'SUPPRESSED'].includes(lastMessage.status) || ['FAILED', 'BOUNCED'].includes(lastMessage.deliveryStatus))) throw new AppError(409, 'FOLLOWUP_MANUAL_RESOLUTION_REQUIRED', 'Resolve the terminal or uncertain message manually; resuming a parent cannot authorize a resend');
      if (initial.status !== 'PAUSED' && initial.status !== 'ESCALATED' && !(initial.status === 'ACTIVE' && input.action === 'RESCHEDULE')) throw new AppError(409, 'FOLLOWUP_STATE_CHANGED', 'Only a paused/escalated sequence can resume');
      if (input.nextContactAt && (new Date(input.nextContactAt) <= new Date() || new Date(input.nextContactAt) >= initial.expiresAt)) throw new AppError(400, 'FOLLOWUP_DATE_INVALID', 'Choose a future date before sequence expiry');
    }
    return salesTransaction(async session => {
      const currentActor = await SalesAgentRepository.principal(auth.userId);
      assertSuccessPermission(currentActor, 'sales.followups.manage'); assertSuccessPermission(currentActor, 'sales.notes.create');
      const currentLead = await SuccessRepository.load(currentActor, leadId, 'sales.outreach.prepare', session);
      if (currentLead.organizationId) assertSuccessPermission(currentActor, 'sales.onboarding.read');
      const plan = await SalesFollowUp.findOne({ _id: planId, leadId: { $in: [lead._id, ...lead.mergedLeadIds] }, revision: input.revision }).session(session);
      if (!plan || (plan.leaseUntil && plan.leaseUntil > new Date())) throw new AppError(409, 'FOLLOWUP_BUSY', 'A worker or another reviewer owns this sequence; refresh before retrying');
      if (['STOPPED', 'CANCELLED', 'EXHAUSTED'].includes(plan.status)) throw new AppError(409, 'FOLLOWUP_TERMINAL', 'This sequence cannot restart; record a new eligible customer request if needed');
      plan.status = input.action === 'CANCEL' ? 'CANCELLED' : input.action === 'ESCALATE' ? 'ESCALATED' : input.action === 'PAUSE' ? 'PAUSED' : 'ACTIVE';
      plan.active = ['ACTIVE', 'PAUSED'].includes(plan.status); plan.reasonCode = 'HUMAN_' + input.action; plan.revision += 1; plan.generation += 1;
      if (input.nextContactAt) plan.nextContactAt = new Date(input.nextContactAt);
      if (['RESUME', 'RESCHEDULE'].includes(input.action) && plan.nextContactAt <= new Date()) plan.nextContactAt = new Date(Date.now()+60000);
      await plan.save({ session });
      if (plan.status === 'ACTIVE') await schedule(plan._id, plan.nextContactAt, 'control:' + plan.generation, session);
      if (plan.status !== 'ACTIVE' || input.action === 'RESCHEDULE') await this.cancelPending(plan, session, input.action === 'RESCHEDULE');
      await SalesActivity.create([{ leadId: lead._id, actorUserId: auth.userId, kind: 'sales.followup.context', text: input.context, resourceId: plan._id, followUpId: plan._id }], { session });
      await AuditService.record({ actorUserId: auth.userId, action: 'sales.followup.controlled', resourceType: 'SalesFollowUp', resourceId: plan._id, metadata: { action: input.action, contextHash: opaqueHash(input.context), status: plan.status, nextContactAt: plan.nextContactAt } }, session);
      return { status: plan.status, revision: plan.revision, nextContactAt: plan.nextContactAt };
    });
  }
  static async current(plan: SalesFollowUpRecord & { _id: Types.ObjectId }) {
    if (plan.status !== 'ACTIVE' || !plan.active) throw new AppError(409, 'FOLLOWUP_NOT_ACTIVE', 'The parent sequence is not active');
    await assertSwitchEnabled('SALES_FOLLOWUPS');
    const policy = await SalesFollowUpPolicy.findOne({ _id: plan.policyId, status: 'ACTIVE', approvedUntil: { $gt: new Date() }, payloadHash: plan.policyHash, audienceLeadIds: plan.leadId });
    if (!policy || policy.payloadHash !== payloadHash(followUpPolicyPayload(policy)) || !policy.reviewedBy) throw new AppError(409, 'FOLLOWUP_POLICY_UNAVAILABLE', 'Parent policy is paused, expired, changed or unavailable');
    AuthorizationService.assertPlatformAdmin(await SalesAgentRepository.principal(policy.reviewedBy));
    const { actor } = await followUpActor(plan.responsibleId, String(plan.leadId), policy.mode);
    const campaign = await followUpCampaign(policy), evidence = await followUpEvidence(String(plan.leadId), plan.trigger, plan.sourceId ?? undefined), stopped = followUpStopReason(plan, evidence);
    if (stopped) throw new AppError(409, 'FOLLOWUP_' + stopped, 'The customer or source advanced; this old follow-up must stop');
    const consent = await SalesConsentService.eligible(plan.leadId, campaign.channel);
    return { actor, policy, campaign, evidence, consent };
  }
  static async assertPreparation(planId: Types.ObjectId, actorId: Types.ObjectId, leadId: string, commandId: string) {
    const plan = await SalesFollowUp.findOne({ _id: planId, leadId, responsibleId: actorId });
    if (!plan || plan.steps.at(-1)?.commandId !== commandId) throw new AppError(409, 'FOLLOWUP_BINDING_CHANGED', 'Task does not match the current governed sequence step');
    await this.current(plan);
  }
  static async assertMessage(planId: Types.ObjectId, actorId: Types.ObjectId, leadId: string, commandId: string, campaignId: Types.ObjectId) {
    const plan = await SalesFollowUp.findOne({ _id: planId, leadId, responsibleId: actorId });
    if (!plan || plan.steps.at(-1)?.commandId !== commandId) throw new AppError(409, 'FOLLOWUP_BINDING_CHANGED', 'Message no longer belongs to the current sequence step');
    const current = await this.current(plan);
    if (String(current.policy.campaignId) !== String(campaignId)) throw new AppError(409, 'FOLLOWUP_CAMPAIGN_CHANGED', 'Sequence campaign differs from the message');
    return plan.nextContactAt;
  }
  static async wake(planId: string) {
    const owner = randomUUID(), now = new Date(); await assertFollowUpIndexes();
    const plan = await SalesFollowUp.findOneAndUpdate({ _id: planId, active: true, $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }] }, { $set: { leaseOwner: owner, leaseUntil: new Date(now.getTime()+300000) } }, { returnDocument: 'after' });
    if (!plan) return { skipped: true };
    try {
      const policy = await SalesFollowUpPolicy.findById(plan.policyId);
      if (!policy || policy.status === 'ARCHIVED') return await this.end(planId, owner, 'STOPPED', 'POLICY_ARCHIVED');
      if (policy.status === 'PAUSED' || plan.status === 'PAUSED') {
        await followUpActor(plan.responsibleId, String(plan.leadId), policy.mode);
        const evidence = await followUpEvidence(String(plan.leadId), plan.trigger, plan.sourceId ?? undefined), reason = followUpStopReason(plan, evidence);
        if (reason) return await this.end(planId, owner, 'STOPPED', reason);
      }
      if (policy.status === 'PAUSED') return await this.end(planId, owner, 'PAUSED', 'POLICY_PAUSED');
      if (plan.status === 'PAUSED') return { paused: true };
      const current = await this.current(plan);
      if (plan.nextContactAt > now) { await schedule(plan._id, plan.nextContactAt, 'due:' + plan.generation + ':' + plan.nextContactAt.getTime()); return { deferred: true }; }
      let step = plan.steps.at(-1);
      if (!step) throw new AppError(409, 'FOLLOWUP_STEP_MISSING', 'The sequence has no bounded step');
      if (step.messageId) {
        const message = await SalesMessage.findOne({ _id: step.messageId, followUpId: plan._id, commandId: step.commandId, requestedBy: plan.responsibleId });
        if (!message) return await this.end(planId, owner, 'ESCALATED', 'MESSAGE_UNAVAILABLE');
        if (message.status === 'SENT' && !message.providerAcceptedAt) return await this.end(planId, owner, 'ESCALATED', 'MESSAGE_ACCEPTANCE_EVIDENCE_MISSING');
        if (message.status === 'SENT' && message.providerAcceptedAt && !['FAILED', 'BOUNCED'].includes(message.deliveryStatus)) {
          if (step.status !== 'ACCEPTED') { step.status = 'ACCEPTED'; step.acceptedAt = message.providerAcceptedAt; await this.saveOwned(plan, owner); }
          if (plan.steps.length >= current.policy.maximumAttempts) return await this.end(planId, owner, 'EXHAUSTED', 'MAXIMUM_ATTEMPTS');
          const next = nextOutreachWindow(new Date(Math.max(Date.now(), (step.acceptedAt ?? now).getTime()+current.policy.repeatDelayMinutes*60000)), current.consent.event.timezone);
          if (next >= plan.expiresAt) return await this.end(planId, owner, 'EXHAUSTED', 'NO_APPROVED_NEXT_WINDOW');
          plan.steps.push({ index: step.index+1, commandId: randomUUID(), status: 'DUE' }); step = plan.steps.at(-1)!; plan.nextContactAt = next;
          await this.saveOwned(plan, owner); await schedule(plan._id, next, 'step:' + step.index); return { nextContactAt: next };
        }
        if (['FAILED', 'UNCERTAIN', 'SUPPRESSED', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(message.status) || ['FAILED', 'BOUNCED'].includes(message.deliveryStatus)) return await this.end(planId, owner, 'ESCALATED', message.status === 'UNCERTAIN' ? 'MESSAGE_OUTCOME_UNCERTAIN_NO_RESEND' : 'MESSAGE_' + message.status);
        await schedule(plan._id, new Date(Date.now()+6*3600000), 'review:' + Math.floor(Date.now()/(6*3600000))); return { awaitingMessageReview: true, messageId: String(message._id) };
      }
      let originApprovalId: string | undefined;
      if (current.policy.mode === 'AI_PROPOSAL') {
        if (!step.agentRunId) {
          const result = await SalesAgentService.create(current.actor, { agent: 'FOLLOW_UP', leadId: String(plan.leadId), commandId: step.commandId, objective: 'Propose one relevant follow-up for recorded trigger ' + plan.trigger + '. Evidence kind: ' + plan.sourceKind + '. Do not invent identity, payment, delivery or completed actions. Human review is required.' }, plan._id);
          step.agentRunId = new Types.ObjectId(result.id); step.status = 'AWAITING_AGENT_REVIEW'; await this.saveOwned(plan, owner);
          await schedule(plan._id, new Date(Date.now()+6*3600000), 'agent:' + Math.floor(Date.now()/(6*3600000))); return { awaitingAgent: true, runId: result.id };
        }
        const run = await SalesAgentRun.findOne({ _id: step.agentRunId, followUpId: plan._id, requestedBy: plan.responsibleId });
        if (!run) return await this.end(planId, owner, 'ESCALATED', 'AGENT_RUN_UNAVAILABLE');
        if (run.status === 'PAUSED' && ['FOLLOWUP_PAUSED', 'FOLLOWUP_ESCALATED'].includes(run.errorCode ?? '') && ['HUMAN_RESUME', 'HUMAN_RESCHEDULE'].includes(plan.reasonCode ?? '')) {
          await SalesAgentService.control(current.actor, String(run._id), { action: 'RESUME', reason: 'Human resumed the source-checked parent follow-up sequence; regenerate a proposal for fresh review.' });
          await schedule(plan._id, new Date(Date.now()+6*3600000), 'agent-resume:' + plan.generation); return { awaitingAgentReview: true };
        }
        const approval = await SalesAgentApproval.findOne({ runId: run._id }).sort({ generation: -1 }).lean();
        if (approval && ['APPROVED', 'COMPLETED'].includes(approval.status)) {
          if (approval.tool !== 'OUTREACH_DRAFT') return await this.end(planId, owner, 'STOPPED', 'AGENT_RECOMMENDED_NON_CONTACT_ACTION');
          originApprovalId = String(approval._id); step.originApprovalId = approval._id;
        } else if (['FAILED', 'BLOCKED', 'CANCELLED'].includes(run.status) || (approval && ['REJECTED', 'CHANGES_REQUESTED', 'CANCELLED', 'EXPIRED', 'FAILED'].includes(approval.status))) return await this.end(planId, owner, 'ESCALATED', run.errorCode ?? 'AGENT_REVIEW_REQUIRED');
        else { await schedule(plan._id, new Date(Date.now()+6*3600000), 'agent-review:' + Math.floor(Date.now()/(6*3600000))); return { awaitingAgentReview: true, runId: String(run._id) }; }
      }
      await this.current(plan);
      const template = current.policy.templates[step.index] ?? current.policy;
      const draft = await SalesOutreachService.prepare(current.actor, String(plan.leadId), { campaignId: String(current.policy.campaignId), commandId: step.commandId, ...(originApprovalId ? { originApprovalId } : template.whatsappTemplate ? { whatsappTemplate: { id: template.whatsappTemplate.id, name: template.whatsappTemplate.name, language: template.whatsappTemplate.language, bindings: [...template.whatsappTemplate.bindings] } } : { ...(template.subject ? { subject: template.subject } : {}), body: template.body }) }, plan._id);
      step.messageId = new Types.ObjectId(draft.id); step.status = 'AWAITING_MESSAGE_REVIEW'; step.preparedAt = new Date();
      await this.saveOwned(plan, owner); await schedule(plan._id, new Date(Date.now()+6*3600000), 'message-review:' + Math.floor(Date.now()/(6*3600000)));
      await AuditService.record({ action: 'sales.followup.message.prepared', resourceType: 'SalesFollowUp', resourceId: plan._id, metadata: { messageId: draft.id, step: step.index, freshHumanMessageApprovalRequired: true, automaticSend: false } });
      return { awaitingMessageReview: true, messageId: draft.id };
    } catch (error) {
      const code = error instanceof AppError ? error.code : 'FOLLOWUP_EVALUATION_FAILED';
      const stop = /^(FOLLOWUP_(CONTACT|CUSTOMER|MEETING_BOOKED|PAYMENT_VERIFIED|ONBOARDING_RESUMED|SOURCE_RESOLVED|SEQUENCE_EXPIRED)|CONTACT_SUPPRESSED)/.test(code);
      return await this.end(planId, owner, stop ? 'STOPPED' : code === 'SERVICE_DISABLED' || code === 'FOLLOWUP_POLICY_UNAVAILABLE' ? 'PAUSED' : 'ESCALATED', code);
    } finally { await SalesFollowUp.updateOne({ _id: planId, leaseOwner: owner }, { $set: { lastEvaluatedAt: new Date() }, $unset: { leaseOwner: 1, leaseUntil: 1 } }); }
  }
  private static async saveOwned(plan: HydratedDocument<SalesFollowUpRecord>, owner: string) {
    if (!plan) return;
    const saved = await SalesFollowUp.updateOne({ _id: plan._id, leaseOwner: owner, active: true, status: 'ACTIVE' }, { $set: { steps: plan.steps.map(step => step.toObject()), nextContactAt: plan.nextContactAt, lastEvaluatedAt: new Date() }, $inc: { revision: 1 } });
    if (!saved.modifiedCount) throw new AppError(409, 'FOLLOWUP_LEASE_LOST', 'The sequence changed during preparation');
  }
  private static async end(planId: string, owner: string, status: 'PAUSED' | 'STOPPED' | 'EXHAUSTED' | 'ESCALATED', reasonCode: string) {
    return salesTransaction(async session => {
      const plan = await SalesFollowUp.findOne({ _id: planId, leaseOwner: owner }).session(session);
      if (!plan) return { skipped: true };
      plan.status = status; plan.active = status === 'PAUSED'; plan.reasonCode = reasonCode; plan.lastEvaluatedAt = new Date(); plan.revision += 1;
      await this.cancelPending(plan, session); await plan.save({ session });
      await SalesActivity.create([{ leadId: plan.leadId, actorKind: 'SYSTEM', kind: 'sales.followup.' + status.toLowerCase(), text: 'Follow-up sequence ' + status.toLowerCase() + ': ' + reasonCode + '. No new contact was dispatched.', resourceId: plan._id, followUpId: plan._id }], { session });
      await AuditService.record({ action: 'sales.followup.' + status.toLowerCase(), resourceType: 'SalesFollowUp', resourceId: plan._id, metadata: { reasonCode, policyId: String(plan.policyId), sourceKey: plan.sourceKey, preparedSteps: plan.steps.length } }, session);
      return { status, reasonCode };
    });
  }
  static async signal(leadId: string) {
    const plans = await SalesFollowUp.find({ leadId, active: true }).select('_id').limit(2).lean();
    for (const plan of plans) await schedule(plan._id, new Date(), 'signal:' + randomUUID());
    const policies = await SalesFollowUpPolicy.find({ status: 'ACTIVE', audienceLeadIds: new Types.ObjectId(leadId), approvedUntil: { $gt: new Date() } }).select('_id').limit(20).lean();
    for (const policy of policies) await Job.updateOne({ dedupeKey: 'sales-followup-detect:' + policy._id + ':' + leadId + ':' + Math.floor(Date.now()/900000) }, { $setOnInsert: { type: 'sales.followup.detect', payload: { policyId: String(policy._id), leadId }, availableAt: new Date(), maxAttempts: 3 } }, { upsert: true });
    return { scheduled: plans.length, policies: policies.length };
  }
  static async detect(policyId: string, leadId: string) {
    if (!await PlatformSwitch.exists({ key: 'SALES_FOLLOWUPS', enabled: true, mode: 'ON' })) return { skipped: true };
    if (await SalesFollowUp.exists({ leadId, active: true })) return { activeSequence: true };
    const policy = await SalesFollowUpPolicy.findOne({ _id: policyId, status: 'ACTIVE', audienceLeadIds: new Types.ObjectId(leadId), approvedUntil: { $gt: new Date() } });
    if (!policy) return { skipped: true };
    const { actor } = await followUpActor(policy.responsibleId, leadId, policy.mode), evidence = await followUpEvidence(leadId, policy.trigger);
    if (!evidence.source || evidence.optedOut || await SalesFollowUp.exists({ leadId, trigger: policy.trigger, sourceKey: evidence.source.key })) return { eligible: false };
    try { return await this.enroll(actor, leadId, { policyId, commandId: randomUUID(), evidence: 'Automatic enrollment under an exact reviewed policy and recorded source evidence; no automatic message approval.' }, true); }
    catch (error) {
      if (error instanceof AppError && ['FOLLOWUP_ALREADY_RECORDED', 'FOLLOWUP_NOT_ELIGIBLE', 'FOLLOWUP_WINDOW_UNAVAILABLE', 'CONTACT_SUPPRESSED', 'OUTREACH_CONSENT_REQUIRED'].includes(error.code)) return { eligible: false, reason: error.code };
      throw error;
    }
  }
  static async startMonitor(session: ClientSession, actor?: Types.ObjectId) {
    const cycleKey = String(Math.floor(Date.now()/900000));
    await Job.updateOne({ dedupeKey: 'sales-followup-scan:' + cycleKey + ':activation:' + randomUUID() }, { $setOnInsert: { type: 'sales.followup.scan', payload: { cycleKey }, availableAt: new Date(), maxAttempts: 5, createdBy: actor } }, { session, upsert: true });
  }
  static async scan(raw: unknown) {
    const input = z.object({ cycleKey: z.string().regex(/^\d{1,10}$/), phase: z.enum(['POLICIES', 'PLANS']).default('POLICIES'), afterId: z.string().regex(/^[a-f\d]{24}$/i).optional() }).strict().parse(raw);
    if (!await PlatformSwitch.exists({ key: 'SALES_FOLLOWUPS', enabled: true, mode: 'ON' })) return { skipped: true };
    const cursor = input.afterId ? { _id: { $gt: new Types.ObjectId(input.afterId) } } : {};
    const policies = input.phase === 'POLICIES' ? await SalesFollowUpPolicy.find({ status: 'ACTIVE', approvedUntil: { $gt: new Date() }, ...cursor }).sort({ _id: 1 }).limit(5).lean() : [];
    const plans = input.phase === 'PLANS' ? await SalesFollowUp.find({ active: true, ...cursor }).select('_id').sort({ _id: 1 }).limit(50).lean() : [];
    await salesTransaction(async session => {
      for (const policy of policies) for (const leadId of policy.audienceLeadIds) await Job.updateOne({ dedupeKey: 'sales-followup-detect:' + policy._id + ':' + leadId + ':' + input.cycleKey }, { $setOnInsert: { type: 'sales.followup.detect', payload: { policyId: String(policy._id), leadId: String(leadId) }, availableAt: new Date(), maxAttempts: 3 } }, { session, upsert: true });
      for (const plan of plans) await schedule(plan._id, new Date(), 'scan:' + input.cycleKey, session);
      const records = input.phase === 'POLICIES' ? policies : plans, limit = input.phase === 'POLICIES' ? 5 : 50, last = records.at(-1), more = records.length === limit && last;
      const phase = more ? input.phase : input.phase === 'POLICIES' ? 'PLANS' : 'POLICIES';
      const nextCycle = !more && input.phase === 'PLANS', cycleKey = nextCycle ? String(Math.floor(Date.now()/900000)+1) : input.cycleKey;
      await Job.updateOne({ dedupeKey: 'sales-followup-scan:' + cycleKey + ':' + phase + ':' + (more ? last._id : 'start') }, { $setOnInsert: { type: 'sales.followup.scan', payload: { cycleKey, phase, ...(more ? { afterId: String(last._id) } : {}) }, availableAt: nextCycle ? new Date(Number(cycleKey)*900000) : new Date(), maxAttempts: 5 } }, { session, upsert: true });
    });
    return { scannedPolicies: policies.length, scannedPlans: plans.length };
  }
  private static async cancelPending(plan: SalesFollowUpRecord & { _id: Types.ObjectId }, session: ClientSession, pauseOnly = false) {
    const messageIds = plan.steps.flatMap(step => step.messageId ? [step.messageId] : []), runIds = plan.steps.flatMap(step => step.agentRunId ? [step.agentRunId] : []);
    if (messageIds.length) {
      const accepted = await SalesMessage.find({ _id: { $in: messageIds }, followUpId: plan._id, status: 'SENT', providerAcceptedAt: { $type: 'date' } }).select('_id providerAcceptedAt').session(session).lean();
      for (const message of accepted) { const step = plan.steps.find(item => String(item.messageId) === String(message._id)); if (step) { step.status = 'ACCEPTED'; step.acceptedAt = message.providerAcceptedAt; } }
      const messages = await SalesMessage.find({ _id: { $in: messageIds }, followUpId: plan._id, status: { $in: ['DRAFT', 'PENDING_APPROVAL', 'QUEUED', 'PAUSED', 'DISPATCHING'] } }).session(session);
      for (const message of messages) { message.status = message.firstAttemptAt ? 'UNCERTAIN' : (['PAUSED', 'ESCALATED'].includes(plan.status) || pauseOnly) ? 'PAUSED' : 'CANCELLED'; if (!message.firstAttemptAt && !['PAUSED', 'ESCALATED'].includes(plan.status) && !pauseOnly) message.dedupeActive = false; message.revision += 1; message.errorCode = 'FOLLOWUP_' + (plan.reasonCode ?? plan.status); await message.save({ session }); await Notification.updateOne({ _id: message.notificationId, salesMessageId: message._id }, { $set: { status: message.firstAttemptAt ? 'FAILED' : 'CANCELLED', failureReason: message.errorCode } }, { session }); }
    }
    if (runIds.length) {
      await SalesAgentRun.updateMany({ _id: { $in: runIds }, requestedBy: plan.responsibleId, status: { $in: ['QUEUED', 'RUNNING', 'AWAITING_APPROVAL', 'PAUSED', 'BLOCKED'] } }, { $set: { status: (['PAUSED', 'ESCALATED'].includes(plan.status) || pauseOnly) ? 'PAUSED' : 'CANCELLED', errorCode: plan.status === 'ESCALATED' ? 'FOLLOWUP_ESCALATED' : (plan.status === 'PAUSED' || pauseOnly) ? 'FOLLOWUP_PAUSED' : 'FOLLOWUP_STOPPED' }, $unset: { leaseOwner: 1, leaseUntil: 1 } }, { session });
      await SalesAgentApproval.updateMany({ runId: { $in: runIds }, requestedBy: plan.responsibleId, status: 'PENDING' }, { $set: { status: 'CANCELLED' } }, { session });
    }
  }
}
