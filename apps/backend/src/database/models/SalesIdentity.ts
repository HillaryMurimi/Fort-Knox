import { model, Schema } from "mongoose";
const match = new Schema(
  {
    leadId: { type: Schema.Types.ObjectId, ref: "SalesLead", required: true },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    status: {
      type: String,
      enum: [
        "MATCH_SUGGESTED",
        "LINK_PENDING_REVIEW",
        "LINKED",
        "LINK_REJECTED",
        "CONFLICT",
      ],
      required: true,
    },
    evidence: {
      type: String,
      enum: [
        "VERIFIED_OWNER_EMAIL",
        "REFERRAL_AND_VERIFIED_EMAIL",
        "REFERRAL_CONTACT_MISMATCH",
        "AMBIGUOUS_VERIFIED_EMAIL",
        "ORGANIZATION_CONFLICT",
      ],
      required: true,
    },
    verifiedAt: Date,
    contactHash: String,
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    reviewReason: String,
  },
  { timestamps: true },
);
match.index(
  { leadId: 1, organizationId: 1 },
  { unique: true, name: "sales_identity_match_unique" },
);
match.index({ status: 1, createdAt: -1 });
export const SalesIdentityMatch = model("SalesIdentityMatch", match);
const merge = new Schema(
  {
    sourceId: { type: Schema.Types.ObjectId, ref: "SalesLead", required: true },
    targetId: { type: Schema.Types.ObjectId, ref: "SalesLead", required: true },
    sourceRevision: { type: Number, required: true },
    targetRevision: { type: Number, required: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, required: true, maxlength: 2000 },
    payloadHash: { type: String, required: true },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "REJECTED", "CANCELLED"],
      default: "PENDING",
    },
    expiresAt: { type: Date, required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
  },
  { timestamps: true },
);
merge.index({ status: 1, createdAt: -1 });
export const SalesMergeRequest = model("SalesMergeRequest", merge);
const checkpoint = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      unique: true,
    },
    domainCursorAt: Date,
    domainCursorId: Schema.Types.ObjectId,
    auditCursorAt: Date,
    auditCursorId: Schema.Types.ObjectId,
    lastProcessedAt: Date,
    lastEventAt: Date,
    processedCount: { type: Number, default: 0 },
    lastErrorCode: String,
    inventory: {
      type: Map,
      of: new Schema({ at: Date, id: Schema.Types.ObjectId }, { _id: false }),
      default: () => new Map(),
    },
  },
  { timestamps: true },
);
export const SalesProjectionCheckpoint = model(
  "SalesProjectionCheckpoint",
  checkpoint,
);
