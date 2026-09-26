import { Schema, model } from 'mongoose';

const schema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  provider: { type: String, enum: ['google', 'facebook', 'apple'], required: true },
  stateHash: String,
  nonce: String,
  verifier: String,
  subject: String,
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['STARTED', 'VERIFIED', 'CHALLENGED', 'CONSUMED'], required: true },
  firstName: String,
  lastName: String,
  email: String,
  phone: String,
  organizationName: String,
  codeHash: String,
  codeExpiresAt: Date,
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const SocialAuthFlow = model('SocialAuthFlow', schema);
