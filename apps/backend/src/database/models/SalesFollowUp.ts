import { Schema, model, type InferSchemaType } from 'mongoose';
import { followUpTriggers } from '../../modules/sales/sales-followup.schemas.js';
const policy = new Schema({
  name: { type: String, required: true }, campaignId: { type: Schema.Types.ObjectId, ref: 'SalesCampaign', required: true }, trigger: { type: String, enum: followUpTriggers, required: true },
  audienceLeadIds: [{ type: Schema.Types.ObjectId, ref: 'SalesLead' }], responsibleId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, mode: { type: String, enum: ['HUMAN_TEMPLATE', 'AI_PROPOSAL'], required: true },
  initialDelayMinutes: { type: Number, required: true }, repeatDelayMinutes: { type: Number, required: true }, maximumAttempts: { type: Number, required: true }, expiresAfterDays: { type: Number, required: true },
  subject: String, body: String, whatsappTemplate: { type: new Schema({ id: String, name: String, language: String, bindings: [String] }, { _id: false }), default: undefined },
  templates: { type: [new Schema({ subject: String, body: String, whatsappTemplate: { type: new Schema({ id: String, name: String, language: String, bindings: [String] }, { _id: false }), default: undefined } }, { _id: false })], default: [] },
  approvalPolicy: { type: String, enum: ['FRESH_HUMAN_EACH_MESSAGE'], required: true }, quietHours: { type: String, enum: ['RECIPIENT_WEEKDAYS_08_20'], required: true }, escalation: { type: String, enum: ['MANUAL_REVIEW'], required: true },
  status: { type: String, enum: ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'], default: 'DRAFT' }, payloadHash: { type: String, required: true }, revision: { type: Number, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }, reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' }, reviewedAt: Date, approvedUntil: Date,
}, { timestamps: true });
policy.index({ status: 1, _id: 1 });
policy.index({ audienceLeadIds: 1, status: 1 }, { name: 'sales_followup_audience' });
export const SalesFollowUpPolicy = model('SalesFollowUpPolicy', policy);
export type SalesFollowUpPolicyRecord = InferSchemaType<typeof policy>;
const step = new Schema({
  index: { type: Number, required: true }, commandId: { type: String, required: true },
  agentRunId: { type: Schema.Types.ObjectId, ref: 'SalesAgentRun' }, originApprovalId: { type: Schema.Types.ObjectId, ref: 'SalesAgentApproval' }, messageId: { type: Schema.Types.ObjectId, ref: 'SalesMessage' },
  status: { type: String, enum: ['DUE', 'AWAITING_AGENT_REVIEW', 'AWAITING_MESSAGE_REVIEW', 'ACCEPTED', 'CANCELLED', 'FAILED'], required: true }, preparedAt: Date, acceptedAt: Date,
}, { _id: false });
const plan = new Schema({
  leadId: { type: Schema.Types.ObjectId, ref: 'SalesLead', required: true }, policyId: { type: Schema.Types.ObjectId, ref: 'SalesFollowUpPolicy', required: true }, policyHash: { type: String, required: true },
  trigger: { type: String, enum: followUpTriggers, required: true }, sourceKey: { type: String, required: true }, sourceId: String, sourceAt: { type: Date, required: true }, sourceKind: { type: String, required: true },
  responsibleId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }, commandId: { type: String, required: true }, commandHash: { type: String, required: true },
  baseline: { type: new Schema({ organizationId: String, stage: { type: String, required: true }, leadStatus: { type: String, required: true }, pipelineRank: { type: Number, required: true }, consentRevision: { type: Number, required: true }, contactHash: { type: String, required: true }, responseHash: { type: String, required: true }, meetingIds: [String], onboardingRevision: Number, verifiedPayment: { type: Boolean, required: true }, properties: { type: Number, default: 0 }, units: { type: Number, default: 0 }, inventoryAt: Date, lastResponseAt: Date, sourceStatus: String }, { _id: false }), required: true }, status: { type: String, enum: ['ACTIVE', 'PAUSED', 'STOPPED', 'CANCELLED', 'EXHAUSTED', 'ESCALATED'], default: 'ACTIVE' }, active: { type: Boolean, default: true },
  steps: { type: [step], default: [] }, nextContactAt: { type: Date, required: true }, expiresAt: { type: Date, required: true }, startedAt: { type: Date, required: true },
  lastEvaluatedAt: Date, reasonCode: String, leaseOwner: String, leaseUntil: Date, generation: { type: Number, default: 0 }, revision: { type: Number, default: 0 },
}, { timestamps: true });
plan.index({ leadId: 1, trigger: 1, sourceKey: 1 }, { unique: true, name: 'sales_followup_source_unique' });
plan.index({ leadId: 1 }, { unique: true, name: 'sales_followup_active_unique', partialFilterExpression: { active: true } });
plan.index({ createdBy: 1, commandId: 1 }, { unique: true, name: 'sales_followup_command_unique' });
plan.index({ active: 1, _id: 1 }, { name: 'sales_followup_scan' });
plan.index({ leadId: 1, createdAt: -1 }); plan.index({ active: 1, nextContactAt: 1 });
export const SalesFollowUp = model('SalesFollowUp', plan);
export type SalesFollowUpRecord = InferSchemaType<typeof plan>;
