import { Schema, model, type InferSchemaType } from 'mongoose';

const schema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  code: { type: String, required: true, trim: true, maxlength: 120 },
  title: { type: String, required: true, trim: true, maxlength: 240 },
  reason: { type: String, required: true, trim: true, maxlength: 2000 },
  recommendedAction: { type: String, required: true, trim: true, maxlength: 2000 },
  priority: { type: String, enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'], required: true, index: true },
  status: { type: String, enum: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'], default: 'OPEN', index: true },
  source: { type: String, enum: ['FINANCE', 'OCCUPANCY', 'MAINTENANCE', 'SECURITY', 'COMPLIANCE', 'ANOMALY', 'RISK', 'INTELLIGENCE'], required: true },
  targetResourceType: { type: String, maxlength: 80 },
  targetResourceId: { type: Schema.Types.ObjectId },
  urgencyScore: { type: Number, required: true, min: 0, max: 100 },
  financialImpact: { type: Number, required: true, min: 0 },
  moneyAtRisk: { type: Number, required: true, min: 0 },
  confidence: { type: Number, required: true, min: 0, max: 1 },
  detectedAt: { type: Date, required: true, index: true },
  dueAt: { type: Date },
  lastEvaluatedAt: { type: Date, required: true },
  escalationLevel: { type: Number, min: 0, max: 3, default: 0 },
  escalatedAt: { type: Date },
  acknowledgedAt: { type: Date },
  acknowledgedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: { type: Date },
  resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  metadata: { type: Map, of: Schema.Types.Mixed, default: () => ({}) }
}, { timestamps: true });

schema.index({ organizationId: 1, propertyId: 1, code: 1, status: 1 });
schema.index({ organizationId: 1, status: 1, priority: 1, moneyAtRisk: -1 });
export type LandlordActionDocument = InferSchemaType<typeof schema>;
export const LandlordAction = model('LandlordAction', schema);
