import { model, Schema } from 'mongoose';
const environment = { type: String, required: true, index: true };
const signalSchema = new Schema({
  environment, bucket: { type: Date, required: true }, kind: { type: String, required: true },
  subject: { type: String, default: '', maxlength: 80 }, scope: { type: String, required: true }, count: { type: Number, required: true, default: 0 },
  firstAt: { type: Date, required: true }, lastAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
});
signalSchema.index({ environment: 1, bucket: 1, kind: 1, scope: 1, subject: 1 }, { unique: true });
signalSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const heartbeatSchema = new Schema({
  environment, instance: { type: String, required: true }, kind: { type: String, enum: ['API', 'WORKER', 'COLLECTOR'], required: true },
  firstAt: { type: Date, required: true }, lastAt: { type: Date, required: true }, stoppedAt: Date,
  expiresAt: { type: Date, required: true },
  leaseExpiresAt: Date, leaseToken: String, lastSuccessAt: Date, lastErrorAt: Date,
});
heartbeatSchema.index({ environment: 1, instance: 1 }, { unique: true });
heartbeatSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const alertSchema = new Schema({
  environment, fingerprint: { type: String, required: true }, area: { type: String, required: true },
  scope: { type: String, required: true }, code: { type: String, required: true }, title: { type: String, required: true },
  severity: { type: String, enum: ['LOW', 'HIGH', 'CRITICAL'], required: true },
  status: { type: String, enum: ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'], required: true, default: 'OPEN' },
  owner: { type: String, default: '' }, firstAt: { type: Date, required: true }, lastAt: { type: Date, required: true },
  observedValue: Number, revision: { type: Number, default: 0, required: true },
  acknowledgedAt: Date, acknowledgedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: Date, resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' }, lastSeenRun: String,
});
alertSchema.index({ environment: 1, fingerprint: 1 }, { unique: true });
alertSchema.index({ environment: 1, status: 1, lastAt: -1 });
const historySchema = new Schema({
  alertId: { type: Schema.Types.ObjectId, required: true, index: true }, environment,
  action: { type: String, required: true }, actor: { type: Schema.Types.ObjectId, ref: 'User' },
  at: { type: Date, required: true }, note: { type: String, maxlength: 500, default: '' },
  before: { type: String }, after: { type: String }, owner: String,
});
historySchema.index({ environment: 1, alertId: 1, at: -1 });
const windowSchema = new Schema({
  environment, area: { type: String, required: true }, scope: { type: String, required: true },
  startsAt: { type: Date, required: true }, endsAt: { type: Date, required: true },
  reason: { type: String, required: true, maxlength: 500 }, owner: { type: String, required: true, maxlength: 120 },
  createdBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
}, { timestamps: true });
windowSchema.index({ environment: 1, startsAt: 1, endsAt: 1 });
export const PlatformMonitorSignal = model('PlatformMonitorSignal', signalSchema);
export const PlatformHeartbeat = model('PlatformHeartbeat', heartbeatSchema);
export const PlatformMonitorAlert = model('PlatformMonitorAlert', alertSchema);
export const PlatformMonitorHistory = model('PlatformMonitorHistory', historySchema);
export const PlatformMaintenanceWindow = model('PlatformMaintenanceWindow', windowSchema);
