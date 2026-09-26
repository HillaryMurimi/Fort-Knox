import { Schema, model, type InferSchemaType } from 'mongoose';

const propertySchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 50 },
  description: { type: String, trim: true, maxlength: 5000 },
  propertyType: {
    type: String,
    enum: ['APARTMENT', 'RESIDENTIAL_ESTATE', 'COMMERCIAL', 'MIXED_USE', 'OFFICE', 'RETAIL', 'WAREHOUSE', 'OTHER'],
    required: true
  },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'ACTIVE', index: true },
  address: {
    addressLine1: { type: String, required: true, trim: true, maxlength: 200 },
    addressLine2: { type: String, trim: true, maxlength: 200 },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    county: { type: String, trim: true, maxlength: 100 },
    country: { type: String, required: true, trim: true, maxlength: 100 },
    postalCode: { type: String, trim: true, maxlength: 30 }
  },
  location: {
    type: { type: String, enum: ['Point'] },
    coordinates: { type: [Number] }
  },
  totalUnits: { type: Number, min: 0, default: 0 },
  metadata: { type: Map, of: Schema.Types.Mixed, default: () => ({}) },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

propertySchema.index({ organizationId: 1, code: 1 }, { unique: true });
propertySchema.index({ organizationId: 1, status: 1 });
propertySchema.index({ location: '2dsphere' });

export type PropertyDocument = InferSchemaType<typeof propertySchema>;
export const Property = model('Property', propertySchema);
