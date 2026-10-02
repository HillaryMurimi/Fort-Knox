import { Schema, model } from 'mongoose';

const signature = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  signedAt: { type: Date, required: true },
  authorityConfirmed: { type: Boolean, required: true },
  termsAccepted: { type: Boolean, required: true },
  representation: { type: String, required: true },
  documentHash: { type: String, required: true },
  evidenceHash: { type: String, required: true },
  requestId: String, ipAddress: String, userAgent: String,
}, { _id: false });
const schema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  generation: { type: Number, required: true, min: 1 },
  templateVersionId: { type: Schema.Types.ObjectId, ref: 'ContractTemplate', required: true },
  templateId: { type: String, required: true },
  templateVersion: { type: Number, required: true },
  templateHash: { type: String, required: true },
  templateName: { type: String, required: true },
  body: { type: String, required: true },
  sha256: { type: String, required: true },
  snapshot: { type: Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['PENDING_SIGNATURE', 'SIGNED'], default: 'PENDING_SIGNATURE', required: true },
  signature: { type: signature },
  documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
  signedDocumentId: { type: Schema.Types.ObjectId, ref: 'Document' },
  replacesContractId: { type: Schema.Types.ObjectId, ref: 'OrganizationContract' },
  replacementReason: String,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });
schema.index({ organizationId: 1, generation: 1 }, { unique: true });
schema.pre('save', async function () {
  if (this.isNew) return;
  const previous = await model('OrganizationContract').findById(this._id).session(this.$session());
  if (previous?.status === 'SIGNED' && this.isModified()) throw new Error('SIGNED_CONTRACT_IMMUTABLE');
  if (['organizationId', 'generation', 'templateVersionId', 'templateId', 'templateVersion', 'templateHash', 'templateName', 'body', 'sha256', 'snapshot', 'documentId', 'replacesContractId', 'replacementReason', 'createdBy'].some(key => this.isModified(key))) throw new Error('CONTRACT_SNAPSHOT_IMMUTABLE');
});
schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'], function () { throw new Error('CONTRACT_SNAPSHOT_IMMUTABLE'); });
export const OrganizationContract = model('OrganizationContract', schema);
