const selection = {
  type: "object",
  additionalProperties: false,
  properties: {
    period: {
      type: "string",
      enum: [
        "TODAY",
        "PREVIOUS_DAY",
        "LAST_7_DAYS",
        "LAST_30_DAYS",
        "CURRENT_MONTH",
        "PREVIOUS_MONTH",
        "CUSTOM",
      ],
      default: "TODAY",
    },
    from: { type: "string", format: "date" },
    to: { type: "string", format: "date" },
    timeZone: { type: "string", default: "Africa/Nairobi" },
    plan: {
      type: "string",
      enum: ["ALL", "CONTROL", "FORT_KNOX", "OTHER", "UNASSIGNED"],
      default: "ALL",
    },
    dataset: { type: "string", enum: ["LIVE", "DEMO"], default: "LIVE" },
  },
};
const parameters = Object.entries(selection.properties).map(
  ([name, schema]) => ({ name, in: "query", schema }),
);
const response = {
  description:
    "Platform business result; minor-unit currency values, source coverage and snapshot time are explicit",
};
export const platformBusinessPaths = {
  "/platform-control/business-intelligence": {
    get: {
      summary: "SUPER_ADMIN plan performance and current platform intelligence",
      parameters,
      responses: {
        200: response,
        403: { description: "Platform administrator required" },
      },
    },
  },
  "/platform-control/business-intelligence/drill-down": {
    get: {
      summary: "Audited bounded platform drill-down",
      parameters: [
        ...parameters,
        {
          name: "kind",
          in: "query",
          schema: {
            type: "string",
            enum: [
              "ORGANIZATIONS",
              "ACTIVE",
              "ONBOARDING",
              "SIGNATURE",
              "PAYMENT",
              "ATTENTION",
              "OVERDUE",
              "INVOICES",
              "OUTSTANDING",
              "VERIFIED_PAYMENTS",
              "UNVERIFIED_PAYMENTS",
              "BILLING_EVENTS",
              "CAMERAS",
              "INCIDENTS",
              "MOVEMENTS",
            ],
          },
        },
        { name: "organizationId", in: "query", schema: { type: "string" } },
        { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
        {
          name: "pageSize",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 50 },
        },
      ],
      responses: { 200: response },
    },
  },
  "/platform-control/morning-briefs": {
    get: {
      summary: "List historical platform brief metadata",
      parameters,
      responses: { 200: response },
    },
    post: {
      summary:
        "Generate immutable audited platform Morning Brief; no outbound delivery",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              ...selection,
              required: ["idempotencyKey"],
              properties: {
                ...selection.properties,
                idempotencyKey: {
                  type: "string",
                  minLength: 8,
                  maxLength: 100,
                },
              },
            },
          },
        },
      },
      responses: {
        201: response,
        409: { description: "Conflicting idempotency key" },
      },
    },
  },
  "/platform-control/morning-briefs/{id}": {
    get: {
      summary: "Read a hash-verified historical platform brief",
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
        ...parameters,
      ],
      responses: {
        200: response,
        404: { description: "Brief not found in environment/dataset" },
      },
    },
  },
};
