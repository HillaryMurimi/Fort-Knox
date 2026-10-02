import { Schema, model } from 'mongoose';

const otpChallengeSchema = new Schema({
  phone: { type: String, required: true, index: true },
  codeHash: { type: String, required: true },
  purpose: { type: String, enum: ['LOGIN', 'ONBOARDING', 'STEP_UP', 'ADMIN_LOGIN', 'ADMIN_STEP_UP', 'ADMIN_ENROLLMENT'], required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  flowId: { type: Schema.Types.ObjectId, ref: 'AdminAuthFlow' },
  channel: { type: String, enum: ['EMAIL', 'SMS'] },
  generation: Number,
  deliveryStatus: { type: String, enum: ['PENDING', 'SENT', 'FAILED'] },
  nextVerifyAt: Date,
  attempts: { type: Number, default: 0 },
  consumedAt: Date,
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

otpChallengeSchema.index({ flowId: 1, channel: 1, generation: 1 });
otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const OtpChallenge = model('OtpChallenge', otpChallengeSchema);
