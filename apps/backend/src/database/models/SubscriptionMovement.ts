import { Schema, model, type InferSchemaType } from "mongoose";

export const movementKinds = [
  "ACTIVATION",
  "RENEWAL",
  "EXPANSION",
  "CONTRACTION",
  "CANCELLATION",
  "EXPIRATION",
  "REACTIVATION",
] as const;
const minor = { type: String, match: /^(0|[1-9][0-9]{0,29})$/ };
const schema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    subscriptionId: { type: Schema.Types.ObjectId, required: true },
    sequence: { type: Number, required: true, min: 1 },
    kind: { type: String, enum: movementKinds, required: true },
    effectiveAt: { type: Date, required: true },
    recordedAt: { type: Date, required: true, default: Date.now },
    currency: { type: String, required: true, match: /^[A-Z]{3}$/ },
    previousMinor: { ...minor, default: null },
    newMinor: { ...minor, required: true },
    paidThrough: Date,
    previousEventId: Schema.Types.ObjectId,
    sourceKey: { type: String, required: true },
    invoiceId: Schema.Types.ObjectId,
    contractId: Schema.Types.ObjectId,
    billingEventId: Schema.Types.ObjectId,
    webhookEventId: Schema.Types.ObjectId,
    actorUserId: Schema.Types.ObjectId,
    sourceKind: {
      type: String,
      enum: [
        "VERIFIED_PAYMENT",
        "PAID_TERM_BOUNDARY",
        "AUTHORIZED_CANCELLATION",
        "VERIFIED_WEBHOOK",
      ],
      required: true,
    },
    sourceReference: { type: String, required: true, maxlength: 200 },
    completeFromStart: { type: Boolean, required: true },
    gaps: { type: [String], default: [] },
    dataset: { type: String, enum: ["LIVE", "DEMO"], required: true },
  },
  { versionKey: false },
);
schema.index(
  { sourceKey: 1 },
  { unique: true, name: "subscription_movement_source_unique" },
);
schema.index(
  { subscriptionId: 1, sequence: 1 },
  { unique: true, name: "subscription_movement_sequence_unique" },
);
schema.index(
  { dataset: 1, currency: 1, effectiveAt: 1, _id: 1 },
  { name: "subscription_movement_reporting" },
);
schema.index({ organizationId: 1, effectiveAt: 1 });
schema.pre("save", function () {
  if (!this.isNew) throw new Error("SUBSCRIPTION_MOVEMENT_IMMUTABLE");
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
    throw new Error("SUBSCRIPTION_MOVEMENT_IMMUTABLE");
  },
);
schema.pre("deleteOne", { document: true, query: false }, function () {
  throw new Error("SUBSCRIPTION_MOVEMENT_IMMUTABLE");
});
schema.pre("bulkWrite", function () {
  throw new Error("SUBSCRIPTION_MOVEMENT_IMMUTABLE");
});
export type SubscriptionMovementRecord = InferSchemaType<typeof schema>;
export const SubscriptionMovement = model("SubscriptionMovement", schema);
