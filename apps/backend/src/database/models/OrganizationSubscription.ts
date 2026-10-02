import { Schema, model, type InferSchemaType } from "mongoose";
import { randomUUID } from "node:crypto";
import { SubscriptionPlan } from "./SubscriptionPlan.js";

const transitionSchema = new Schema(
  {
    eventId: { type: String, required: true },
    at: { type: Date, required: true },
    kind: { type: String, required: true },
    fromPlan: String,
    toPlan: String,
    fromStatus: String,
    toStatus: { type: String, required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false },
);
export function subscriptionMovement(
  fromPlan: string | undefined,
  toPlan: string | undefined,
  fromStatus: string | undefined,
  toStatus: string,
) {
  if (!fromStatus) return "CREATED";
  if (toStatus === "CANCELLED" && fromStatus !== "CANCELLED")
    return "CANCELLED";
  if (fromPlan !== toPlan)
    return fromPlan === "CONTROL" && toPlan === "FORT_KNOX"
      ? "UPGRADE"
      : fromPlan === "FORT_KNOX" && toPlan === "CONTROL"
        ? "DOWNGRADE"
        : "PLAN_CHANGED";
  return fromStatus !== "ACTIVE" && toStatus === "ACTIVE"
    ? "ACTIVATED"
    : "STATUS_CHANGED";
}

const organizationSubscriptionSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      unique: true,
      index: true,
    },
    planId: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "PENDING",
        "TRIALING",
        "ACTIVE",
        "PAST_DUE",
        "PAUSED",
        "CANCELLED",
        "EXPIRED",
      ],
      required: true,
      default: "PENDING",
      index: true,
    },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    trialEndsAt: { type: Date },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    pendingPlanId: { type: Schema.Types.ObjectId, ref: "SubscriptionPlan" },
    pendingPlanEffectiveAt: { type: Date },
    cancelledAt: { type: Date },
    provider: {
      type: String,
      enum: ["INTERNAL", "MPESA", "PAYSTACK", "STRIPE", "OTHER"],
      default: "INTERNAL",
    },
    providerCustomerId: { type: String },
    providerSubscriptionId: { type: String },
    providerCheckoutReference: { type: String },
    checkoutReferences: { type: [String], default: [] },
    providerCheckoutUrl: { type: String },
    checkoutRecoveryLockedAt: { type: Date, select: false },
    providerPlanCode: { type: String },
    billingEmail: { type: String, select: false },
    providerEmailToken: { type: String, select: false },
    gracePeriodEndsAt: { type: Date },
    renewalAuthorizationCode: { type: String, select: false },
    renewalState: {
      type: String,
      enum: ["NOT_SCHEDULED", "SCHEDULING", "SCHEDULED", "REQUIRES_ATTENTION"],
    },
    renewalAttemptedAt: Date,
    businessTrackingStartedAt: Date,
    businessTransitions: { type: [transitionSchema], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, optimisticConcurrency: true },
);

// A transition and its subscription state share one atomic document write, including query updates.
// No historical movement is inferred from the current plan. Existing rows start coverage on their next transition.
organizationSubscriptionSchema.pre("save", async function () {
  if (
    !this.isNew &&
    (this.isModified("businessTransitions") ||
      this.isModified("businessTrackingStartedAt"))
  )
    throw new Error("SUBSCRIPTION_HISTORY_APPEND_ONLY");
  if (!this.isNew && !this.isModified("status") && !this.isModified("planId"))
    return;
  const prior = this.isNew
    ? null
    : ((await model("OrganizationSubscription")
        .findById(this._id)
        .select("planId status businessTrackingStartedAt")
        .session(this.$session())
        .lean()) as {
        planId: unknown;
        status: string;
        businessTrackingStartedAt?: Date;
      } | null);
  if (
    prior &&
    String(prior.planId) === String(this.planId) &&
    prior.status === this.status
  )
    return;
  const [oldPlan, newPlan] = await Promise.all([
    prior
      ? SubscriptionPlan.findById(prior.planId)
          .select("key")
          .session(this.$session())
          .lean()
      : null,
    SubscriptionPlan.findById(this.planId)
      .select("key")
      .session(this.$session())
      .lean(),
  ]);
  const at = new Date();
  this.businessTrackingStartedAt ??= at;
  this.businessTransitions.push({
    eventId: randomUUID(),
    at,
    kind: subscriptionMovement(
      oldPlan?.key,
      newPlan?.key,
      prior?.status,
      this.status,
    ),
    fromPlan: oldPlan?.key,
    toPlan: newPlan?.key,
    fromStatus: prior?.status,
    toStatus: this.status,
    actorUserId: this.updatedBy,
  });
});
organizationSubscriptionSchema.pre(
  ["findOneAndUpdate", "updateOne"],
  async function () {
    const update = this.getUpdate();
    if (!update || Array.isArray(update))
      throw new Error("SUBSCRIPTION_PIPELINE_UPDATE_UNSUPPORTED");
    const fields = (update.$set ?? update) as Record<string, unknown>;
    if (
      Object.entries(update).some(
        ([key, value]) =>
          /^(businessTransitions|businessTrackingStartedAt)(\.|$)/.test(key) ||
          (key.startsWith("$") &&
            value &&
            typeof value === "object" &&
            Object.keys(value).some((field) =>
              /^(businessTransitions|businessTrackingStartedAt)(\.|$)/.test(
                field,
              ),
            )),
      )
    )
      throw new Error("SUBSCRIPTION_HISTORY_APPEND_ONLY");
    if (fields.planId === undefined && fields.status === undefined) return;
    const prior = (await this.model
      .findOne(this.getFilter())
      .select("planId status businessTrackingStartedAt __v")
      .session(this.getOptions().session ?? null)
      .lean()) as {
      planId: unknown;
      status: string;
      businessTrackingStartedAt?: Date;
      __v?: number;
    } | null;
    const planId = fields.planId ?? prior?.planId,
      status = String(fields.status ?? prior?.status ?? "PENDING");
    if (
      prior &&
      String(planId) === String(prior.planId) &&
      status === prior.status
    )
      return;
    const [oldPlan, newPlan] = await Promise.all([
      prior
        ? SubscriptionPlan.findById(prior.planId)
            .select("key")
            .session(this.getOptions().session ?? null)
            .lean()
        : null,
      planId
        ? SubscriptionPlan.findById(planId)
            .select("key")
            .session(this.getOptions().session ?? null)
            .lean()
        : null,
    ]);
    const at = new Date(),
      transition = {
        eventId: randomUUID(),
        at,
        kind: subscriptionMovement(
          oldPlan?.key,
          newPlan?.key,
          prior?.status,
          status,
        ),
        fromPlan: oldPlan?.key,
        toPlan: newPlan?.key,
        fromStatus: prior?.status,
        toStatus: status,
        actorUserId: fields.updatedBy,
      };
    if (!update.$set) {
      update.$set = { ...fields };
      for (const key of Object.keys(fields)) delete update[key];
    }
    update.$push = { ...update.$push, businessTransitions: transition };
    if (!prior?.businessTrackingStartedAt)
      update.$set.businessTrackingStartedAt = at;
    if (prior) {
      this.setQuery({
        $and: [
          this.getFilter(),
          {
            planId: prior.planId,
            status: prior.status,
            ...(prior.__v === undefined ? {} : { __v: prior.__v }),
          },
        ],
      });
      update.$inc = { ...update.$inc, __v: 1 };
    }
    this.setUpdate(update);
  },
);
organizationSubscriptionSchema.pre(
  ["updateMany", "replaceOne", "findOneAndReplace"],
  function () {
    throw new Error("SUBSCRIPTION_BULK_REPLACEMENT_UNSUPPORTED");
  },
);
organizationSubscriptionSchema.index(
  { "businessTransitions.at": 1 },
  { name: "platform_bi_movements_at" },
);

organizationSubscriptionSchema.index(
  { provider: 1, providerSubscriptionId: 1 },
  {
    unique: true,
    partialFilterExpression: { providerSubscriptionId: { $type: "string" } },
  },
);
organizationSubscriptionSchema.index(
  { provider: 1, providerCheckoutReference: 1 },
  {
    unique: true,
    partialFilterExpression: { providerCheckoutReference: { $type: "string" } },
  },
);
organizationSubscriptionSchema.index({ provider: 1, checkoutReferences: 1 });
organizationSubscriptionSchema.index(
  { provider: 1, providerPlanCode: 1 },
  {
    unique: true,
    partialFilterExpression: { providerPlanCode: { $type: "string" } },
  },
);
export type OrganizationSubscriptionDocument = InferSchemaType<
  typeof organizationSubscriptionSchema
>;
export const OrganizationSubscription = model(
  "OrganizationSubscription",
  organizationSubscriptionSchema,
);
