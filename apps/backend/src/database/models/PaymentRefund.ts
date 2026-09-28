import { Schema, model, type InferSchemaType } from 'mongoose';

const schema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, unique: true },
  provider: { type: String, enum: ['PAYSTACK'], required: true },
  transactionReference: { type: String, required: true, maxlength: 180 },
  providerRefundId: { type: Number },
  amountMinorUnits: { type: Number, required: true, min: 1 },
  currency: { type: String, required: true, maxlength: 3 },
  status: { type: String, enum: ['SUBMITTING', 'SUBMISSION_UNKNOWN', 'PENDING', 'PROCESSING', 'NEEDS_ATTENTION', 'FAILED', 'PROCESSED'], required: true },
  reason: { type: String, required: true, maxlength: 500 },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  providerUpdatedAt: Date,
}, { timestamps: true });

schema.index({ organizationId: 1, status: 1, createdAt: -1 });
export type PaymentRefundDocument = InferSchemaType<typeof schema>;
export const PaymentRefund = model('PaymentRefund', schema);
