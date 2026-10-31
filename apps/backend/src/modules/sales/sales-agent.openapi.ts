import { z } from "zod";
import {
  agentTaskSchema,
  agentConfigurationSchema,
  approvalDecisionSchema,
  runControlSchema,
} from "./sales-agent.schemas.js";
const responses = {
  "200": { description: "Scoped execution or decision result" },
  "201": { description: "Durably queued execution" },
  "400": { description: "Invalid tool arguments or schema" },
  "401": { description: "Authentication required" },
  "403": {
    description:
      "Explicit permission or fresh dual-channel administrator proof required",
  },
  "404": { description: "Record not assigned or unavailable" },
  "409": { description: "State, command, payload or revision conflict" },
  "503": { description: "Provider or feature not configured/enabled" },
};
const op = (summary: string, name?: string, schema?: z.ZodType) => ({
  summary,
  responses,
  ...(name
    ? {
        parameters: [
          { name, in: "path", required: true, schema: { type: "string" } },
        ],
      }
    : {}),
  ...(schema
    ? {
        requestBody: {
          required: true,
          content: { "application/json": { schema: z.toJSONSchema(schema) } },
        },
      }
    : {}),
});
export const salesAgentPaths = {
  "/sales/success/agents/{key}": {
    patch: op(
      "Fresh SUPER_ADMIN configures versioned agent policy and hard daily limits",
      "key",
      agentConfigurationSchema,
    ),
  },
  "/sales/success/agent-runs": {
    get: op("List authorized execution metadata; 20 per page"),
    post: op(
      "Queue idempotent permission-scoped agent task on existing Job worker",
      undefined,
      agentTaskSchema,
    ),
  },
  "/sales/success/agent-runs/{runId}": {
    get: op(
      "Read authorized execution and current exact-payload proposal",
      "runId",
    ),
  },
  "/sales/success/agent-runs/{runId}/control": {
    post: op(
      "Pause, cancel or resume an authorized task; stale in-flight results are fenced",
      "runId",
      runControlSchema,
    ),
  },
  "/sales/success/approvals": {
    get: op("Read bounded approval history metadata"),
  },
  "/sales/success/approvals/{approvalId}/decisions": {
    post: op(
      "Fresh SUPER_ADMIN reviews exact proposal hash; approval is not outbound delivery",
      "approvalId",
      approvalDecisionSchema,
    ),
  },
};
