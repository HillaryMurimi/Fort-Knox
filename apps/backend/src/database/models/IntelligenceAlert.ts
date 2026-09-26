import { Schema, model, type InferSchemaType } from 'mongoose';

const schema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  code: { type: String, required: true, trim: true, maxlength: 120, index: true },
  severity: { type: String, enum: ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], required: true, index: true },
  status: { type: String, enum: ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'], default: 'OPEN', index: true },
  title: { type: String, required: true, trim: true, maxlength: 240 },
  message: { type: String, required: true, trim: true, maxlength: 2000 },
  source: { type: String, enum: ['FINANCE', 'OPERATIONS', 'SECURITY', 'OCCUPANCY', 'COMPLIANCE', 'INTELLIGENCE'], required: true },
  metric: { type: String, required: true, maxlength: 120 },
  observedValue: { type: Number },
  thresholdValue: { type: Number },
  firstDetectedAt: { type: Date, required: true, index: true },
  lastDetectedAt: { type: Date, required: true, index: true },
  acknowledgedAt: Date,
  acknowledgedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: Date,
  resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  metadata: { type: Map, of: Schema.Types.Mixed, default: () => ({}) }
}, { timestamps: true });

schema.index({ organizationId: 1, propertyId: 1, code: 1, status: 1 });
schema.index({ organizationId: 1, severity: 1, status: 1, lastDetectedAt: -1 });

export type IntelligenceAlertDocument = InferSchemaType<typeof schema>;
export const IntelligenceAlert = model('IntelligenceAlert', schema);
