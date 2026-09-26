import { Schema, model, type InferSchemaType } from 'mongoose';

const scopeSchema = new Schema({
  allProperties: { type: Boolean, default: false },
  propertyIds: [{ type: Schema.Types.ObjectId }],
  buildingIds: [{ type: Schema.Types.ObjectId }],
  unitIds: [{ type: Schema.Types.ObjectId }]
}, { _id: false });

const membershipSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  roleIds: [{ type: Schema.Types.ObjectId, ref: 'Role', required: true }],
  scope: { type: scopeSchema, default: () => ({}) },
  status: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'REMOVED'], default: 'ACTIVE', index: true },
  invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  joinedAt: Date,
  lastAccessAt: Date
}, { timestamps: true });

membershipSchema.index({ userId: 1, organizationId: 1 }, { unique: true });

export type OrganizationMembershipDocument = InferSchemaType<typeof membershipSchema>;
export const OrganizationMembership = model('OrganizationMembership', membershipSchema);
