import { Schema, model, type InferSchemaType } from 'mongoose';

const invitationSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  invitedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  email: { type: String, lowercase: true, trim: true, sparse: true, index: true },
  phone: { type: String, trim: true, sparse: true, index: true },
  role: { type: String, enum: ['PROPERTY_MANAGER', 'CARETAKER', 'CONTRACTOR', 'TENANT'], required: true, index: true },
  propertyIds: [{ type: Schema.Types.ObjectId, ref: 'Property' }],
  buildingIds: [{ type: Schema.Types.ObjectId, ref: 'Building' }],
  unitIds: [{ type: Schema.Types.ObjectId, ref: 'Unit' }],
  tenancyId: { type: Schema.Types.ObjectId, ref: 'Tenancy' },
  contractorId: { type: Schema.Types.ObjectId, ref: 'Contractor' },
  status: { type: String, enum: ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'], default: 'PENDING', index: true },
  tokenHash: { type: String, required: true, unique: true, index: true },
  expiresAt: { type: Date, required: true, index: true },
  acceptedAt: Date,
  revokedAt: Date
}, { timestamps: true });

invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
invitationSchema.index({ organizationId: 1, status: 1 });

export type InvitationDocument = InferSchemaType<typeof invitationSchema>;
export const Invitation = model('Invitation', invitationSchema);
