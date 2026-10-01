import { model, Schema } from 'mongoose';

const propertyOnboardingRequestSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  properties: [{
    name: { type: String, required: true, trim: true },
    location: { type: String, trim: true },
    buildings: { type: Number, required: true, min: 1 },
    units: { type: Number, required: true, min: 1 },
  }],
  preferredDate: Date,
  notes: { type: String, trim: true, maxlength: 5000 },
  status: { type: String, required: true, enum: ['REQUESTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'], default: 'REQUESTED', index: true },
  crm: { type: Map, of: Schema.Types.Mixed, default: () => ({}) },
}, { timestamps: true });

propertyOnboardingRequestSchema.index({ organizationId: 1, createdAt: -1 });
export const PropertyOnboardingRequest = model('PropertyOnboardingRequest', propertyOnboardingRequestSchema);