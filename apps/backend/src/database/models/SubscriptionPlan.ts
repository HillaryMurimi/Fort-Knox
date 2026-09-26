import { Schema, model, type InferSchemaType } from 'mongoose';

const subscriptionPlanSchema = new Schema({
  key: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  currency: { type: String, required: true, uppercase: true, default: 'KES' },
  amount: { type: Number, required: true, min: 0 },
  billingInterval: { type: String, enum: ['MONTH', 'QUARTER', 'YEAR'], required: true },
  trialDays: { type: Number, min: 0, default: 0 },
  entitlements: {
    maxProperties: { type: Number, min: -1, default: -1 },
    maxUnits: { type: Number, min: -1, default: -1 },
    maxUsers: { type: Number, min: -1, default: -1 },
    maxTenants: { type: Number, min: -1, default: -1 },
    features: { type: [String], default: [] }
  },
  active: { type: Boolean, default: true },
  metadata: { type: Schema.Types.Mixed, default: {} }
}, { timestamps: true });

export type SubscriptionPlanDocument = InferSchemaType<typeof subscriptionPlanSchema>;
export const SubscriptionPlan = model('SubscriptionPlan', subscriptionPlanSchema);
