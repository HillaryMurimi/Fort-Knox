import { Schema, model, type InferSchemaType } from 'mongoose';

const schema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  provider: { type: String, enum: ['PAYSTACK', 'MPESA', 'CRYPTO'], required: true, index: true },
  label: { type: String, required: true, trim: true, maxlength: 120 },
  status: { type: String, enum: ['PENDING_PROVIDER_SETUP', 'ACTIVE', 'DISABLED'], required: true, default: 'PENDING_PROVIDER_SETUP', index: true },
  isDefault: { type: Boolean, required: true, default: false },
  currency: { type: String, required: true, uppercase: true, trim: true, maxlength: 10 },
  country: { type: String, uppercase: true, trim: true, minlength: 2, maxlength: 2 },
  paystackSubaccountCode: { type: String, trim: true, maxlength: 100 },
  settlementBankCode: { type: String, trim: true, maxlength: 30 },
  accountName: { type: String, trim: true, maxlength: 180 },
  accountNumberLast4: { type: String, trim: true, minlength: 4, maxlength: 4 },
  mpesaShortCode: { type: String, trim: true, maxlength: 20 },
  mpesaAccountReference: { type: String, trim: true, maxlength: 40 },
  cryptoAsset: { type: String, uppercase: true, trim: true, maxlength: 20 },
  cryptoNetwork: { type: String, uppercase: true, trim: true, maxlength: 40 },
  cryptoWalletAddress: { type: String, trim: true, maxlength: 180 },
  providerVerifiedAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

schema.index(
  { organizationId: 1, provider: 1, isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true } },
);
schema.index({ organizationId: 1, paystackSubaccountCode: 1 }, { unique: true, sparse: true });

export type PaymentDestinationDocument = InferSchemaType<typeof schema>;
export const PaymentDestination = model('PaymentDestination', schema);
