import { Schema, model, type InferSchemaType } from 'mongoose';

const inventoryItemSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
  floorId: { type: Schema.Types.ObjectId, ref: 'Floor', required: true, index: true },
  unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
  assetTag: { type: String, required: true, trim: true, uppercase: true, maxlength: 80 },
  name: { type: String, required: true, trim: true, maxlength: 180 },
  category: { type: String, required: true, trim: true, maxlength: 100 },
  serialNumber: { type: String, trim: true, maxlength: 160 },
  condition: { type: String, enum: ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED', 'DISPOSED'], default: 'GOOD', index: true },
  status: { type: String, enum: ['ACTIVE', 'MISSING', 'UNDER_REPAIR', 'DISPOSED'], default: 'ACTIVE', index: true },
  purchaseCost: { type: Number, min: 0 },
  purchaseDate: Date,
  warrantyExpiry: Date,
  maintenanceIntervalDays: { type: Number, min: 1 },
  lastServicedAt: Date,
  nextServiceDueAt: Date,
  notes: { type: String, trim: true, maxlength: 5000 },
  evidenceIds: [{ type: Schema.Types.ObjectId }],
  metadata: { type: Map, of: Schema.Types.Mixed, default: () => ({}) },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
inventoryItemSchema.index({ organizationId: 1, assetTag: 1 }, { unique: true });
inventoryItemSchema.index({ organizationId: 1, unitId: 1, status: 1 });
inventoryItemSchema.index({ organizationId: 1, nextServiceDueAt: 1, status: 1 });
export type InventoryItemDocument = InferSchemaType<typeof inventoryItemSchema>;
export const InventoryItem = model('InventoryItem', inventoryItemSchema);
