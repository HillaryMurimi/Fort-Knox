import { model, Schema } from 'mongoose';
const schema = new Schema({
  key: { type: String, required: true },
  environment: { type: String, required: true, enum: ['development', 'test', 'staging', 'production'] },
  revision: { type: Number, required: true, default: 0 },
  onboarding: { type: String, enum: ['NOT_STARTED', 'AWAITING_DOCUMENTS', 'SUBMITTED', 'APPROVED'], default: 'NOT_STARTED', required: true },
  staging: { type: String, enum: ['NOT_TESTED', 'PASSED', 'FAILED', 'NOT_APPLICABLE'], default: 'NOT_TESTED', required: true },
  responsibleOwner: { type: String, default: '', maxlength: 120 },
  targetDate: { type: String, default: null },
  nextAction: { type: String, default: '', maxlength: 300 },
  blocker: { type: String, default: '', maxlength: 500 },
  severity: { type: String, enum: ['NONE', 'LOW', 'HIGH', 'CRITICAL'], default: 'NONE', required: true },
  verificationNote: { type: String, default: '', maxlength: 500 },
  verifiedAt: { type: Date, default: null },
  modifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
schema.index({ environment: 1, key: 1 }, { unique: true });
export const LaunchReadiness = model('LaunchReadiness', schema);
