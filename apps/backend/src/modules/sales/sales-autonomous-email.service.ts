import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { AppError } from '../../core/errors/AppError.js';
import { SalesAgentApproval, SalesAgentRun } from '../../database/models/SalesAgent.js';
import { SalesCampaign } from '../../database/models/SalesCampaign.js';
import { SalesLead } from '../../database/models/SalesLead.js';
import { AuditService } from '../audit/audit.service.js';
import { assertSwitchEnabled } from '../platform-control/platform-control.guard.js';
import { SalesAgentRepository, salesTransaction } from './sales-agent.repository.js';
import { agentOutputSchema } from './sales-agent.schemas.js';
import { authorizeTask, payloadHash } from './sales-agent.service.js';
import { assertCampaignActive } from './sales-campaign.service.js';
import { autonomousEmailTemplateSchema, renderAutonomousEmail } from './sales-autonomous-email.policy.js';
import { SalesOutreachService } from './sales-outreach.service.js';

function commandId(id: Types.ObjectId) {
  const hash = createHash('sha256').update('sales-autonomous-email:' + id).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export class SalesAutonomousEmailService {
  static async process(runId: string) {
    if (!Types.ObjectId.isValid(runId)) throw new AppError(400, 'INVALID_JOB_PAYLOAD', 'Invalid agent run id');
    const run = await SalesAgentRun.findById(runId);
    if (!run || run.agent !== 'SALES_OUTREACH' || !run.campaignId || !run.campaignHash || run.autonomousTemplateSelected !== true || run.followUpId) return { skipped: true };
    const approval = await SalesAgentApproval.findOne({ runId: run._id, generation: run.attempt });
    if (run.status === 'COMPLETED' && approval?.status === 'COMPLETED') return { queued: true, idempotent: true };
    if (run.status !== 'AWAITING_APPROVAL' || !approval || !['PENDING', 'APPROVED'].includes(approval.status) || approval.expiresAt <= new Date()) return { skipped: true };
    const output = agentOutputSchema.safeParse(run.output);
    if (!output.success || output.data.action.tool !== 'OUTREACH_DRAFT' || output.data.action.subject !== null) return { skipped: true };
    const campaign = await SalesCampaign.findById(run.campaignId);
    await assertCampaignActive(campaign);
    if (!campaign || campaign.channel !== 'EMAIL' || campaign.approvedHash !== run.campaignHash) throw new AppError(409, 'AUTONOMOUS_CAMPAIGN_CHANGED', 'Approved campaign changed after agent generation');
    const selected = campaign.autoEmailTemplates?.find(template => template.id === output.data.action.text);
    if (!selected) return { skipped: true };
    const template = autonomousEmailTemplateSchema.parse(selected.toObject());
    await Promise.all(['SALES_AUTONOMOUS_EMAIL', 'SALES_OUTBOUND', 'SALES_EMAIL', 'EMAIL_NOTIFICATIONS', 'SALES_AI_RUNTIME', 'SALES_AGENT_SALES_OUTREACH', 'SALES_CAMPAIGNS'].map(assertSwitchEnabled));
    const actor = await SalesAgentRepository.principal(run.requestedBy);
    await authorizeTask(actor, String(run.leadId), 'SALES_OUTREACH');
    const lead = await SalesLead.findOne({ _id: run.leadId, mergedInto: { $exists: false } }).select('name leadStatus');
    if (!lead) throw new AppError(409, 'CUSTOMER_MERGED', 'Customer changed after generation');
    if (template.segment !== lead.leadStatus) throw new AppError(409, 'AUTONOMOUS_SEGMENT_CHANGED', 'Customer qualification no longer matches the approved template');
    const rendered = renderAutonomousEmail(template, lead.name);
    const action = { ...output.data.action, text: rendered.body, subject: rendered.subject };
    const actionHash = payloadHash(action);
    await salesTransaction(async session => {
      const current = await SalesAgentApproval.findOne({ _id: approval._id, runId: run._id, generation: run.attempt }).session(session);
      if (!current) throw new AppError(409, 'APPROVAL_CHANGED', 'Agent proposal is unavailable');
      if (current.status === 'PENDING') {
        if (current.payloadHash !== payloadHash(output.data.action)) throw new AppError(409, 'APPROVAL_CHANGED', 'Agent proposal changed');
        current.payload = action; current.payloadHash = actionHash; current.status = 'APPROVED'; current.decisionAt = new Date(); current.decisionReason = 'Approved campaign template selected by Sales Outreach agent';
        await current.save({ session });
        await AuditService.record({ action: 'sales.autonomous.email.template.selected', resourceType: 'SalesAgentApproval', resourceId: current._id, metadata: { runId, campaignId: String(campaign._id), campaignHash: campaign.approvedHash, templateId: template.id, actionHash } }, session);
      } else if (current.status !== 'APPROVED' || current.payloadHash !== actionHash || current.decisionReason !== 'Approved campaign template selected by Sales Outreach agent') throw new AppError(409, 'APPROVAL_CHANGED', 'Autonomous template selection changed');
    });
    const message = await SalesOutreachService.prepare(actor, String(run.leadId), { campaignId: String(campaign._id), commandId: commandId(run._id), originApprovalId: String(approval._id) }, undefined, run._id);
    await SalesOutreachService.queueAutonomous(String(message.id), String(run._id), template.id);
    return { queued: true };
  }
}
