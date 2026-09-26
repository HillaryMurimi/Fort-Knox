import { Schema, model, type InferSchemaType } from 'mongoose';

const onboardingSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  phone: { type: String, required: true, trim: true, index: true },
  tenantUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
  floorId: { type: Schema.Types.ObjectId, ref: 'Floor', required: true, index: true },
  unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
  status: { type: String, enum: ['PRE_REGISTERED', 'OTP_SENT', 'VERIFIED', 'COMPLETED', 'REJECTED', 'EXPIRED'], default: 'PRE_REGISTERED', index: true },
  otpHash: { type: String },
  otpExpiresAt: { type: Date },
  otpAttempts: { type: Number, default: 0 },
  verifiedAt: Date,
  completedAt: Date,
  expiresAt: { type: Date, required: true, index: true },
  initiatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  metadata: { type: Map, of: Schema.Types.Mixed, default: () => ({}) },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

onboardingSchema.index({ organizationId: 1, phone: 1, status: 1 });
onboardingSchema.index({ organizationId: 1, unitId: 1, status: 1 });

export type TenantOnboardingDocument = InferSchemaType<typeof onboardingSchema>;
export const TenantOnboarding = model('TenantOnboarding', onboardingSchema);
