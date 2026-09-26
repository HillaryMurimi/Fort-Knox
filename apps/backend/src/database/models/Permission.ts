import { Schema, model, type InferSchemaType } from 'mongoose';

const permissionSchema = new Schema({
  key: { type: String, required: true, unique: true, index: true, trim: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  resource: { type: String, required: true, index: true },
  actions: [{ type: String, required: true }],
  system: { type: Boolean, default: true, index: true }
}, { timestamps: true });

export type PermissionDocument = InferSchemaType<typeof permissionSchema>;
export const Permission = model('Permission', permissionSchema);
