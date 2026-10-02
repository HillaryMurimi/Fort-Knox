import { Schema, model, type InferSchemaType } from 'mongoose';

const regionalProfileSchema = new Schema({
  countryCode: { type: String, required: true, default: 'KE', uppercase: true, match: /^[A-Z]{2}$/ },
  baseCurrency: { type: String, required: true, default: 'KES', uppercase: true, match: /^[A-Z]{3}$/ },
  allowedCurrencies: { type: [String], required: true, default: () => ['KES'] },
  locale: { type: String, required: true, default: 'en-KE' },
  timeZone: { type: String, required: true, default: 'Africa/Nairobi' },
}, { _id: false });

const organizationSchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE', index: true },
  onboarding: { type: new Schema({
    state: { type: String, enum: ['ACCOUNT_CREATED', 'ORGANIZATION_CONFIGURED', 'PLAN_SELECTED', 'CONTRACT_GENERATED', 'CONTRACT_PENDING_SIGNATURE', 'CONTRACT_SIGNED', 'INVOICE_ISSUED', 'PAYMENT_PENDING', 'PAYMENT_VERIFIED', 'ACTIVE'], required: true, default: 'ACCOUNT_CREATED', index: true },
    legalName: String, legalIdentifier: String, billingEmail: String, unitCount: Number,
    revision: { type: Number, default: 0 },
    contractId: { type: Schema.Types.ObjectId, ref: 'OrganizationContract' },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'SubscriptionInvoice' },
    activatedAt: Date, paymentVerifiedAt: Date, attentionCode: String,
  }, { _id: false }) },
  settings: { type: Schema.Types.Mixed, default: {} },
  regionalProfile: { type: regionalProfileSchema, default: () => ({}) },
}, { timestamps: true });

export type OrganizationDocument = InferSchemaType<typeof organizationSchema>;
export const Organization = model('Organization', organizationSchema);
