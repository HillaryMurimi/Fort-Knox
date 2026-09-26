import { Schema, model, type InferSchemaType } from 'mongoose';

const schema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  domain: { type: String, enum: ['ARREARS', 'VACANCY', 'REVENUE'], required: true, index: true },
  startedAt: { type: Date, required: true, index: true },
  completedAt: Date,
  status: { type: String, enum: ['RUNNING', 'SUCCEEDED', 'FAILED', 'INSUFFICIENT_DATA'], required: true, index: true },
  sampleCount: { type: Number, default: 0 },
  trainCount: { type: Number, default: 0 },
  validationCount: { type: Number, default: 0 },
  modelId: { type: Schema.Types.ObjectId, ref: 'PredictiveModel' },
  metrics: { type: Map, of: Number, default: () => ({}) },
  error: String,
  metadata: { type: Map, of: Schema.Types.Mixed, default: () => ({}) },
}, { timestamps: true });

schema.index({ organizationId: 1, domain: 1, startedAt: -1 });
export type ModelTrainingRunDocument = InferSchemaType<typeof schema>;
export const ModelTrainingRun = model('ModelTrainingRun', schema);
