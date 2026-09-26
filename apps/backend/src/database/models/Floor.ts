import { Schema, model, type InferSchemaType } from 'mongoose';

const floorSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  level: { type: Number, required: true, min: -10, max: 300 },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 50 },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'ACTIVE', index: true },
  totalUnits: { type: Number, min: 0, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

floorSchema.index({ organizationId: 1, buildingId: 1, code: 1 }, { unique: true });
floorSchema.index({ organizationId: 1, propertyId: 1, buildingId: 1, level: 1 }, { unique: true });

export type FloorDocument = InferSchemaType<typeof floorSchema>;
export const Floor = model('Floor', floorSchema);
