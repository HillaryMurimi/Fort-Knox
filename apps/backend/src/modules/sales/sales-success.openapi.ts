import { z } from "zod";
import * as s from "./sales-success.schemas.js";
import { calendarCommandSchema } from './sales-calendar.schemas.js';
const id = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" },
};
const responses = {
  "200": { description: "Permission-scoped persisted result" },
  "201": { description: "Created and audited" },
  "400": { description: "Invalid input" },
  "401": { description: "Authentication required" },
  "403": { description: "Permission or fresh administrator proof required" },
  "404": { description: "Record not assigned or missing" },
  "409": { description: "Identity, schedule or revision conflict" },
  "503": { description: "Required production indexes or authorized provider availability missing" },
};
const body = (schema: z.ZodType) => ({
  required: true,
  content: {
    "application/json": {
      schema: z.toJSONSchema(schema, { unrepresentable: "any" }),
    },
  },
});
const operation = (
  summary: string,
  schema?: z.ZodType,
  parameters: unknown[] = [id],
) => ({
  summary,
  description:
    "SUPER_ADMIN or explicit sales permission; delegates are restricted to assigned customers. Writes are transactional and audited. No outbound delivery or AI execution.",
  parameters,
  ...(schema ? { requestBody: body(schema) } : {}),
  responses,
});
export const salesSuccessPaths = {
  '/sales/success/customers/{id}/calendar/availability': { get: { ...operation('Query actual authorized representative calendar and local holds; at most seven days; no reservation or invented slots'), parameters: [id, ...['representativeId', 'startsAt', 'endsAt'].map(name => ({ in: 'query', name, required: true, schema: { type: 'string' } }))] } },
  '/sales/success/customers/{id}/meetings/{meetingId}/calendar': { post: { ...operation('Queue revision-bound reviewed calendar create/reschedule/cancel, or reconcile actual provider facts; mutations require fresh administrator proof', calendarCommandSchema, [id, { ...id, name: 'meetingId' }]), responses: { ...responses, '202': { description: 'Durable calendar command queued; no external confirmation until provider evidence is recorded' } } } },
  "/sales/success/customers": {
    get: {
      ...operation("List assigned customers (20 per page)", undefined, []),
      parameters: [
        {
          name: "page",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 10000 },
        },
        {
          name: "search",
          in: "query",
          schema: { type: "string", maxLength: 120 },
        },
        {
          name: "stage",
          in: "query",
          schema: { type: "string", maxLength: 80 },
        },
      ],
    },
    post: operation(
      "Create customer; detect matching email or phone",
      s.customerSchema,
      [],
    ),
  },
  "/sales/success/customers/{id}": {
    get: operation(
      "Customer 360; notes and meetings require their own read permissions",
    ),
    patch: operation(
      "Update qualification, next action and consent using revision",
      s.updateCustomerSchema,
    ),
  },
  "/sales/success/customers/{id}/notes": {
    post: operation(
      "Append a human note without overwriting prior entries",
      s.noteSchema,
    ),
  },
  "/sales/success/customers/{id}/assignment": {
    post: operation(
      "SUPER_ADMIN assigns an active representative",
      s.assignmentSchema,
    ),
  },
  "/sales/success/customers/{id}/organization": {
    post: operation(
      "SUPER_ADMIN links a verified customer identity to an existing organization",
      s.linkCustomerSchema,
    ),
  },
  "/sales/success/customers/{id}/meetings": {
    post: operation(
      "Reserve internal meeting with conflict prevention; no calendar invitation",
      s.meetingSchema,
    ),
  },
  "/sales/success/customers/{id}/meetings/{meetingId}": {
    patch: operation(
      "Record final meeting outcome and optional append-only notes",
      s.meetingOutcomeSchema,
      [id, { ...id, name: "meetingId" }],
    ),
  },
  "/sales/success/customers/{id}/onboarding": {
    get: operation(
      "Read actual inventory, trusted payment evidence and rule-based health factors",
    ),
  },
  "/sales/success/customers/{id}/agent-context": {
    post: operation(
      "Audit permission-aware context retrieval; does not execute an agent",
      z
        .object({
          agent: z.enum([
            "LEAD_RESEARCHER",
            "SALES_OUTREACH",
            "MEETING_COORDINATOR",
            "FOLLOW_UP",
            "ONBOARDING_SUCCESS",
            "CRM_INTELLIGENCE",
          ]),
        })
        .strict(),
    ),
  },
  "/sales/success/agents": {
    get: operation(
      "Read six agent definitions and truthful unavailable integration states",
      undefined,
      [],
    ),
  },
  "/sales/success/permissions": {
    post: operation(
      "Recent dual-channel SUPER_ADMIN proof: replace or revoke per-user sales role",
      z
        .object({
          organizationId: s.objectId,
          userId: s.objectId,
          permissions: z
            .array(z.enum(s.salesPermissions))
            .max(s.salesPermissions.length),
        })
        .strict(),
      [],
    ),
  },
};
