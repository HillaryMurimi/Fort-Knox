import { Schema, model, type InferSchemaType } from 'mongoose';

const policySchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, unique: true },
  approvalThreshold: { type: Number, required: true, min: 0, default: 5000 },
  autoApproveRoles: [{ type: String, trim: true }],
  emergencyAutoApprove: { type: Boolean, default: false },
  currency: { type: String, required: true, trim: true, uppercase: true, maxlength: 3, default: 'KES' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
export type MaintenanceApprovalPolicyDocument = InferSchemaType<typeof policySchema>;
export const MaintenanceApprovalPolicy = model('MaintenanceApprovalPolicy', policySchema);
