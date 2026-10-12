import { Schema, model } from "mongoose";

// Anonymous milestones contain no contact, device, IP, payment or credential data.
const schema = new Schema(
  {
    tokenHash: { type: String, select: false },
    source: {
      type: String,
      enum: ["WEBSITE", "PUBLIC_DEMO", "OUTREACH"],
      default: "WEBSITE",
    },
    planKey: { type: String, enum: ["CONTROL", "FORT_KNOX"] },
    landingAt: Date,
    demoStartedAt: Date,
    demoCompletedAt: Date,
    planSelectedAt: Date,
    signupStartedAt: Date,
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization" },
    retentionClass: {
      type: String,
      enum: ["ANONYMOUS", "ACCOUNT"],
      default: "ANONYMOUS",
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
schema.index(
  { tokenHash: 1 },
  {
    name: "acquisition_token_unique",
    unique: true,
    partialFilterExpression: { tokenHash: { $type: "string" } },
  },
);
schema.index(
  { organizationId: 1 },
  {
    name: "acquisition_org_unique",
    unique: true,
    partialFilterExpression: { organizationId: { $type: "objectId" } },
  },
);
schema.index(
  { expiresAt: 1 },
  {
    name: "acquisition_anonymous_expiry",
    expireAfterSeconds: 0,
    partialFilterExpression: { retentionClass: "ANONYMOUS" },
  },
);
schema.index({ createdAt: 1 }, { name: "acquisition_cohort_at" });
export const AcquisitionJourney = model("AcquisitionJourney", schema);
