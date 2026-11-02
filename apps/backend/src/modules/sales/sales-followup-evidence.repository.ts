import { Types } from 'mongoose';
import { SalesLead } from '../../database/models/SalesLead.js';
import { SalesMeeting } from '../../database/models/SalesMeeting.js';
import { SalesMessage, SalesConversationEntry, SalesRecipientControl } from '../../database/models/SalesCommunication.js';
import { AcquisitionJourney } from '../../database/models/AcquisitionJourney.js';
import { Organization } from '../../database/models/Organization.js';
import { OrganizationSubscription } from '../../database/models/OrganizationSubscription.js';
import { PropertyOnboardingRequest } from '../../database/models/PropertyOnboardingRequest.js';
import { User } from '../../database/models/User.js';
import { WebhookEvent } from '../../database/models/WebhookEvent.js';
import { hashPayload } from '../../core/integrations/webhook.security.js';
import { AppError } from '../../core/errors/AppError.js';
import { SalesCustomerEvidenceRepository } from './sales-customer-evidence.repository.js';
import { opaqueHash, recipientHash } from './sales-outreach.policy.js';
import { followUpTriggers } from './sales-followup.schemas.js';
type Trigger = typeof followUpTriggers[number];
export interface FollowUpSource { key: string; id: string; at: Date; kind: string; status: string }
// Internal evidence projection. The caller first establishes current customer/constituent scope.
export async function followUpEvidence(leadId: string, trigger: Trigger, sourceId?: string) {
  const lead = await SalesLead.findOne({ _id: leadId, mergedInto: { $exists: false } }).lean();
  if (!lead) throw new AppError(409, 'FOLLOWUP_CUSTOMER_UNAVAILABLE', 'Use the current canonical customer');
  const ids = [lead._id, ...lead.mergedLeadIds], ownerScope = { leadId: { $in: ids } }, exact = sourceId && /^[a-f\d]{24}$/i.test(sourceId) ? { _id: new Types.ObjectId(sourceId) } : {};
  const contacts = [...(lead.email ? [{ channel: 'EMAIL' as const, recipientHash: recipientHash('EMAIL', lead.email) }] : []), ...(lead.phone ? (['SMS', 'WHATSAPP'] as const).map(channel => ({ channel, recipientHash: recipientHash(channel, lead.phone!) })) : [])];
  const [monitor, org, subscription, controls, latestMeeting, recentMeetings] = await Promise.all([
    lead.organizationId ? SalesCustomerEvidenceRepository.monitor(lead.organizationId) : null,
    lead.organizationId ? Organization.findById(lead.organizationId).select('onboarding.attentionCode onboarding.invoiceId onboarding.activatedAt onboarding.ownerUserId portfolioOnboarding.revision updatedAt').lean() : null,
    lead.organizationId ? OrganizationSubscription.findOne({ organizationId: lead.organizationId }).select('status updatedAt provider providerSubscriptionId providerCheckoutReference').select({ businessTransitions: { $slice: -1 } }).lean() : null,
    contacts.length ? SalesRecipientControl.find({ $or: contacts }).select('channel recipientHash responseRevision lastResponseAt lastReplyAt').limit(3).lean() : [],
    SalesMeeting.findOne({ ...ownerScope, status: 'SCHEDULED' }).select('createdAt startsAt').sort({ createdAt: -1, _id: -1 }).lean(),
    SalesMeeting.find(ownerScope).select('_id').sort({ createdAt: -1, _id: -1 }).limit(100).lean(),
  ]);
  const responseDates = controls.flatMap(control => [control.lastResponseAt, control.lastReplyAt]).filter((value): value is Date => value instanceof Date);
  const baseline = {
    organizationId: lead.organizationId ? String(lead.organizationId) : undefined, stage: lead.stage, leadStatus: lead.leadStatus, pipelineRank: lead.pipelineRank ?? 0,
    consentRevision: lead.consentRevision ?? 0, contactHash: opaqueHash(JSON.stringify({ email: lead.email ?? null, phone: lead.phone ?? null })),
    verifiedPayment: monitor?.verifiedPayment ?? false, properties: monitor?.properties ?? 0, units: monitor?.registeredUnits ?? 0,
    responseHash: opaqueHash(JSON.stringify(controls.filter(control => control.responseRevision || control.lastResponseAt).map(control => ({ channel: control.channel, hash: control.recipientHash, epoch: control.responseRevision ?? 0, at: control.lastResponseAt?.toISOString() })).sort((a,b) => a.channel.localeCompare(b.channel)))),
    meetingIds: recentMeetings.map(meeting => String(meeting._id)), onboardingRevision: org?.portfolioOnboarding?.revision ?? 0,
    inventoryAt: monitor?.lastActivity, lastResponseAt: responseDates.length ? new Date(Math.max(...responseDates.map(Number))) : undefined,
  };
  let source: FollowUpSource | undefined;
  const set = (id: string, at: Date, kind: string, status: string, salt = '') => { source = { id, at, kind, status, key: opaqueHash(trigger + ':' + id + ':' + salt) }; };
  if (trigger === 'QUALIFIED_NOT_CONTACTED') {
    if (lead.leadStatus === 'Qualified' && !latestMeeting && !await SalesMessage.exists({ ...ownerScope, firstAttemptAt: { $type: 'date' } }) && !await SalesMeeting.exists({ ...ownerScope, status: 'COMPLETED' })) set(String(lead._id), new Date(), 'CRM_CURRENT_STATE_NO_RECORDED_CONTACT', 'QUALIFIED');
  } else if (trigger === 'DELIVERED_NO_REPLY') {
    const message = await SalesMessage.findOne({ ...ownerScope, ...exact, deliveryStatus: 'DELIVERED', lastResponseAt: { $exists: false }, lastReplyAt: { $exists: false } }).select('deliveredAt providerAcceptedAt createdAt').sort({ deliveredAt: -1 }).lean();
    if (message && !latestMeeting && (!baseline.lastResponseAt || baseline.lastResponseAt < (message.deliveredAt ?? message.providerAcceptedAt ?? message.createdAt))) set(String(message._id), message.deliveredAt ?? message.providerAcceptedAt ?? message.createdAt, 'VERIFIED_PROVIDER_DELIVERY_NOT_READING', 'DELIVERED');
  } else if (trigger === 'PROSPECT_REPLIED') {
    const reply = await SalesConversationEntry.findOne({ ...ownerScope, ...exact, direction: 'INBOUND', correlation: 'RECIPIENT_MATCHED', redactedAt: { $exists: false }, contentExpiresAt: { $gt: new Date() } }).select('occurredAt').sort({ occurredAt: -1 }).lean();
    if (reply) set(String(reply._id), reply.occurredAt, 'CORRELATED_PROVIDER_REPLY_NOT_ACCOUNT_AUTHENTICATION', 'RECEIVED');
  } else if (['DEMO_BOOKED', 'DEMO_MISSED', 'DEMO_COMPLETED', 'MEETING_NOT_HELD'].includes(trigger)) {
    const status = trigger === 'DEMO_BOOKED' ? 'SCHEDULED' : trigger === 'DEMO_MISSED' ? 'NO_SHOW' : trigger === 'DEMO_COMPLETED' ? 'COMPLETED' : 'NOT_HELD';
    const meeting = await SalesMeeting.findOne({ ...ownerScope, ...exact, status, ...(trigger === 'MEETING_NOT_HELD' ? {} : { type: 'DEMO' }), ...(trigger === 'DEMO_BOOKED' ? { startsAt: { $gt: new Date() } } : {}) }).select('updatedAt createdAt status calendar.status').sort({ updatedAt: -1 }).lean();
    if (meeting) set(String(meeting._id), meeting.updatedAt, meeting.calendar?.status === 'CONFIRMED' ? 'PROVIDER_CALENDAR_AND_CRM_MEETING' : 'CRM_MEETING_NOT_EXTERNAL_CONFIRMATION', status);
  } else if (trigger === 'REGISTRATION_INCOMPLETE') {
    const journey = await AcquisitionJourney.findOne({ salesLeadId: { $in: ids }, ...exact, salesTrackingConsentAt: { $type: 'date' }, signupStartedAt: { $type: 'date' }, organizationId: { $exists: false }, expiresAt: { $gt: new Date() }, retentionClass: 'ANONYMOUS' }).select('signupStartedAt').sort({ signupStartedAt: -1 }).lean();
    if (journey && !monitor?.registered) set(String(journey._id), journey.signupStartedAt!, 'ANONYMOUS_CONSENTED_INVITATION_ACTIVITY_NOT_IDENTITY', 'SIGNUP_STARTED');
  } else if (trigger === 'EMAIL_VERIFICATION_PENDING') {
    const owner = org?.onboarding?.ownerUserId ? await User.findOne({ _id: org.onboarding.ownerUserId, status: 'ACTIVE', emailVerifiedAt: { $exists: false } }).select('_id').lean() : null;
    if (owner) set(String(lead.organizationId), new Date(), 'EXPLICITLY_LINKED_ORGANIZATION_OWNER_RECORD', 'EMAIL_PENDING', String(owner._id));
  } else if (trigger === 'CHECKOUT_INCOMPLETE') {
    if (monitor?.checkoutStarted && !monitor.verifiedPayment && subscription) set(String(subscription._id), subscription.updatedAt, 'COMMERCIAL_CHECKOUT_RECORD_NOT_PAYMENT', subscription.status, opaqueHash(subscription.providerCheckoutReference ?? ''));
  } else if (trigger === 'PAYMENT_FAILED') {
    const failedEvent = subscription?.status === 'PAST_DUE' && subscription.provider === 'PAYSTACK' && subscription.providerSubscriptionId ? await WebhookEvent.findOne({ provider: 'PAYSTACK', status: 'PROCESSED', 'payload.event': 'invoice.payment_failed', 'payload.data.salesSubscriptionHash': hashPayload(Buffer.from(subscription.providerSubscriptionId)) }).select('eventId receivedAt').sort({ receivedAt: -1 }).lean() : null;
    if (subscription && failedEvent) set(String(subscription._id), failedEvent.receivedAt, 'VERIFIED_COMMERCIAL_PROVIDER_FAILURE_EVENT_NOT_RENT', 'PAST_DUE', failedEvent.eventId);
    else if (org?.onboarding?.attentionCode === 'PAYMENT_FAILED' && !monitor?.verifiedPayment) set(String(lead.organizationId), org.updatedAt, 'COMMERCIAL_RECONCILIATION_ATTENTION_FLAG', 'PAYMENT_FAILED', String(org.onboarding.invoiceId ?? 'current'));
  } else if (trigger === 'SUBSCRIPTION_ACTIVATED') {
    if (monitor?.verifiedPayment && monitor.subscriptionStatus === 'ACTIVE') set(String(monitor.verificationEvidence!.subscriptionId), org?.onboarding?.activatedAt ?? monitor.verificationEvidence!.verifiedAt ?? new Date(), 'VERIFIED_COMMERCIAL_PAYMENT_AND_ACTIVE_SUBSCRIPTION', 'ACTIVE', String(monitor.verificationEvidence!.invoiceId));
  } else if (trigger === 'PROPERTY_ONBOARDING_NOT_STARTED') {
    if (monitor && monitor.properties === 0) set(String(lead.organizationId), monitor.lastActivity, 'ACTUAL_PROPERTY_INVENTORY', 'NO_PROPERTIES');
  } else if (trigger === 'UNIT_ONBOARDING_STALLED') {
    if (monitor?.stalled && monitor.expectedUnits !== null && monitor.expectedUnits > 0 && monitor.completionPercent !== 100) set(String(lead.organizationId), monitor.lastActivity, 'ACTUAL_UNIT_INVENTORY_AND_72_HOUR_STALL', 'STALLED', monitor.lastActivity.toISOString());
  } else if (trigger === 'ASSISTANCE_UNRESOLVED') {
    const request = lead.organizationId ? await PropertyOnboardingRequest.findOne({ organizationId: lead.organizationId, ...exact, status: { $in: ['REQUESTED', 'SCHEDULED', 'IN_PROGRESS'] } }).select('status updatedAt').sort({ updatedAt: -1 }).lean() : null;
    if (request) set(String(request._id), request.updatedAt, 'EXISTING_PROPERTY_ONBOARDING_REQUEST', request.status);
  } else if (trigger === 'CUSTOMER_REQUESTED') {
    if (lead.nextActionDate) set(String(lead._id), lead.nextActionDate, 'STAFF_RECORDED_REQUEST_REQUIRES_REVIEW', 'REQUEST_RECORDED', lead.nextActionDate.toISOString());
  }
  return { lead, source, baseline, latestMeetingAt: latestMeeting?.createdAt, optedOut: !!lead.optedOutAt || lead.consent === 'OPTED_OUT' };
}
