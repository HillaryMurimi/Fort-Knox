import { z } from "zod";
import { objectId } from "./sales-success.schemas.js";
export const identityDecisionSchema = z
  .object({
    organizationId: objectId,
    decision: z.enum(["LINK", "REJECT"]),
    reason: z.string().trim().min(10).max(2000),
    revision: z.number().int().nonnegative(),
  })
  .strict();
export const mergeProposalSchema = z
  .object({
    sourceId: objectId,
    targetId: objectId,
    sourceRevision: z.number().int().nonnegative(),
    targetRevision: z.number().int().nonnegative(),
    reason: z.string().trim().min(10).max(2000),
  })
  .strict();
export const mergeDecisionSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT", "CANCEL"]),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const lifecycleReplaySchema = z
  .object({
    organizationId: objectId,
    fromBeginning: z.boolean().default(false),
  })
  .strict();
