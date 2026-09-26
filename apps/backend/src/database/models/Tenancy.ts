import { Schema, model, type InferSchemaType } from 'mongoose';

const tenancySchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
  floorId: { type: Schema.Types.ObjectId, ref: 'Floor', required: true, index: true },
  unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  status: { type: String, enum: ['DRAFT', 'PENDING', 'ACTIVE', 'NOTICE', 'MOVED_OUT', 'TERMINATED'], default: 'DRAFT', index: true },
  leaseNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 80 },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  monthlyRent: { type: Number, min: 0, required: true },
  serviceCharge: { type: Number, min: 0, default: 0 },
  depositAmount: { type: Number, min: 0, default: 0 },
  billingDay: { type: Number, min: 1, max: 28, default: 1 },
  noticePeriodDays: { type: Number, min: 0, max: 365, default: 30 },
  signedLeaseDocumentId: { type: Schema.Types.ObjectId },
  notes: { type: String, trim: true, maxlength: 5000 },
  activatedAt: Date,
  movedOutAt: Date,
  terminatedAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

tenancySchema.index({ organizationId: 1, leaseNumber: 1 }, { unique: true });
tenancySchema.index({ organizationId: 1, unitId: 1, status: 1 });
tenancySchema.index({ organizationId: 1, tenantId: 1, status: 1 });
tenancySchema.index({ organizationId: 1, startDate: 1, endDate: 1 });

export type TenancyDocument = InferSchemaType<typeof tenancySchema>;
export const Tenancy = model('Tenancy', tenancySchema);
