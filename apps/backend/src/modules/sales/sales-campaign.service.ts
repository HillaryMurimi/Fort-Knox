import { createHash, randomBytes } from 'node:crypto';
import { Types, type ClientSession } from 'mongoose';
import { SalesCampaign, SalesTrackingLink, type SalesCampaignRecord } from '../../database/models/SalesCampaign.js';
import { AcquisitionJourney } from '../../database/models/AcquisitionJourney.js';
import { SalesLead } from '../../database/models/SalesLead.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { AppError } from '../../core/errors/AppError.js';
import { assertFreshAdmin } from '../auth/admin-security.js';
import { AuditService } from '../audit/audit.service.js';
import { assertSwitchEnabled } from '../platform-control/platform-control.guard.js';
import { salesTransaction } from './sales-agent.repository.js';
import { payloadHash } from './sales-agent.service.js';
import { assertCampaignIndexes } from './sales-success-indexes.js';
import { AcquisitionService } from './acquisition.service.js';
import { objectId } from './sales-success.schemas.js';
import { campaignSchema, campaignUpdateSchema, campaignCommandSchema, campaignPageSchema, trackingLinkSchema, trackingResolveSchema, trackingVisitSchema } from './sales-campaign.schemas.js';
export const trackingDigest = (token: string) => createHash('sha256').update(token).digest('hex');
const destinations = { PLANS: '/plans?source=OUTREACH', SIGNUP: '/signup?source=OUTREACH', DEMO: '/demo' } as const;
type Campaign = SalesCampaignRecord;
// Fixed key order binds review to every behavior-affecting campaign field, independent of Mongo property order.
export function campaignPayload(c: Campaign) {
  return { ownerId: String(c.ownerId), name: c.name, description: c.description, audience: c.audience, market: c.market,
    channel: c.channel, agent: c.agent, startsAt: c.startsAt.toISOString(), endsAt: c.endsAt.toISOString(),
    messaging: c.messaging, selectionCriteria: c.selectionCriteria, dailySendLimit: c.dailySendLimit,
    perContactLimit: c.perContactLimit, followUpDays: [...c.followUpDays], budgetMicroUsd: c.budgetMicroUsd, attributionDays: c.attributionDays };
}
export async function assertCampaignActive(c: Campaign | null) {
  if (!c || c.status !== 'ACTIVE' || c.startsAt > new Date() || c.endsAt <= new Date() || !c.approvedHash || c.approvedHash !== payloadHash(campaignPayload(c)))
    throw new AppError(409, 'CAMPAIGN_NOT_ACTIVE', 'Campaign is inactive, outside its schedule or changed since approval');
}
const notFound = () => new AppError(404, 'SALES_LINK_UNAVAILABLE', 'This invitation is unavailable or expired');
async function lookup(token: string, session?: ClientSession) {
  const link = await SalesTrackingLink.findOne({ tokenHash: trackingDigest(token), expiresAt: { $gt: new Date() }, revokedAt: { $exists: false } }).session(session ?? null);
  if (!link) throw notFound();
  const campaign = await SalesCampaign.findById(link.campaignId).session(session ?? null);
  try { await assertCampaignActive(campaign); } catch { throw notFound(); }
  const lead = await SalesLead.findById(link.leadId).select('consent optedOutAt mergedInto').session(session ?? null);
  if (!lead || lead.consent === 'OPTED_OUT' || lead.optedOutAt) throw notFound();
  if (lead.mergedInto) {
    const target = await SalesLead.findById(lead.mergedInto).select('consent optedOutAt mergedInto').session(session ?? null);
    if (!target || target.mergedInto || target.consent === 'OPTED_OUT' || target.optedOutAt) throw notFound();
  }
  return link;
}
export class SalesCampaignService {
  static async list(auth: AuthenticatedUser, raw: unknown) {
    AuthorizationService.assertPlatformAdmin(auth);
    const { page } = campaignPageSchema.parse(raw);
    const [items, total] = await Promise.all([SalesCampaign.find().sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 20).limit(20).lean(), SalesCampaign.countDocuments()]);
    return { items, page, total, limit: 20 };
  }
  static async create(auth: AuthenticatedUser, raw: unknown) {
    AuthorizationService.assertPlatformAdmin(auth); await assertSwitchEnabled('SALES_CAMPAIGNS');
    const input = campaignSchema.parse(raw);
    return salesTransaction(async session => {
      const [record] = await SalesCampaign.create([{ ...input, ownerId: auth.userId }], { session });
      if (!record) throw new AppError(500, 'CAMPAIGN_WRITE_FAILED', 'Could not create campaign');
      await AuditService.record({ actorUserId: auth.userId, action: 'sales.campaign.created', resourceType: 'SalesCampaign', resourceId: record._id }, session);
      return record.toObject();
    });
  }
  static async command(auth: AuthenticatedUser, id: string, raw: unknown) {
    AuthorizationService.assertPlatformAdmin(auth);
    const input = campaignCommandSchema.parse(raw); objectId.parse(id);
    if (['APPROVE', 'ACTIVATE', 'RESUME'].includes(input.action)) { assertFreshAdmin(auth); await assertSwitchEnabled('SALES_CAMPAIGNS'); await assertCampaignIndexes(); }
    return salesTransaction(async session => {
      const record = await SalesCampaign.findOne({ _id: id, revision: input.revision }).session(session);
      if (!record) throw new AppError(409, 'CAMPAIGN_CHANGED', 'Campaign changed; reload before reviewing');
      const transitions: Record<string, Record<string, string>> = {
        SUBMIT: { DRAFT: 'PENDING_APPROVAL' }, APPROVE: { PENDING_APPROVAL: 'APPROVED' }, REJECT: { PENDING_APPROVAL: 'DRAFT' },
        ACTIVATE: { APPROVED: 'ACTIVE' }, PAUSE: { ACTIVE: 'PAUSED' }, RESUME: { PAUSED: 'ACTIVE' },
        COMPLETE: { ACTIVE: 'COMPLETED', PAUSED: 'COMPLETED' }, CANCEL: { DRAFT: 'CANCELLED', PENDING_APPROVAL: 'CANCELLED', APPROVED: 'CANCELLED', ACTIVE: 'CANCELLED', PAUSED: 'CANCELLED' },
      };
      const next = transitions[input.action]?.[record.status];
      if (!next) throw new AppError(409, 'INVALID_CAMPAIGN_TRANSITION', 'This campaign transition is not allowed');
      const hash = payloadHash(campaignPayload(record));
      if (input.action === 'SUBMIT') { record.payloadHash = hash; record.submittedAt = new Date(); }
      if (input.action === 'APPROVE') {
        if (hash !== record.payloadHash || input.payloadHash !== hash) throw new AppError(409, 'CAMPAIGN_CHANGED', 'Review the exact campaign payload before approving');
        record.approvedHash = hash; record.approvedAt = new Date(); record.reviewedBy = auth.userId;
      }
      if (['ACTIVATE', 'RESUME'].includes(input.action) && (record.approvedHash !== hash || record.endsAt <= new Date())) throw new AppError(409, 'CAMPAIGN_CHANGED', 'Campaign approval is stale or its schedule ended');
      record.status = next as typeof record.status; record.revision += 1; await record.save({ session });
      await AuditService.record({ actorUserId: auth.userId, action: 'sales.campaign.transitioned', resourceType: 'SalesCampaign', resourceId: record._id, metadata: { action: input.action, status: next, payloadHash: hash, reason: input.reason } }, session);
      return record.toObject();
    });
  }
  static async update(auth: AuthenticatedUser, id: string, raw: unknown) {
    AuthorizationService.assertPlatformAdmin(auth); objectId.parse(id); await assertSwitchEnabled('SALES_CAMPAIGNS');
    const input = campaignUpdateSchema.parse(raw);
    return salesTransaction(async session => {
      const record = await SalesCampaign.findOneAndUpdate({ _id: id, status: 'DRAFT', revision: input.revision }, { $set: input.campaign, $inc: { revision: 1 }, $unset: { payloadHash: 1, approvedHash: 1, approvedAt: 1, reviewedBy: 1 } }, { session, returnDocument: 'after', runValidators: true });
      if (!record) throw new AppError(409, 'CAMPAIGN_CHANGED', 'Only the current draft revision may be edited');
      await AuditService.record({ actorUserId: auth.userId, action: 'sales.campaign.updated', resourceType: 'SalesCampaign', resourceId: record._id, metadata: { revision: record.revision } }, session);
      return record.toObject();
    });
  }
  static async links(auth: AuthenticatedUser, id: string, raw: unknown) {
    AuthorizationService.assertPlatformAdmin(auth); objectId.parse(id); const { page } = campaignPageSchema.parse(raw);
    return { items: await SalesTrackingLink.find({ campaignId: id }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 20).limit(20).lean(), page, limit: 20 };
  }
  static async createLink(auth: AuthenticatedUser, id: string, raw: unknown) {
    AuthorizationService.assertPlatformAdmin(auth); await assertSwitchEnabled('SALES_TRACKING'); await assertCampaignIndexes();
    const input = trackingLinkSchema.parse(raw); objectId.parse(id);
    return salesTransaction(async session => {
      const campaign = await SalesCampaign.findById(id).session(session); await assertCampaignActive(campaign);
      if (!campaign) throw notFound();
      const lead = await SalesLead.findOne({ _id: input.leadId, mergedInto: { $exists: false } }).session(session);
      if (!lead || lead.consent === 'OPTED_OUT' || lead.optedOutAt) throw new AppError(409, 'CONTACT_SUPPRESSED', 'Customer is unavailable or opted out');
      const expiresAt = new Date(input.expiresAt);
      if (expiresAt <= new Date() || expiresAt > campaign.endsAt || expiresAt.getTime() - Date.now() > 90 * 86400000) throw new AppError(400, 'INVALID_LINK_EXPIRY', 'Link must expire within the campaign and 90 days');
      const token = randomBytes(32).toString('base64url');
      const [record] = await SalesTrackingLink.create([{ tokenHash: trackingDigest(token), ...(lead.email ? { intendedEmailHash: trackingDigest('email:' + lead.email.toLowerCase()) } : {}), campaignId: campaign._id, leadId: lead._id, representativeId: auth.userId, agent: campaign.agent, channel: campaign.channel, destination: input.destination, expiresAt }], { session });
      if (!record) throw notFound();
      await AuditService.record({ actorUserId: auth.userId, action: 'sales.tracking.link.created', resourceType: 'SalesTrackingLink', resourceId: record._id, metadata: { campaignId: id, leadId: input.leadId, destination: input.destination } }, session);
      return { id: String(record._id), href: `/r/${token}`, expiresAt };
    });
  }
  static async revokeLink(auth: AuthenticatedUser, id: string) {
    AuthorizationService.assertPlatformAdmin(auth); objectId.parse(id);
    return salesTransaction(async session => {
      const record = await SalesTrackingLink.findOneAndUpdate({ _id: id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } }, { session, returnDocument: 'after' });
      if (!record) throw notFound();
      await AuditService.record({ actorUserId: auth.userId, action: 'sales.tracking.link.revoked', resourceType: 'SalesTrackingLink', resourceId: record._id }, session);
      return { revoked: true };
    });
  }
  static async resolve(raw: unknown) {
    const { token } = trackingResolveSchema.parse(raw); const link = await lookup(token);
    // Resolving an invitation never records a visit or reveals the intended customer's identity.
    return { destination: destinations[link.destination], expiresAt: link.expiresAt, trackingAvailable: true };
  }
  static async visit(raw: unknown) {
    const input = trackingVisitSchema.parse(raw); await assertSwitchEnabled('SALES_TRACKING'); await assertCampaignIndexes(); await lookup(input.token);
    const result = await AcquisitionService.recordPublic({ event: 'landing_viewed', source: 'OUTREACH', ...(input.journeyToken ? { journeyToken: input.journeyToken } : {}) });
    return salesTransaction(async session => {
      const link = await lookup(input.token, session);
      const journey = await AcquisitionJourney.findOne({ tokenHash: trackingDigest(result.journeyToken!), retentionClass: 'ANONYMOUS', expiresAt: { $gt: new Date() } }).session(session);
      if (!journey) throw new AppError(409, 'JOURNEY_UNAVAILABLE', 'Tracking session expired; continue without analytics');
      const existing = journey.salesTouches.find(t => String(t.linkId) === String(link._id));
      if (!existing) {
        if (journey.salesTouches.length >= 20) throw new AppError(409, 'TRACKING_TOUCH_LIMIT', 'Tracking session reached its limit');
        journey.salesTouches.push({ linkId: link._id, at: new Date(), lastAt: new Date() });
      } else existing.lastAt = new Date();
      journey.salesTrackingConsentAt ??= new Date(); journey.salesLeadId = link.leadId; journey.source = 'OUTREACH'; await journey.save({ session });
      return { journeyToken: result.journeyToken, destination: destinations[link.destination], recorded: true };
    });
  }
}
