import { Schema, model, type InferSchemaType } from 'mongoose';

const dimensionSchema = new Schema({
  score: { type: Number, required: true, min: 0, max: 100 },
  weight: { type: Number, required: true, min: 0, max: 100 },
  weightedScore: { type: Number, required: true, min: 0, max: 100 },
  signals: [{ type: String }]
}, { _id: false });

const schema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  asOf: { type: Date, required: true, index: true },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  score: { type: Number, required: true, min: 0, max: 100 },
  grade: { type: String, enum: ['EXCELLENT', 'GOOD', 'WATCH', 'AT_RISK', 'CRITICAL'], required: true },
  dimensions: {
    financial: { type: dimensionSchema, required: true },
    operational: { type: dimensionSchema, required: true },
    security: { type: dimensionSchema, required: true }
  },
  metrics: { type: Schema.Types.Mixed, required: true },
  warningCodes: [{ type: String }],
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

schema.index({ organizationId: 1, propertyId: 1, asOf: -1 });
schema.index({ organizationId: 1, propertyId: 1, periodStart: 1, periodEnd: 1, asOf: -1 });

export type PropertyHealthSnapshotDocument = InferSchemaType<typeof schema>;
export const PropertyHealthSnapshot = model('PropertyHealthSnapshot', schema);
