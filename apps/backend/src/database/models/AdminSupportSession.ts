import { Schema, model, type InferSchemaType } from 'mongoose';

const adminSupportSessionSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  adminUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  adminSessionId: { type: Schema.Types.ObjectId, ref: 'RefreshSession', required: true },
  ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  purpose: { type: String, required: true, minlength: 10, maxlength: 500 },
  permission: { type: String, enum: ['PROPERTY_SETUP'], required: true },
  status: { type: String, enum: ['REQUESTED', 'ACTIVE', 'ENDED', 'REJECTED'], required: true, default: 'REQUESTED' },
  requestedAt: { type: Date, required: true },
  requestExpiresAt: { type: Date, required: true },
  approvedAt: Date,
  expiresAt: Date,
  endedAt: Date,
  useCount: { type: Number, default: 0 },
}, { timestamps: true });

adminSupportSessionSchema.index({ organizationId: 1, status: 1, requestedAt: -1 });
adminSupportSessionSchema.index({ adminUserId: 1, status: 1, expiresAt: 1 });

export type AdminSupportSessionDocument = InferSchemaType<typeof adminSupportSessionSchema>;
export const AdminSupportSession = model('AdminSupportSession', adminSupportSessionSchema);
