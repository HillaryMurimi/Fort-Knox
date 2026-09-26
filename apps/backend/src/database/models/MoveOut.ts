import { Schema, model, type InferSchemaType } from 'mongoose';

const deductionSchema = new Schema({
  category: { type: String, enum: ['DAMAGE', 'UNPAID_RENT', 'UNPAID_SERVICE_CHARGE', 'UTILITY', 'CLEANING', 'OTHER'], required: true },
  description: { type: String, required: true, trim: true, maxlength: 1000 },
  amount: { type: Number, min: 0, required: true },
  evidenceIds: [{ type: Schema.Types.ObjectId }]
}, { _id: true });

const moveOutSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
  floorId: { type: Schema.Types.ObjectId, ref: 'Floor', required: true, index: true },
  unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  tenancyId: { type: Schema.Types.ObjectId, ref: 'Tenancy', required: true, unique: true },
  status: { type: String, enum: ['INITIATED', 'INSPECTION_PENDING', 'RECONCILIATION_PENDING', 'COMPLETED', 'CANCELLED'], default: 'INITIATED', index: true },
  requestedMoveOutDate: { type: Date, required: true },
  actualMoveOutDate: Date,
  inspection: {
    condition: { type: String, enum: ['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'] },
    notes: { type: String, trim: true, maxlength: 5000 },
    evidenceIds: [{ type: Schema.Types.ObjectId }],
    inspectedAt: Date,
    inspectedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  meterReadings: [{
    meterType: { type: String, trim: true, maxlength: 50, required: true },
    reading: { type: Number, min: 0, required: true },
    unit: { type: String, trim: true, maxlength: 20 },
    recordedAt: { type: Date, required: true }
  }],
  deductions: { type: [deductionSchema], default: [] },
  depositAmount: { type: Number, min: 0, required: true, default: 0 },
  totalDeductions: { type: Number, min: 0, default: 0 },
  depositRefund: { type: Number, min: 0, default: 0 },
  outstandingBalance: { type: Number, min: 0, default: 0 },
  reconciliationNotes: { type: String, trim: true, maxlength: 5000 },
  completedAt: Date,
  completedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

moveOutSchema.index({ organizationId: 1, unitId: 1, status: 1 });
moveOutSchema.index({ organizationId: 1, tenantId: 1, status: 1 });

export type MoveOutDocument = InferSchemaType<typeof moveOutSchema>;
export const MoveOut = model('MoveOut', moveOutSchema);
