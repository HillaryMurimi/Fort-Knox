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
  settings: { type: Schema.Types.Mixed, default: {} },
  regionalProfile: { type: regionalProfileSchema, default: () => ({}) },
}, { timestamps: true });

export type OrganizationDocument = InferSchemaType<typeof organizationSchema>;
export const Organization = model('Organization', organizationSchema);
