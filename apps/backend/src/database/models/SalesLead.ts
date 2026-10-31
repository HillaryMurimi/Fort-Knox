import { model, Schema } from 'mongoose';

const salesLeadSchema = new Schema({
  reference: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  phone: { type: String, trim: true, maxlength: 40 },
  email: { type: String, lowercase: true, trim: true, maxlength: 240 },
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
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
  contacts: { type: [new Schema({ name: { type: String, required: true }, email: String, phone: String, title: String }, { _id: false })], default: [] },
  optedOutAt: Date,
  consent: { type: String, enum: ['UNKNOWN', 'OPTED_IN', 'OPTED_OUT'], default: 'UNKNOWN' },
  revision: { type: Number, default: 0 },
  demoProfile: { type: Schema.Types.Mixed },
  pilotOrganizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
  crm: { type: Map, of: Schema.Types.Mixed, default: () => ({}) },
}, { timestamps: true });

salesLeadSchema.index({ email: 1, createdAt: -1 });
salesLeadSchema.index({ organizationId: 1 }, { unique: true, partialFilterExpression: { organizationId: { $type: 'objectId' } }, name: 'sales_customer_org_unique' });
salesLeadSchema.index({ assignedTo: 1, createdAt: -1 });
export const SalesLead = model('SalesLead', salesLeadSchema);
