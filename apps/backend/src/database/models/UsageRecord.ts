import { Schema, model, type InferSchemaType } from 'mongoose';

const usageRecordSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  metric: { type: String, enum: ['PROPERTIES', 'UNITS', 'USERS', 'TENANTS', 'STORAGE_BYTES', 'API_REQUESTS'], required: true },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  quantity: { type: Number, required: true, min: 0 },
  source: { type: String, enum: ['SNAPSHOT', 'EVENT', 'MANUAL', 'SYSTEM'], required: true },
  sourceRef: { type: String },
  metadata: { type: Schema.Types.Mixed, default: {} },
  recordedAt: { type: Date, required: true, default: Date.now }
}, { timestamps: true });

usageRecordSchema.index({ organizationId: 1, metric: 1, periodStart: 1, periodEnd: 1 }, { unique: true });
export type UsageRecordDocument = InferSchemaType<typeof usageRecordSchema>;
export const UsageRecord = model('UsageRecord', usageRecordSchema);
