import { Schema, model, type InferSchemaType } from 'mongoose';
export const salesChannels = ['EMAIL', 'SMS', 'WHATSAPP'] as const;
const consent = new Schema({
  leadId: { type: Schema.Types.ObjectId, ref: 'SalesLead', required: true },
  channel: { type: String, enum: salesChannels, required: true },
  recipientHash: { type: String, required: true }, epoch: { type: Number, required: true }, recipientEpoch: { type: Number, required: true },
  decision: { type: String, enum: ['OPT_IN', 'OPT_OUT'], required: true },
  source: { type: String, enum: ['EXPLICIT_REQUEST', 'PUBLIC_UNSUBSCRIBE', 'PROVIDER_REPLY', 'PROVIDER_COMPLAINT', 'STAFF_REVIEW'], required: true },
  evidence: { type: String, required: true, maxlength: 2000 },
  timezone: { type: String, required: true, default: 'Africa/Nairobi' },
  actorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
consent.index({ leadId: 1, channel: 1, recipientHash: 1, createdAt: -1, _id: -1 });
export const SalesConsentEvent = model('SalesConsentEvent', consent);

// Minimal hashes survive content retention so an opted-out address is not silently reimported.
const recipient = new Schema({
  channel: { type: String, enum: salesChannels, required: true },
  recipientHash: { type: String, required: true }, suppressedAt: Date, reinstatedAt: Date,
  suppressionReason: { type: String, enum: ['OPT_OUT', 'BOUNCE', 'COMPLAINT'] },
  epoch: { type: Number, default: 0 },
  dayMessages: [{ type: Schema.Types.ObjectId, ref: 'SalesMessage' }],
  lastAttemptAt: Date, lastReplyAt: Date, lastResponseAt: Date, leaseOwner: String, leaseUntil: Date,
  day: String, dailyAttempts: { type: Number, default: 0 },
}, { timestamps: true });
recipient.index({ channel: 1, recipientHash: 1 }, { unique: true, name: 'sales_recipient_control_unique' });
export const SalesRecipientControl = model('SalesRecipientControl', recipient);

const message = new Schema({
  leadId: { type: Schema.Types.ObjectId, ref: 'SalesLead', required: true },
  campaignId: { type: Schema.Types.ObjectId, ref: 'SalesCampaign', required: true },
  campaignHash: { type: String, required: true },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  originApprovalId: { type: Schema.Types.ObjectId, ref: 'SalesAgentApproval' },
  notificationId: { type: Schema.Types.ObjectId, ref: 'Notification' },
  channel: { type: String, enum: salesChannels, required: true }, provider: { type: String, required: true },
  recipient: { type: String, required: true, select: false }, recipientHash: { type: String, required: true },
  consentEventId: { type: Schema.Types.ObjectId, ref: 'SalesConsentEvent', required: true }, consentEpoch: { type: Number, required: true },
  recipientDailyLimit: { type: Number, required: true },
  sender: { type: String, required: true }, senderConfigHash: { type: String, required: true },
  subject: { type: String, maxlength: 200 }, body: { type: String, required: true, maxlength: 10000 },
  timezone: { type: String, required: true },
  commandId: { type: String, required: true }, commandHash: { type: String, required: true },
  payloadHash: { type: String, required: true }, revision: { type: Number, default: 0 },
  contentFingerprint: { type: String, required: true }, dedupeActive: { type: Boolean, default: true },
  status: { type: String, enum: ['DRAFT', 'PENDING_APPROVAL', 'QUEUED', 'DISPATCHING', 'SENT', 'FAILED', 'UNCERTAIN', 'CANCELLED', 'SUPPRESSED', 'EXPIRED', 'REJECTED', 'PAUSED'], default: 'DRAFT' },
  deliveryStatus: { type: String, enum: ['UNKNOWN', 'ACCEPTED', 'DELIVERED', 'BOUNCED', 'FAILED'], default: 'UNKNOWN' },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' }, reviewedAt: Date, approvalExpiresAt: Date,
  providerMessageId: String, providerAcceptedAt: Date, deliveredAt: Date, bouncedAt: Date, lastReplyAt: Date, lastResponseAt: Date,
  deliveryEventAt: Date, deliveryEventRank: { type: Number, default: 0 },
  firstAttemptAt: Date, lastAttemptAt: Date, attempt: { type: Number, default: 0 }, generation: { type: Number, default: 0 },
  reservationHeld: { type: Boolean, default: false }, reservationDay: String,
  leaseOwner: String, leaseUntil: Date, nextAttemptAt: Date, errorCode: String,
  estimatedCostMicroUsd: { type: Number, required: true, min: 0 },
  smsSegments: { type: Number, min: 1, max: 3 }, smsEncoding: { type: String, enum: ['GSM7', 'UCS2'] },
  unsubscribeHash: { type: String, required: true, select: false }, replyHash: { type: String, select: false }, replyTo: String,
  unsubscribeUrl: { type: String, required: true },
  contentExpiresAt: Date, redactedAt: Date,
  followUpId: { type: Schema.Types.ObjectId, ref: 'SalesFollowUp' },
}, { timestamps: true });
message.index({ requestedBy: 1, commandId: 1 }, { unique: true, name: 'sales_message_command_unique' });
message.index({ campaignId: 1, recipientHash: 1, contentFingerprint: 1 }, { unique: true, name: 'sales_message_content_unique', partialFilterExpression: { dedupeActive: true } });
message.index({ provider: 1, providerMessageId: 1 }, { unique: true, name: 'sales_message_provider_unique', partialFilterExpression: { providerMessageId: { $type: 'string' } } });
message.index({ unsubscribeHash: 1 }, { unique: true, name: 'sales_unsubscribe_unique' });
message.index({ replyHash: 1 }, { unique: true, name: 'sales_reply_alias_unique', partialFilterExpression: { replyHash: { $type: 'string' } } });
message.index({ leadId: 1, createdAt: -1, _id: -1 });
message.index({ campaignId: 1, status: 1, createdAt: -1 });
export type SalesMessageRecord = InferSchemaType<typeof message>;
export const SalesMessage = model('SalesMessage', message);

const usage = new Schema({
  campaignId: { type: Schema.Types.ObjectId, ref: 'SalesCampaign', required: true },
  bucket: { type: String, required: true }, attempts: { type: Number, default: 0 },
  reservedMicroUsd: { type: Number, default: 0 },
}, { timestamps: true });
usage.index({ campaignId: 1, bucket: 1 }, { unique: true, name: 'sales_campaign_usage_unique' });
export const SalesCampaignUsage = model('SalesCampaignUsage', usage);

const entry = new Schema({
  leadId: { type: Schema.Types.ObjectId, ref: 'SalesLead', required: true },
  messageId: { type: Schema.Types.ObjectId, ref: 'SalesMessage', required: true },
  direction: { type: String, enum: ['OUTBOUND', 'INBOUND'], required: true },
  sourceKey: { type: String, required: true }, provider: { type: String, required: true },
  subject: { type: String, maxlength: 200 }, text: { type: String, maxlength: 10000 },
  occurredAt: { type: Date, required: true }, senderAuthentication: { type: String, enum: ['UNKNOWN', 'DOMAIN_AUTHENTICATED'], default: 'UNKNOWN' },
  correlation: { type: String, enum: ['RECIPIENT_MATCHED', 'REVIEW_REQUIRED'] },
  contentTruncated: { type: Boolean, default: false }, contentExpiresAt: Date, redactedAt: Date,
}, { timestamps: true });
entry.index({ sourceKey: 1 }, { unique: true, name: 'sales_conversation_source_unique' });
entry.index({ leadId: 1, occurredAt: -1, _id: -1 });
export const SalesConversationEntry = model('SalesConversationEntry', entry);

const providerControl = new Schema({ key: { type: String, required: true }, nextRequestAt: Date }, { timestamps: true });
providerControl.index({ key: 1 }, { unique: true, name: 'sales_provider_pace_unique' });
export const SalesProviderControl = model('SalesProviderControl', providerControl);
