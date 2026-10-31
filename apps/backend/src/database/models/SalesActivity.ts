import { Schema, model } from "mongoose";

// Append-only human context; updating meetings never rewrites prior notes.
const schema = new Schema(
  {
    leadId: { type: Schema.Types.ObjectId, ref: "SalesLead", required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, required: true },
    text: { type: String, maxlength: 20000 },
    resourceId: Schema.Types.ObjectId,
  },
  { timestamps: true },
);
schema.index({ leadId: 1, createdAt: -1 });
export const SalesActivity = model("SalesActivity", schema);
