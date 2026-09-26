import { Schema, model, type InferSchemaType } from 'mongoose';

const tenantSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['PROSPECT', 'ACTIVE', 'INACTIVE', 'BLACKLISTED'], default: 'PROSPECT', index: true },
  nationalIdLast4: { type: String, trim: true, maxlength: 4 },
  dateOfBirth: { type: Date },
  emergencyContact: {
    name: { type: String, trim: true, maxlength: 160 },
    phone: { type: String, trim: true, maxlength: 40 },
    relationship: { type: String, trim: true, maxlength: 80 }
  },
  notes: { type: String, trim: true, maxlength: 5000 },
  metadata: { type: Map, of: Schema.Types.Mixed, default: () => ({}) },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

tenantSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
tenantSchema.index({ organizationId: 1, status: 1 });

export type TenantDocument = InferSchemaType<typeof tenantSchema>;
export const Tenant = model('Tenant', tenantSchema);
