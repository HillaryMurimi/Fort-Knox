import { Schema, model, type InferSchemaType } from 'mongoose';

const buildingSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 50 },
  description: { type: String, trim: true, maxlength: 3000 },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'ACTIVE', index: true },
  totalFloors: { type: Number, min: 0, default: 0 },
  totalUnits: { type: Number, min: 0, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

buildingSchema.index({ organizationId: 1, propertyId: 1, code: 1 }, { unique: true });
buildingSchema.index({ organizationId: 1, propertyId: 1, status: 1 });

export type BuildingDocument = InferSchemaType<typeof buildingSchema>;
export const Building = model('Building', buildingSchema);
