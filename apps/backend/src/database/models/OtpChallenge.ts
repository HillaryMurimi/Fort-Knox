import { Schema, model } from 'mongoose';

const otpChallengeSchema = new Schema({
  phone: { type: String, required: true, index: true },
  codeHash: { type: String, required: true },
  purpose: { type: String, enum: ['LOGIN', 'ONBOARDING', 'STEP_UP'], required: true },
  attempts: { type: Number, default: 0 },
  consumedAt: Date,
  expiresAt: { type: Date, required: true, index: true }
}, { timestamps: true });

otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const OtpChallenge = model('OtpChallenge', otpChallengeSchema);
