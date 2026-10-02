import { Schema, model } from "mongoose";
const schema = new Schema(
  {
    environment: { type: String, required: true },
    dataset: { type: String, enum: ["LIVE", "DEMO"], required: true },
    idempotencyKey: { type: String, required: true },
    requestHash: { type: String, required: true },
    version: { type: Number, required: true, default: 1 },
    generatedAt: { type: Date, required: true },
    periodFrom: { type: Date, required: true },
    periodTo: { type: Date, required: true },
    timeZone: { type: String, required: true },
    plan: { type: String, required: true },
    sha256: { type: String, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { versionKey: false },
);
schema.index(
  { environment: 1, dataset: 1, idempotencyKey: 1 },
  { unique: true },
);
schema.index({ environment: 1, dataset: 1, plan: 1, generatedAt: -1 });
schema.index({ environment: 1, dataset: 1, generatedAt: -1 });
schema.pre("save", function () {
  if (!this.isNew && this.isModified())
    throw new Error("PLATFORM_BRIEF_IMMUTABLE");
});
schema.pre(
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
    throw new Error("PLATFORM_BRIEF_IMMUTABLE");
  },
);
export const PlatformBrief = model("PlatformBrief", schema);
