import { Schema, model, type InferSchemaType } from 'mongoose';

const userSchema = new Schema({
  phone: { type: String, required: true, unique: true, index: true, trim: true },
  email: { type: String, lowercase: true, trim: true, sparse: true, unique: true, index: true },
  passwordHash: { type: String, select: false },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  status: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'], default: 'ACTIVE', index: true },
  isPlatformAdmin: { type: Boolean, default: false, index: true },
  lastLoginAt: Date,
  verifiedAt: Date
}, { timestamps: true });

export type UserDocument = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);
