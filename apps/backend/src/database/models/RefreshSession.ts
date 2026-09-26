import { Schema, model, type InferSchemaType } from 'mongoose';

const refreshSessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, index: true },
  expiresAt: { type: Date, required: true, index: true },
  revokedAt: Date,
  replacedBySessionId: { type: Schema.Types.ObjectId, ref: 'RefreshSession' },
  userAgent: { type: String, maxlength: 1000 },
  ipAddress: { type: String, maxlength: 100 }
}, { timestamps: true });

refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RefreshSessionDocument = InferSchemaType<typeof refreshSessionSchema>;
export const RefreshSession = model('RefreshSession', refreshSessionSchema);
