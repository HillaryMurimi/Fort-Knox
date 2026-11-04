import { model, Schema } from 'mongoose';
const schema = new Schema({
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  commandId: { type: String, required: true }, commandHash: { type: String, required: true },
  policy: { type: Schema.Types.Mixed, required: true }, revision: { type: Number, required: true, default: 0 },
}, { timestamps: true });
schema.index({ requestedBy: 1, commandId: 1 }, { unique: true, name: 'sales_revenue_target_command_unique' });
schema.index({ createdAt: -1, _id: -1 });
export const SalesRevenueTarget = model('SalesRevenueTarget', schema);
