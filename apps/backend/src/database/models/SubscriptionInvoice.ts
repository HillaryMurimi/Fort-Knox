import { Schema, model, type InferSchemaType } from 'mongoose';

const subscriptionInvoiceSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  subscriptionId: { type: Schema.Types.ObjectId, ref: 'OrganizationSubscription', required: true, index: true },
  invoiceNumber: { type: String, required: true, trim: true },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  subtotal: { type: Number, required: true, min: 0 },
  tax: { type: Number, required: true, min: 0, default: 0 },
  total: { type: Number, required: true, min: 0 },
  amountPaid: { type: Number, required: true, min: 0, default: 0 },
  currency: { type: String, required: true, uppercase: true },
  status: { type: String, enum: ['DRAFT', 'OPEN', 'PAID', 'PAST_DUE', 'VOID', 'UNCOLLECTIBLE'], required: true, default: 'OPEN', index: true },
  dueDate: { type: Date, required: true },
  paidAt: { type: Date },
  provider: { type: String, enum: ['INTERNAL', 'MPESA', 'PAYSTACK', 'STRIPE', 'OTHER'], default: 'INTERNAL' },
  providerInvoiceId: { type: String },
  lineItems: { type: [Schema.Types.Mixed], default: [] },
  contractId: { type: Schema.Types.ObjectId, ref: 'OrganizationContract' },
  documentId: { type: Schema.Types.ObjectId, ref: 'Document' }, receiptDocumentId: { type: Schema.Types.ObjectId, ref: 'Document' },
  commercialSnapshot: { type: Schema.Types.Mixed },
  subtotalMinor: Number, taxMinor: Number, totalMinor: Number,
  issuedAt: Date,
  metadata: { type: Schema.Types.Mixed, default: {} },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

subscriptionInvoiceSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true });
subscriptionInvoiceSchema.index({ provider: 1, providerInvoiceId: 1 }, { unique: true, partialFilterExpression: { providerInvoiceId: { $type: 'string' } } });
subscriptionInvoiceSchema.index({ contractId: 1 }, { unique: true, partialFilterExpression: { contractId: { $type: 'objectId' } } });
subscriptionInvoiceSchema.pre('save', function () {
  if (!this.isNew && this.commercialSnapshot && ['organizationId', 'subscriptionId', 'contractId', 'invoiceNumber', 'periodStart', 'periodEnd', 'subtotal', 'tax', 'total', 'currency', 'dueDate', 'lineItems', 'commercialSnapshot', 'subtotalMinor', 'taxMinor', 'totalMinor', 'issuedAt'].some(key => this.isModified(key))) throw new Error('INVOICE_SNAPSHOT_IMMUTABLE');
});
subscriptionInvoiceSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'], async function () {
  if (await model('SubscriptionInvoice').exists({ $and: [this.getFilter(), { commercialSnapshot: { $exists: true } }] }).session(this.getOptions().session ?? null)) throw new Error('INVOICE_SNAPSHOT_IMMUTABLE');
});
export type SubscriptionInvoiceDocument = InferSchemaType<typeof subscriptionInvoiceSchema>;
export const SubscriptionInvoice = model('SubscriptionInvoice', subscriptionInvoiceSchema);
