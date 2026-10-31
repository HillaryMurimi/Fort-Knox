import { Schema, model } from "mongoose";

const schema = new Schema(
  {
    leadId: { type: Schema.Types.ObjectId, ref: "SalesLead", required: true },
    representativeId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    type: {
      type: String,
      enum: ["DEMO", "CALL", "ONBOARDING", "REVIEW"],
      required: true,
    },
    status: {
      type: String,
      enum: [
        "SCHEDULED",
        "COMPLETED",
        "CANCELLED",
        "RESCHEDULED",
        "NO_SHOW",
        "NOT_HELD",
      ],
      default: "SCHEDULED",
    },
    description: { type: String, maxlength: 20000, default: "" },
    outcome: { type: String, maxlength: 5000 },
    revision: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);
schema.index({ leadId: 1, startsAt: -1 });
schema.index({ representativeId: 1, status: 1, startsAt: 1, endsAt: 1 });
export const SalesMeeting = model("SalesMeeting", schema);
