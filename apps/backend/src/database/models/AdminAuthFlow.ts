import { Schema, model } from 'mongoose';

// Temporary password-bound workflow; never an authenticated session.
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true, unique: true },
  purpose: { type: String, enum: ['LOGIN', 'STEP_UP', 'ENROLLMENT'], required: true },
  stage: { type: String, enum: ['CHANNEL', 'EMAIL', 'SMS', 'VERIFIED', 'COMPLETED', 'INVALIDATED'], required: true },
  selectedChannel: { type: String, enum: ['EMAIL', 'SMS'] },
  sessionId: { type: Schema.Types.ObjectId, ref: 'RefreshSession' },
  contactsHash: { type: String, required: true },
  userFlowGeneration: { type: Number, required: true },
  authVersion: { type: Number, required: true },
  passwordVerifiedAt: { type: Date, required: true },
  emailVerifiedAt: Date,
  smsVerifiedAt: Date,
  nextSendAt: { type: Date, required: true },
  resendCount: { type: Number, default: 0 },
  generation: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
schema.index({ userId: 1, purpose: 1, stage: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const AdminAuthFlow = model('AdminAuthFlow', schema);
