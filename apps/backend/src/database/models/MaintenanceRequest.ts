import { Schema, model, type InferSchemaType } from 'mongoose';

const maintenanceRequestSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
  floorId: { type: Schema.Types.ObjectId, ref: 'Floor', required: true, index: true },
  unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
  reportedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  assignedToUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  contractorId: { type: Schema.Types.ObjectId, ref: 'Contractor', index: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  description: { type: String, required: true, trim: true, maxlength: 10000 },
  category: { type: String, enum: ['PLUMBING', 'ELECTRICAL', 'STRUCTURAL', 'SECURITY', 'CLEANING', 'APPLIANCE', 'HVAC', 'PEST_CONTROL', 'OTHER'], required: true, index: true },
  priority: { type: String, enum: ['EMERGENCY', 'HIGH', 'MEDIUM', 'LOW'], required: true, default: 'MEDIUM', index: true },
  status: { type: String, enum: ['NEW', 'TRIAGED', 'ASSIGNED', 'QUOTED', 'APPROVAL_REQUIRED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'CLOSED', 'CANCELLED'], default: 'NEW', index: true },
  evidenceIds: [{ type: Schema.Types.ObjectId }],
  quoteAmount: { type: Number, min: 0 },
  approvedAmount: { type: Number, min: 0 },
  actualAmount: { type: Number, min: 0 },
  approvalRequired: { type: Boolean, default: false, index: true },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  completedAt: Date,
  verifiedAt: Date,
  closedAt: Date,
  resolutionNotes: { type: String, trim: true, maxlength: 10000 },
  metadata: { type: Map, of: Schema.Types.Mixed, default: () => ({}) },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
maintenanceRequestSchema.index({ organizationId: 1, unitId: 1, status: 1, createdAt: -1 });
maintenanceRequestSchema.index({ organizationId: 1, contractorId: 1, status: 1 });
maintenanceRequestSchema.index({ organizationId: 1, priority: 1, status: 1 });
export type MaintenanceRequestDocument = InferSchemaType<typeof maintenanceRequestSchema>;
export const MaintenanceRequest = model('MaintenanceRequest', maintenanceRequestSchema);
