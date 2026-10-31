import { Schema, model, type InferSchemaType } from 'mongoose';

const campaign = new Schema({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, maxlength: 160 },
  description: { type: String, required: true, maxlength: 4000 },
  audience: { type: String, required: true, maxlength: 2000 },
  market: { type: String, required: true, maxlength: 120 },
  channel: { type: String, enum: ['EMAIL', 'SMS', 'WHATSAPP'], required: true },
  agent: { type: String, default: 'SALES_OUTREACH' },
  startsAt: { type: Date, required: true }, endsAt: { type: Date, required: true },
  messaging: { type: String, required: true, maxlength: 12000 },
  selectionCriteria: { type: String, required: true, maxlength: 2000 },
  dailySendLimit: { type: Number, required: true, min: 1, max: 1000 },
  perContactLimit: { type: Number, required: true, min: 1, max: 5 },
  followUpDays: { type: [Number], default: [] },
  budgetMicroUsd: { type: Number, required: true, min: 0 },
  attributionDays: { type: Number, default: 30, min: 1, max: 90 },
  status: { type: String, enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'], default: 'DRAFT' },
  revision: { type: Number, default: 0 },
  payloadHash: String, approvedHash: String,
  submittedAt: Date, approvedAt: Date, reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
campaign.index({ status: 1, createdAt: -1, _id: -1 });
export const SalesCampaign = model('SalesCampaign', campaign);
export type SalesCampaignRecord = InferSchemaType<typeof campaign>;

const link = new Schema({
  tokenHash: { type: String, required: true, select: false },
  intendedEmailHash: { type: String, select: false },
  campaignId: { type: Schema.Types.ObjectId, ref: 'SalesCampaign', required: true },
  leadId: { type: Schema.Types.ObjectId, ref: 'SalesLead', required: true },
  representativeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  agent: { type: String, required: true }, channel: { type: String, required: true },
  destination: { type: String, enum: ['PLANS', 'SIGNUP', 'DEMO'], required: true },
  expiresAt: { type: Date, required: true }, revokedAt: Date,
}, { timestamps: true });
link.index({ tokenHash: 1 }, { unique: true, name: 'sales_link_token_unique' });
link.index({ campaignId: 1, createdAt: -1, _id: -1 });
export const SalesTrackingLink = model('SalesTrackingLink', link);

const attribution = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  milestone: { type: String, enum: ['REGISTERED', 'CHECKOUT_STARTED', 'PAYMENT_VERIFIED', 'SUBSCRIPTION_ACTIVATED', 'ONBOARDING_COMPLETED'], required: true },
  status: { type: String, enum: ['ATTRIBUTED', 'UNATTRIBUTED'], required: true },
  reason: { type: String, required: true },
  leadId: { type: Schema.Types.ObjectId, ref: 'SalesLead' },
  journeyId: { type: Schema.Types.ObjectId, ref: 'AcquisitionJourney' },
  firstCampaignId: { type: Schema.Types.ObjectId, ref: 'SalesCampaign' },
  lastCampaignId: { type: Schema.Types.ObjectId, ref: 'SalesCampaign' },
  referralCampaignId: { type: Schema.Types.ObjectId, ref: 'SalesCampaign' },
  evidenceLinkIds: [{ type: Schema.Types.ObjectId, ref: 'SalesTrackingLink' }],
  observedAt: { type: Date, required: true },
  sourceOccurredAt: Date,
  invoiceId: { type: Schema.Types.ObjectId, ref: 'SubscriptionInvoice' },
  contractId: { type: Schema.Types.ObjectId, ref: 'OrganizationContract' },
  subscriptionId: { type: Schema.Types.ObjectId, ref: 'OrganizationSubscription' },
}, { timestamps: true });
attribution.index({ organizationId: 1, milestone: 1 }, { unique: true, name: 'sales_conversion_unique' });
attribution.index({ referralCampaignId: 1, milestone: 1, observedAt: -1 });
export const SalesAttribution = model('SalesAttribution', attribution);
