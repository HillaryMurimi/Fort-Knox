import { Schema, model, type InferSchemaType } from 'mongoose';

const inspectionSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
  floorId: { type: Schema.Types.ObjectId, ref: 'Floor', required: true, index: true },
  unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
  tenancyId: { type: Schema.Types.ObjectId, ref: 'Tenancy', index: true },
  maintenanceRequestId: { type: Schema.Types.ObjectId, ref: 'MaintenanceRequest', index: true },
  type: { type: String, enum: ['MOVE_IN', 'MOVE_OUT', 'ROUTINE', 'MAINTENANCE', 'SAFETY', 'INVENTORY'], required: true, index: true },
  status: { type: String, enum: ['DRAFT', 'IN_PROGRESS', 'COMPLETED', 'VOID'], default: 'DRAFT', index: true },
  overallCondition: { type: String, enum: ['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'] },
  checklist: [{
    item: { type: String, required: true, trim: true, maxlength: 180 },
    condition: { type: String, enum: ['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED', 'NOT_APPLICABLE'], required: true },
    notes: { type: String, trim: true, maxlength: 2000 },
    evidenceIds: [{ type: Schema.Types.ObjectId }]
  }],
  meterReadings: [{ meterType: { type: String, required: true, trim: true, maxlength: 50 }, reading: { type: Number, required: true, min: 0 }, unit: { type: String, trim: true, maxlength: 20 } }],
  notes: { type: String, trim: true, maxlength: 10000 },
  evidenceIds: [{ type: Schema.Types.ObjectId }],
  inspectedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  completedAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
inspectionSchema.index({ organizationId: 1, unitId: 1, type: 1, createdAt: -1 });
inspectionSchema.index({ organizationId: 1, maintenanceRequestId: 1 });
export type InspectionDocument = InferSchemaType<typeof inspectionSchema>;
export const Inspection = model('Inspection', inspectionSchema);
