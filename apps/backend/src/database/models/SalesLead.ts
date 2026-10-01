import { model, Schema } from 'mongoose';

const salesLeadSchema = new Schema({
  reference: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  phone: { type: String, required: true, trim: true, maxlength: 40 },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 240 },
  properties: { type: Number, required: true, min: 1 },
  units: { type: String, required: true, trim: true, maxlength: 40 },
  challenge: { type: String, required: true, trim: true, maxlength: 5000 },
  source: { type: String, required: true, default: 'Website' },
  sourceUrl: { type: String, trim: true, maxlength: 1000 },
  stage: { type: String, required: true, default: 'Contact Established', index: true },
  leadStatus: { type: String, required: true, default: 'New', index: true },
  productFit: { type: String, default: 'Undetermined' },
  priority: { type: String, default: 'NURTURE' },
  nextAction: { type: String, default: 'Schedule demo' },
  nextActionDate: Date,
  crm: { type: Map, of: Schema.Types.Mixed, default: () => ({}) },
}, { timestamps: true });

salesLeadSchema.index({ email: 1, createdAt: -1 });
export const SalesLead = model('SalesLead', salesLeadSchema);