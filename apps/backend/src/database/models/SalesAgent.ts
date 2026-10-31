import { Schema, model, type InferSchemaType, type Types } from "mongoose";
import {
  agentKeys,
  toolKeys,
} from "../../modules/sales/sales-agent.schemas.js";
const config = new Schema(
  {
    key: { type: String, enum: agentKeys, required: true, unique: true },
    enabled: { type: Boolean, default: false },
    paused: { type: Boolean, default: true },
    instructionVersion: { type: Number, default: 1 },
    revision: { type: Number, default: 0 },
    maxDailyRuns: { type: Number, default: 20 },
    maxOutputTokens: { type: Number, default: 1500 },
    maxDailyTokens: { type: Number, default: 50000 },
    dailyBudgetMicroUsd: { type: Number, default: 0 },
    usageDay: String,
    dailyRuns: { type: Number, default: 0 },
    reservedTokens: { type: Number, default: 0 },
    reservedMicroUsd: { type: Number, default: 0 },
    usedTokens: { type: Number, default: 0 },
    leaseOwner: String,
    leaseUntil: Date,
  },
  { timestamps: true },
);
export const SalesAgent = model("SalesAgent", config);
const run = new Schema(
  {
    agent: { type: String, enum: agentKeys, required: true },
    leadId: { type: Schema.Types.ObjectId, ref: "SalesLead", required: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    serviceIdentity: { type: String, required: true },
    objective: { type: String, required: true, maxlength: 2000 },
    instructionVersion: { type: Number, required: true },
    status: {
      type: String,
      enum: [
        "QUEUED",
        "RUNNING",
        "AWAITING_APPROVAL",
        "COMPLETED",
        "FAILED",
        "CANCELLED",
        "BLOCKED",
        "PAUSED",
      ],
      default: "QUEUED",
    },
    commandId: { type: String, required: true },
    commandHash: { type: String, required: true },
    attempt: { type: Number, default: 0 },
    leaseOwner: String,
    leaseUntil: Date,
    output: Schema.Types.Mixed,
    providerRequestId: String,
    model: String,
    inputTokens: Number,
    outputTokens: Number,
    costMicroUsd: Number,
    costBasis: { type: String, enum: ["CONFIGURED_RATE_ESTIMATE", "UNKNOWN"] },
    errorCode: String,
    startedAt: Date,
    completedAt: Date,
    providerStatus: String,
  },
  { timestamps: true },
);
run.index(
  { requestedBy: 1, commandId: 1 },
  { unique: true, name: "sales_agent_command_unique" },
);
run.index({ leadId: 1, createdAt: -1 });
run.index({ status: 1, leaseUntil: 1 });
export const SalesAgentRun = model("SalesAgentRun", run);
export type SalesAgentRunRecord = InferSchemaType<typeof run> & {
  _id: Types.ObjectId;
};
const approval = new Schema(
  {
    runId: {
      type: Schema.Types.ObjectId,
      ref: "SalesAgentRun",
      required: true,
    },
    generation: { type: Number, required: true },
    leadId: { type: Schema.Types.ObjectId, ref: "SalesLead", required: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tool: { type: String, enum: toolKeys, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    payloadHash: { type: String, required: true },
    status: {
      type: String,
      enum: [
        "PENDING",
        "APPROVED",
        "REJECTED",
        "CHANGES_REQUESTED",
        "CANCELLED",
        "EXECUTING",
        "COMPLETED",
        "FAILED",
        "EXPIRED",
      ],
      default: "PENDING",
    },
    requiredPermission: { type: String, required: true },
    risk: { type: String, enum: ["REVIEW", "HIGH"], default: "HIGH" },
    expiresAt: { type: Date, required: true },
    decisionBy: { type: Schema.Types.ObjectId, ref: "User" },
    decisionAt: Date,
    decisionReason: String,
    result: Schema.Types.Mixed,
  },
  { timestamps: true },
);
approval.index({ leadId: 1, createdAt: -1 });
approval.index({ status: 1, createdAt: 1 });
approval.index(
  { runId: 1, generation: 1 },
  { unique: true, name: "sales_agent_approval_generation_unique" },
);
export const SalesAgentApproval = model("SalesAgentApproval", approval);
export type SalesAgentApprovalRecord = InferSchemaType<typeof approval> & {
  _id: Types.ObjectId;
};
