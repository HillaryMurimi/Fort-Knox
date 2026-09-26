import { Schema, model, type InferSchemaType } from 'mongoose';

const billingEventSchema = new Schema({
  eventId: { type: String, required: true, unique: true, trim: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
  provider: { type: String, enum: ['INTERNAL', 'MPESA', 'PAYSTACK', 'STRIPE', 'OTHER'], required: true },
  type: { type: String, enum: ['SUBSCRIPTION_CREATED', 'SUBSCRIPTION_UPDATED', 'SUBSCRIPTION_CANCELLED', 'INVOICE_CREATED', 'INVOICE_PAID', 'INVOICE_FAILED', 'PAYMENT_FAILED', 'PAYMENT_REVERSED'], required: true },
  externalReference: { type: String },
  payloadHash: { type: String },
  payload: { type: Schema.Types.Mixed, default: {} },
  processedAt: { type: Date },
  status: { type: String, enum: ['RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED'], default: 'RECEIVED', index: true },
  error: { type: String },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

billingEventSchema.index({ provider: 1, externalReference: 1 }, { unique: true, sparse: true });
export type BillingEventDocument = InferSchemaType<typeof billingEventSchema>;
export const BillingEvent = model('BillingEvent', billingEventSchema);
