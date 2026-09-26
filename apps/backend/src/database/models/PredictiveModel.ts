import { Schema, model, type InferSchemaType } from 'mongoose';

const schema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  domain: { type: String, enum: ['ARREARS', 'VACANCY', 'REVENUE'], required: true, index: true },
  version: { type: String, required: true },
  modelType: { type: String, enum: ['LOGISTIC_REGRESSION', 'RIDGE_REGRESSION'], required: true },
  featureNames: [{ type: String, required: true }],
  means: [{ type: Number, required: true }],
  scales: [{ type: Number, required: true }],
  coefficients: [{ type: Number, required: true }],
  intercept: { type: Number, required: true },
  calibration: {
    kind: { type: String, enum: ['PLATT', 'LINEAR'], required: true },
    slope: { type: Number, required: true, default: 1 },
    intercept: { type: Number, required: true, default: 0 },
  },
  metrics: {
    sampleCount: { type: Number, required: true },
    trainCount: { type: Number, required: true },
    validationCount: { type: Number, required: true },
    accuracy: Number,
    precision: Number,
    recall: Number,
    f1: Number,
    auc: Number,
    brierScore: Number,
    mae: Number,
    rmse: Number,
    r2: Number,
  },
  validationPassed: { type: Boolean, required: true, index: true },
  status: { type: String, enum: ['CANDIDATE', 'VALIDATED', 'PROMOTED', 'RETIRED'], required: true, index: true },
  trainedAt: { type: Date, required: true, index: true },
  promotedAt: Date,
  retiredAt: Date,
  metadata: { type: Map, of: Schema.Types.Mixed, default: () => ({}) },
}, { timestamps: true });

schema.index({ organizationId: 1, domain: 1, trainedAt: -1 });
schema.index({ organizationId: 1, domain: 1, status: 1 });
schema.index({ organizationId: 1, domain: 1, version: 1 }, { unique: true });

export type PredictiveModelDocument = InferSchemaType<typeof schema>;
export const PredictiveModel = model('PredictiveModel', schema);
