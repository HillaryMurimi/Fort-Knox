import { Schema, model } from 'mongoose';

const schema = new Schema({
  templateId: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  version: { type: Number, required: true, min: 1 },
  effectiveAt: { type: Date, required: true },
  status: { type: String, enum: ['DRAFT', 'ACTIVE', 'RETIRED'], default: 'DRAFT', required: true },
  plans: { type: [String], required: true },
  variables: { type: [String], required: true },
  body: { type: String, required: true, maxlength: 50000 },
  sha256: { type: String, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });
schema.index({ templateId: 1, version: 1 }, { unique: true });
schema.index({ plans: 1 }, { unique: true, partialFilterExpression: { status: 'ACTIVE' } });
schema.index({ templateId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'ACTIVE' } });
// Content is append-only. Publishing/retiring changes availability, never the version's terms.
schema.pre('save', function () {
  if (!this.isNew && ['templateId', 'name', 'version', 'effectiveAt', 'plans', 'variables', 'body', 'sha256', 'createdBy'].some(key => this.isModified(key))) {
    throw new Error('CONTRACT_TEMPLATE_VERSION_IMMUTABLE');
  }
});
schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'], function () {
  throw new Error('CONTRACT_TEMPLATE_VERSION_IMMUTABLE');
});
export const ContractTemplate = model('ContractTemplate', schema);
