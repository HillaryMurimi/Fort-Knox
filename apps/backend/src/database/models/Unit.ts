import { Schema, model, type InferSchemaType } from 'mongoose';

const unitSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
  floorId: { type: Schema.Types.ObjectId, ref: 'Floor', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 50 },
  unitType: { type: String, enum: ['SINGLE_ROOM', 'BEDSITTER', 'STUDIO', 'ONE_BEDROOM', 'TWO_BEDROOM', 'THREE_PLUS_BEDROOM', 'FOUR_BEDROOM', 'FIVE_PLUS_BEDROOM', 'MAISONETTE', 'SHOP', 'OFFICE', 'RETAIL', 'COMMERCIAL_UNIT', 'OTHER'], required: true },
  unitTypeLabel: { type: String, trim: true, maxlength: 100 },
  status: { type: String, enum: ['VACANT', 'OCCUPIED', 'RESERVED', 'MAINTENANCE', 'INACTIVE'], default: 'VACANT', index: true },
  monthlyRent: { type: Number, min: 0, required: true },
  serviceCharge: { type: Number, min: 0, default: 0 },
  areaSqm: { type: Number, min: 0 },
  bedrooms: { type: Number, min: 0 },
  bathrooms: { type: Number, min: 0 },
  amenities: [{ type: String, trim: true, maxlength: 100 }],
  metadata: { type: Map, of: Schema.Types.Mixed, default: () => ({}) },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

unitSchema.index({ organizationId: 1, buildingId: 1, code: 1 }, { unique: true });
unitSchema.index({ organizationId: 1, floorId: 1, status: 1 });
unitSchema.index({ organizationId: 1, propertyId: 1, status: 1 });

export type UnitDocument = InferSchemaType<typeof unitSchema>;
export const Unit = model('Unit', unitSchema);
