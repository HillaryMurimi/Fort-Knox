import { model, Schema, Types } from 'mongoose';

const platformSwitchSchema = new Schema({
  key: { type: String, required: true, unique: true, index: true, uppercase: true, trim: true },
  kind: { type: String, required: true, enum: ['SERVICE', 'FEATURE'] },
  name: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  environment: { type: String, required: true, default: 'ALL' },
  enabled: { type: Boolean, required: true, default: false },
  mode: { type: String, required: true, enum: ['ON', 'OFF', 'MAINTENANCE'], default: 'OFF' },
  reason: { type: String, required: true, default: 'Disabled until release readiness is confirmed.' },
  modifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  modifiedAt: { type: Date },
}, { timestamps: true });

export type PlatformSwitchDocument = {
  _id: Types.ObjectId;
  key: string;
  kind: 'SERVICE' | 'FEATURE';
  name: string;
  description: string;
  environment: string;
  enabled: boolean;
  mode: 'ON' | 'OFF' | 'MAINTENANCE';
  reason: string;
  modifiedBy?: Types.ObjectId;
  modifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export const PlatformSwitch = model('PlatformSwitch', platformSwitchSchema);