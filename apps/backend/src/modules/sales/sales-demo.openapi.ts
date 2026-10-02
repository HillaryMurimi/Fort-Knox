import { z } from "zod";
import {
  prepareDemoSchema,
  commandSchema,
  startPilotSchema,
  pilotInsightSchema,
} from "./sales-demo.schemas.js";
import {
  previewImportSchema,
  confirmImportSchema,
} from "./pilot-import.service.js";
const id = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" },
};
const org = { ...id, name: "organizationId" };
const body = (schema: z.ZodType) => ({
  required: true,
  content: { "application/json": { schema: z.toJSONSchema(schema) } },
});
const responses = {
  "200": { description: "Scoped persisted result" },
  "201": { description: "Created" },
  "400": { description: "Invalid input" },
  "401": { description: "Authenticated session required" },
  "403": { description: "Role, scope, capacity or entitlement denied" },
  "404": { description: "Resource not accessible" },
  "409": { description: "State, revision or command conflict" },
  "410": { description: "Pilot expired" },
};
export const salesDemoPaths = {
  "/sales/demos/catalog": {
    get: {
      summary: "Authenticated scenario and deterministic template catalog",
      responses,
    },
  },
  "/sales/demos": {
    get: {
      summary: "Seller-owned demos; platform admin may view all",
      responses,
    },
    post: {
      summary: "Prepare personalized isolated demonstration",
      requestBody: body(prepareDemoSchema),
      responses,
    },
  },
  "/sales/demos/{id}": {
    get: {
      summary: "Read demo state and outcome evidence",
      parameters: [id],
      responses,
    },
  },
  "/sales/demos/{id}/commands": {
    post: {
      summary: "Guarded deterministic simulation or reset",
      description:
        "No live finance, messaging, storage or camera provider. Revision and command key required. Transactionally records sales evidence and audit; reset affects only this snapshot.",
      parameters: [id],
      requestBody: body(commandSchema),
      responses,
    },
  },
  "/sales/demos/{id}/pilot": {
    post: {
      summary: "Prepare bounded guided pilot for an existing verified owner",
      description:
        "Creates Organization and scoped membership, no subscription, real invoice or provider checkout. Commercial activation remains existing owner agreement and prepaid flow.",
      parameters: [id],
      requestBody: body(startPilotSchema),
      responses,
    },
  },
  "/sales/organizations/{organizationId}/pilot": {
    get: {
      summary: "Actual-activity readiness and pilot value summary",
      parameters: [org],
      responses,
    },
  },
  "/sales/organizations/{organizationId}/pilot/import/preview": {
    post: {
      summary: "Validate and preview 1–500 unit rows with duplicate detection",
      parameters: [org],
      requestBody: body(previewImportSchema),
      responses,
    },
  },
  "/sales/organizations/{organizationId}/pilot/import/confirm": {
    post: {
      summary: "Confirmed transactional import into existing domain models",
      description:
        "Requires rows, matching SHA-256 preview digest and confirm:true. No identity overwrite, outbound message, payment or invoice. Repeated digest is idempotent.",
      parameters: [org],
      requestBody: body(confirmImportSchema),
      responses,
    },
  },
  "/sales/organizations/{organizationId}/pilot/insight": {
    post: {
      summary:
        "Record investigation of an actual outstanding balance or vacant unit",
      parameters: [org],
      requestBody: body(pilotInsightSchema),
      responses,
    },
  },
  "/platform-control/sales-intelligence": {
    get: {
      summary:
        "SUPER_ADMIN prospect-cohort conversion and meaningful value moments",
      responses,
    },
  },
};
