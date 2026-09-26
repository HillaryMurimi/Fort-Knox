import { Schema, model, type InferSchemaType } from 'mongoose';

const organizationSubscriptionSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, unique: true, index: true },
  planId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true, index: true },
  status: { type: String, enum: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED', 'EXPIRED'], required: true, default: 'TRIALING', index: true },
  currentPeriodStart: { type: Date, required: true },
  currentPeriodEnd: { type: Date, required: true },
  trialEndsAt: { type: Date },
  cancelAtPeriodEnd: { type: Boolean, default: false },
  pendingPlanId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan' },
  pendingPlanEffectiveAt: { type: Date },
  cancelledAt: { type: Date },
  provider: { type: String, enum: ['INTERNAL', 'MPESA', 'STRIPE', 'OTHER'], default: 'INTERNAL' },
  providerCustomerId: { type: String },
  providerSubscriptionId: { type: String },
  gracePeriodEndsAt: { type: Date },
  metadata: { type: Schema.Types.Mixed, default: {} },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

organizationSubscriptionSchema.index({ provider: 1, providerSubscriptionId: 1 }, { unique: true, sparse: true });
export type OrganizationSubscriptionDocument = InferSchemaType<typeof organizationSubscriptionSchema>;
export const OrganizationSubscription = model('OrganizationSubscription', organizationSubscriptionSchema);
