import { Schema, model, type InferSchemaType } from 'mongoose';

const organizationSchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE', index: true },
  settings: { type: Schema.Types.Mixed, default: {} }
}, { timestamps: true });

export type OrganizationDocument = InferSchemaType<typeof organizationSchema>;
export const Organization = model('Organization', organizationSchema);
