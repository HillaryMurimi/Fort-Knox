import { Schema, model, type InferSchemaType } from 'mongoose';

const schema = new Schema({
  key: { type: String, required: true, unique: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
  method: { type: String, required: true },
  path: { type: String, required: true },
  requestHash: { type: String, required: true },
  status: { type: String, enum: ['PROCESSING', 'COMPLETED'], required: true, default: 'PROCESSING' },
  statusCode: Number,
  responseBody: Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now, expires: 86400 },
}, { timestamps: true });

schema.index({ userId: 1, key: 1 }, { unique: true, sparse: true });

export type IdempotencyRecordDocument = InferSchemaType<typeof schema>;
export const IdempotencyRecord = model('IdempotencyRecord', schema);
