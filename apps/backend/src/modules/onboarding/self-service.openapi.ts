const org = {
  name: "organizationId",
  in: "path",
  required: true,
  schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" },
};
const body = (schema: unknown) => ({
  required: true,
  content: { "application/json": { schema } },
});
const row = {
  type: "object",
  additionalProperties: { type: ["string", "number", "boolean", "null"] },
};
const rows = { type: "array", minItems: 1, maxItems: 500, items: row };
const responses = {
  "200": { description: "Authoritative saved records" },
  "400": { description: "Invalid or injected fields" },
  "401": { description: "Session required" },
  "403": { description: "Organization-wide landlord role and scope required" },
  "402": {
    description: "Signed agreement and verified paid subscription required",
  },
  "409": { description: "Revision, digest, contact or capacity conflict" },
  "503": { description: "Required operational configuration unavailable" },
};
export const selfServicePaths = {
  "/acquisition/plans": {
    get: {
      security: [],
      summary: "Public active Control and Fort Knox commercial quotes",
      description:
        "Uses existing billing price snapshots. No tenant, organization, credential or provider details.",
      parameters: [
        {
          name: "units",
          in: "query",
          schema: { type: "integer", minimum: 0, maximum: 100000, default: 5 },
        },
        {
          name: "months",
          in: "query",
          schema: { type: "integer", minimum: 3, maximum: 24, default: 3 },
        },
      ],
      responses: { "200": responses["200"], "400": responses["400"] },
    },
  },
  "/acquisition/events": {
    post: {
      security: [],
      summary: "Anonymous first-party journey milestone",
      description:
        "40 requests/minute. Unique milestone timestamps; 30-day retention before signup binding; opaque token hash. These events cannot grant paid access.",
      requestBody: body({
        type: "object",
        additionalProperties: false,
        required: ["event"],
        properties: {
          event: {
            enum: [
              "landing_viewed",
              "demo_started",
              "demo_completed",
              "plan_selected",
              "signup_started",
            ],
          },
          journeyToken: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" },
          planKey: { enum: ["CONTROL", "FORT_KNOX"] },
          source: { enum: ["WEBSITE", "PUBLIC_DEMO", "OUTREACH"] },
        },
      }),
      responses: {
        "200": responses["200"],
        "400": responses["400"],
        "429": { description: "Public event rate limited" },
      },
    },
  },
  "/organizations/{organizationId}/portfolio-onboarding": {
    get: {
      summary: "Private actual-record setup progress and bounded draft",
      description:
        "Owner only, no-store. Optional people setup never blocks activation. Completion derives from operational records and a server-recorded dashboard visit.",
      parameters: [org],
      responses,
    },
  },
  "/organizations/{organizationId}/portfolio-onboarding/draft": {
    put: {
      summary: "Save a private resumable property draft",
      description:
        "At most 500 rows / 750 KB. Expected revision prevents multi-tab overwrite. Does not create operational records. Drafts are hidden from ordinary organization serialization.",
      parameters: [org],
      requestBody: body({
        type: "object",
        additionalProperties: false,
        required: ["stage", "expectedRevision"],
        properties: {
          stage: {
            enum: ["PROFILE", "PROPERTY", "UNITS", "PEOPLE", "DASHBOARD"],
          },
          expectedRevision: { type: "integer", minimum: 0 },
          property: {
            type: "object",
            description: "Incomplete bounded property fields",
          },
          importRows: { ...rows, minItems: 0 },
        },
      }),
      responses,
    },
  },
  "/organizations/{organizationId}/portfolio-onboarding/import/preview": {
    post: {
      summary: "Validate a paid portfolio batch without committing it",
      description:
        "Normalized minor-unit rows, hierarchy/contact/capacity checks, original row errors and digest. Reuses the pilot importer; existing matching hierarchy is reused without overwrites.",
      parameters: [org],
      requestBody: body({
        type: "object",
        additionalProperties: false,
        required: ["rows"],
        properties: { rows },
      }),
      responses,
    },
  },
  "/organizations/{organizationId}/portfolio-onboarding/import/confirm": {
    post: {
      summary: "Atomically import one validated paid portfolio batch",
      description:
        "Maximum 500 rows; digest and explicit confirmation required. Re-upload exact normalized batch to replay the retained receipt. Existing contacts cannot be silently attached. Imported contacts stay unverified; no provider payment is created.",
      parameters: [org],
      requestBody: body({
        type: "object",
        additionalProperties: false,
        required: ["rows", "digest", "confirm"],
        properties: {
          rows,
          digest: { type: "string", pattern: "^[a-f0-9]{64}$" },
          confirm: { const: true },
        },
      }),
      responses: {
        ...responses,
        "201": { description: "Committed or safely replayed import receipt" },
      },
    },
  },
  "/organizations/{organizationId}/portfolio-onboarding/dashboard-visit": {
    post: {
      summary: "Record first meaningful actual-data dashboard access once",
      description:
        "Requires saved property and units, signed agreement and active verified paid subscription. Server timestamp and audit commit atomically; no event body may supply milestones or revenue.",
      parameters: [org],
      requestBody: body({ type: "object", additionalProperties: false }),
      responses,
    },
  },
  "/platform-control/acquisition-funnel": {
    get: {
      summary: "Super Admin self-service conversion, blockers and TTFV",
      description:
        "Public session reports separate from trusted signup cohorts. Signed Paystack invoice evidence drives paid conversion. Active historical commercial snapshots provide currency-grouped MRR/ARR. Private draft/contact contents are excluded.",
      parameters: [
        {
          name: "days",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 365, default: 30 },
        },
        {
          name: "page",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 10000, default: 1 },
        },
      ],
      responses,
    },
  },
};
