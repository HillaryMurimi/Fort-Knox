import { Schema, model } from 'mongoose';

const schema = new Schema({
  provider: { type: String, enum: ['google', 'facebook', 'apple'], required: true },
  subject: { type: String, required: true, maxlength: 255 },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, { timestamps: true });
schema.index({ provider: 1, subject: 1 }, { unique: true });
export const SocialIdentity = model('SocialIdentity', schema);
