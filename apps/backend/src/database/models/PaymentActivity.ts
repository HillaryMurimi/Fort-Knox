import { Schema, model, type InferSchemaType } from 'mongoose';

const schema = new Schema({
  eventId: { type: String, required: true, unique: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
  buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true },
  unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
  name: { type: String, enum: ['payment.confirmed', 'payment.reversed'], required: true },
  amountMajorUnits: { type: Number, required: true },
  currency: { type: String, required: true },
  occurredAt: { type: Date, required: true },
}, { timestamps: true });

schema.index({ organizationId: 1, unitId: 1, occurredAt: -1 });
export type PaymentActivityDocument = InferSchemaType<typeof schema>;
export const PaymentActivity = model('PaymentActivity', schema);
