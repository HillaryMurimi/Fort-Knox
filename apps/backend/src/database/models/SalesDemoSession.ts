import { Schema, model } from "mongoose";
import type {
  DemoProfile,
  DemoSnapshot,
} from "../../modules/sales/sales-demo.types.js";
const sessionSchema = new Schema(
  {
    leadId: {
      type: Schema.Types.ObjectId,
      ref: "SalesLead",
      required: true,
      index: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    dataset: {
      type: String,
      enum: ["SALES_DEMO"],
      required: true,
      default: "SALES_DEMO",
      immutable: true,
    },
    profile: { type: Schema.Types.Mixed, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    revision: { type: Number, default: 0, required: true },
    generation: { type: Number, default: 0, required: true },
    pilotOrganizationId: { type: Schema.Types.ObjectId, ref: "Organization" },
  },
  { timestamps: true },
);
sessionSchema.index({ createdBy: 1, createdAt: -1 });
export const SalesDemoSession = model("SalesDemoSession", sessionSchema);
export type StoredDemoProfile = DemoProfile;
export type StoredDemoSnapshot = DemoSnapshot;
const eventSchema = new Schema(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "SalesDemoSession",
      required: true,
    },
    leadId: { type: Schema.Types.ObjectId, ref: "SalesLead", required: true },
    generation: { type: Number, required: true },
    commandId: { type: String, required: true },
    payloadHash: { type: String, required: true },
    kind: { type: String, required: true },
    resourceId: { type: String, required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    at: { type: Date, required: true, default: Date.now },
    dataset: {
      type: String,
      enum: ["SALES_DEMO", "PILOT"],
      required: true,
      default: "SALES_DEMO",
      immutable: true,
    },
  },
  { versionKey: false },
);
eventSchema.index(
  { sessionId: 1, commandId: 1 },
  { unique: true, name: "sales_demo_command_unique" },
);
eventSchema.index({ leadId: 1, at: 1 });
eventSchema.pre(
  [
    "updateOne",
    "updateMany",
    "findOneAndUpdate",
    "replaceOne",
    "findOneAndReplace",
    "deleteOne",
    "deleteMany",
    "findOneAndDelete",
  ],
  function () {
    throw new Error("SALES_VALUE_EVENTS_APPEND_ONLY");
  },
);
export const SalesValueEvent = model("SalesValueEvent", eventSchema);
