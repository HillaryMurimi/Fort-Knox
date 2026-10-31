import { Schema, model } from "mongoose";

// Append-only human context; updating meetings never rewrites prior notes.
const schema = new Schema(
  {
    leadId: { type: Schema.Types.ObjectId, ref: "SalesLead", required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: "User" },
    actorKind: { type: String, enum: ['HUMAN', 'AGENT', 'SYSTEM'], default: 'HUMAN' },
    kind: { type: String, required: true },
    text: { type: String, maxlength: 20000 },
    resourceId: Schema.Types.ObjectId,
    sourceKey: String,
    sourceType: { type: String, enum: ['DOMAIN_EVENT', 'AUDIT_EVENT', 'AUTHORITATIVE_RECORD'] },
    sourceOccurredAt: Date,
    sourceVersion: Number,
  },
  { timestamps: true },
);
schema.index({ leadId: 1, createdAt: -1 });
schema.index({ leadId: 1, sourceKey: 1 }, { unique: true, partialFilterExpression: { sourceKey: { $type: 'string' } }, name: 'sales_activity_source_unique' });
export const SalesActivity = model("SalesActivity", schema);
