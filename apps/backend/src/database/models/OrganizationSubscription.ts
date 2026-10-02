import { Schema, model, type InferSchemaType } from 'mongoose';

const organizationSubscriptionSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, unique: true, index: true },
  planId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true, index: true },
  status: { type: String, enum: ['PENDING', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED', 'EXPIRED'], required: true, default: 'PENDING', index: true },
  currentPeriodStart: { type: Date, required: true },
  currentPeriodEnd: { type: Date, required: true },
  trialEndsAt: { type: Date },
  cancelAtPeriodEnd: { type: Boolean, default: false },
  pendingPlanId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan' },
  pendingPlanEffectiveAt: { type: Date },
  cancelledAt: { type: Date },
  provider: { type: String, enum: ['INTERNAL', 'MPESA', 'PAYSTACK', 'STRIPE', 'OTHER'], default: 'INTERNAL' },
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
  renewalState: { type: String, enum: ['NOT_SCHEDULED', 'SCHEDULING', 'SCHEDULED', 'REQUIRES_ATTENTION'] },
  renewalAttemptedAt: Date,
  metadata: { type: Schema.Types.Mixed, default: {} },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

organizationSubscriptionSchema.index({ provider: 1, providerSubscriptionId: 1 }, { unique: true, partialFilterExpression: { providerSubscriptionId: { $type: 'string' } } });
organizationSubscriptionSchema.index({ provider: 1, providerCheckoutReference: 1 }, { unique: true, partialFilterExpression: { providerCheckoutReference: { $type: 'string' } } });
organizationSubscriptionSchema.index({ provider: 1, checkoutReferences: 1 });
organizationSubscriptionSchema.index({ provider: 1, providerPlanCode: 1 }, { unique: true, partialFilterExpression: { providerPlanCode: { $type: 'string' } } });
export type OrganizationSubscriptionDocument = InferSchemaType<typeof organizationSubscriptionSchema>;
export const OrganizationSubscription = model('OrganizationSubscription', organizationSubscriptionSchema);
