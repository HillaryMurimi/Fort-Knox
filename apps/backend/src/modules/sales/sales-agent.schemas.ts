import { z } from "zod";
import { objectId } from "./sales-success.schemas.js";
export const agentKeys = [
  "LEAD_RESEARCHER",
  "SALES_OUTREACH",
  "MEETING_COORDINATOR",
  "FOLLOW_UP",
  "ONBOARDING_SUCCESS",
  "CRM_INTELLIGENCE",
] as const;
export const agentKeySchema = z.enum(agentKeys);
export type AgentKey = z.infer<typeof agentKeySchema>;
export const toolKeys = [
  "CRM_NOTE",
  "OUTREACH_DRAFT",
  "MEETING_PROPOSAL",
  "ASSISTANCE_PROPOSAL",
  "LEAD_PROPOSAL",
] as const;
export const agentTools: Record<
  AgentKey,
  readonly (typeof toolKeys)[number][]
> = {
  LEAD_RESEARCHER: ["LEAD_PROPOSAL", "CRM_NOTE"],
  SALES_OUTREACH: ["OUTREACH_DRAFT"],
  MEETING_COORDINATOR: ["MEETING_PROPOSAL", "CRM_NOTE"],
  FOLLOW_UP: ["OUTREACH_DRAFT", "CRM_NOTE"],
  ONBOARDING_SUCCESS: ["ASSISTANCE_PROPOSAL", "OUTREACH_DRAFT"],
  CRM_INTELLIGENCE: ["CRM_NOTE", "ASSISTANCE_PROPOSAL"],
};
// Required nullable fields keep the provider schema strict and prohibit hidden tool arguments.
export const agentOutputSchema = z
  .object({
    summary: z.string().min(1).max(5000),
    evidence: z.array(z.string().max(1000)).max(20),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
    limitation: z.string().max(2000),
    action: z
      .object({
        tool: z.enum(toolKeys),
        reason: z.string().min(1).max(2000),
        text: z.string().min(1).max(10000),
        subject: z.string().max(200).nullable(),
        sourceUrls: z.array(z.string().url().max(1000)).max(10),
      })
      .strict(),
  })
  .strict();
export type AgentOutput = z.infer<typeof agentOutputSchema>;
export const agentTaskSchema = z
  .object({
    agent: agentKeySchema,
    leadId: objectId,
    objective: z.string().trim().min(5).max(2000),
    commandId: z.uuid(),
  })
  .strict();
export const agentConfigurationSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    enabled: z.boolean(),
    paused: z.boolean(),
    maxDailyRuns: z.number().int().min(1).max(1000),
    maxOutputTokens: z.number().int().min(256).max(8000),
    maxDailyTokens: z.number().int().min(256).max(1000000),
    dailyBudgetMicroUsd: z.number().int().min(0).max(1000000000),
  })
  .strict();
export const approvalDecisionSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT", "REQUEST_CHANGES", "CANCEL"]),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
    reason: z.string().trim().min(5).max(1000),
  })
  .strict();
export const runControlSchema = z
  .object({
    action: z.enum(["CANCEL", "PAUSE", "RESUME"]),
    reason: z.string().trim().min(5).max(1000),
  })
  .strict();
export const agentListSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    leadId: objectId.optional(),
    status: z
      .enum([
        "QUEUED",
        "RUNNING",
        "AWAITING_APPROVAL",
        "COMPLETED",
        "FAILED",
        "CANCELLED",
        "BLOCKED",
        "PAUSED",
      ])
      .optional(),
  })
  .strict();
