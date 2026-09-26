import { Schema, model, type InferSchemaType } from 'mongoose';

const roleSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  name: { type: String, required: true, trim: true },
  key: { type: String, required: true, trim: true, uppercase: true },
  description: { type: String, trim: true },
  system: { type: Boolean, default: false, index: true },
  permissions: [{ type: String, index: true }],
  assignable: { type: Boolean, default: true }
}, { timestamps: true });

roleSchema.index({ organizationId: 1, key: 1 }, { unique: true, partialFilterExpression: { organizationId: { $type: 'objectId' } } });
roleSchema.index({ key: 1 }, { unique: true, partialFilterExpression: { system: true, organizationId: null } });

export type RoleDocument = InferSchemaType<typeof roleSchema>;
export const Role = model('Role', roleSchema);
