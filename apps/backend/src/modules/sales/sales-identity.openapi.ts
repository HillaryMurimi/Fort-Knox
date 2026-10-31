import { z } from "zod";
import { historySchema } from "./sales-history.service.js";
import {
  identityDecisionSchema,
  mergeProposalSchema,
  mergeDecisionSchema,
  lifecycleReplaySchema,
} from "./sales-identity.schemas.js";
const responses = {
  "200": {
    description: "Permission-scoped history or reviewed identity result",
  },
  "201": { description: "Exact-payload merge preview prepared" },
  "202": { description: "Replay queued on durable Job worker" },
  "400": { description: "Invalid identifiers, cursor or schema" },
  "401": { description: "Authentication required" },
  "403": {
    description:
      "Permission or recent dual-channel administrator assurance required",
  },
  "404": { description: "Resource not assigned or unavailable" },
  "409": { description: "Identity, revision or proposal conflict" },
  "503": { description: "Lifecycle feature or required indexes unavailable" },
};
const op = (summary: string, parameter?: string, schema?: z.ZodType) => ({
  summary,
  responses,
  ...(parameter
    ? {
        parameters: [
          {
            in: "path",
            name: parameter,
            required: true,
            schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" },
          },
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
export const salesIdentityPaths = {
  "/sales/success/customers/{id}/identity": {
    get: op(
      "SUPER_ADMIN identity-match evidence; delegates receive no organization suggestions",
      "id",
    ),
  },
  "/sales/success/customers/{id}/identity/decisions": {
    post: op(
      "Fresh SUPER_ADMIN reviews verified candidate identity and current customer revision",
      "id",
      identityDecisionSchema,
    ),
  },
  "/sales/success/customers/{id}/history": {
    get: {
      ...op(
        "Cursor-based historical notes or meetings, including reviewed merged identities",
        "id",
      ),
      "x-query-schema": z.toJSONSchema(historySchema),
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } },
        { in: 'query', name: 'kind', required: true, schema: { type: 'string', enum: ['ACTIVITIES', 'MEETINGS'] } },
        { in: 'query', name: 'cursor', schema: { type: 'string', maxLength: 240 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 50, default: 25 } },
      ],
    },
  },
  "/sales/success/merges": {
    post: op(
      "Fresh SUPER_ADMIN prepares contact-checked duplicate merge with immutable financial identity",
      undefined,
      mergeProposalSchema,
    ),
  },
  "/sales/success/merges/{mergeId}/decisions": {
    post: op(
      "Fresh SUPER_ADMIN reviews exact merge hash; stale revisions and linked sources rejected",
      "mergeId",
      mergeDecisionSchema,
    ),
  },
  "/sales/success/lifecycle/replay": {
    post: op(
      "SUPER_ADMIN queues idempotent replay of authoritative sources; no fabricated events",
      undefined,
      lifecycleReplaySchema,
    ),
  },
  "/sales/success/lifecycle/{organizationId}": {
    get: op(
      "SUPER_ADMIN reads projection cursors, watermark and health",
      "organizationId",
    ),
  },
};
