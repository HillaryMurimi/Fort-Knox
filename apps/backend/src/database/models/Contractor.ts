import { Schema, model, type InferSchemaType } from 'mongoose';

const contractorSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  phone: { type: String, required: true, trim: true, maxlength: 40 },
  email: { type: String, trim: true, lowercase: true, maxlength: 254 },
  trade: { type: String, required: true, trim: true, maxlength: 100 },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'], default: 'ACTIVE', index: true },
  rating: { type: Number, min: 0, max: 5 },
  notes: { type: String, trim: true, maxlength: 5000 },
  metadata: { type: Map, of: Schema.Types.Mixed, default: () => ({}) },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
contractorSchema.index({ organizationId: 1, name: 1 });
contractorSchema.index({ organizationId: 1, userId: 1 }, { unique: true, sparse: true });
contractorSchema.index({ organizationId: 1, trade: 1, status: 1 });
export type ContractorDocument = InferSchemaType<typeof contractorSchema>;
export const Contractor = model('Contractor', contractorSchema);
