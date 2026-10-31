import { Types } from 'mongoose';
import { SalesAttribution, SalesCampaign, SalesTrackingLink } from '../../database/models/SalesCampaign.js';
import { AcquisitionJourney } from '../../database/models/AcquisitionJourney.js';
import { SalesLead } from '../../database/models/SalesLead.js';
import { Organization } from '../../database/models/Organization.js';
import { User } from '../../database/models/User.js';
import { Role } from '../../database/models/Role.js';
import { OrganizationMembership } from '../../database/models/OrganizationMembership.js';
import { PlatformSwitch } from '../../database/models/PlatformSwitch.js';
import { SalesCustomerEvidenceRepository } from './sales-customer-evidence.repository.js';
import { assertCampaignIndexes } from './sales-success-indexes.js';
import { campaignPayload, trackingDigest } from './sales-campaign.service.js';
import { payloadHash } from './sales-agent.service.js';

export class SalesAttributionService {
  static async project(organizationId: Types.ObjectId) {
    if (!(await PlatformSwitch.exists({ key: 'SALES_ATTRIBUTION', enabled: true, mode: 'ON' }))) return;
    await assertCampaignIndexes();
    const org = await Organization.findOne({ _id: organizationId, status: 'ACTIVE' }).select('onboarding.ownerUserId createdAt').lean();
    if (!org?.onboarding?.ownerUserId) return;
    const owner = await User.findOne({ _id: org.onboarding.ownerUserId, status: 'ACTIVE', emailVerifiedAt: { $type: 'date' } }).select('email').lean();
    const role = await Role.findOne({ key: 'LANDLORD', system: true, organizationId: null }).select('_id').lean();
    if (!owner?.email || !role || !(await OrganizationMembership.exists({ organizationId, userId: owner._id, roleIds: role._id, status: 'ACTIVE', 'scope.allProperties': true }))) return;
    const evidence = await SalesCustomerEvidenceRepository.monitor(organizationId);
    const milestones: Array<'REGISTERED' | 'CHECKOUT_STARTED' | 'PAYMENT_VERIFIED' | 'SUBSCRIPTION_ACTIVATED' | 'ONBOARDING_COMPLETED'> = [
      'REGISTERED', ...(evidence.checkoutStarted ? ['CHECKOUT_STARTED' as const] : []),
      ...(evidence.verifiedPayment ? ['PAYMENT_VERIFIED' as const] : []),
      ...(evidence.verifiedPayment && evidence.subscriptionStatus === 'ACTIVE' ? ['SUBSCRIPTION_ACTIVATED' as const] : []),
      ...(evidence.verifiedPayment && evidence.subscriptionStatus === 'ACTIVE' && evidence.completionPercent === 100 ? ['ONBOARDING_COMPLETED' as const] : []),
    ];
    let registration = await SalesAttribution.findOne({ organizationId, milestone: 'REGISTERED' }).lean();
    if (!registration) {
      const journey = await AcquisitionJourney.findOne({ organizationId }).lean();
      const lead = await SalesLead.findOne({ organizationId, mergedInto: { $exists: false }, email: owner.email.toLowerCase() }).select('_id mergedLeadIds').lean();
      // A consented referral awaiting human identity review is pending, not a final unattributed cohort.
      const linkedIdentity = lead ?? await SalesLead.findOne({ organizationId, mergedInto: { $exists: false } }).select('_id').lean();
      if (journey?.salesTrackingConsentAt && !linkedIdentity) return { status: 'PENDING_IDENTITY_REVIEW' };
      const lineage = lead ? [lead._id, ...lead.mergedLeadIds].map(String) : [];
      let reason = !journey?.salesTrackingConsentAt ? 'NO_CONSENTED_REFERRAL' : !lead ? 'REFERRAL_CONTACT_MISMATCH' : 'NO_ELIGIBLE_TOUCH';
      const eligible: Array<{ id: Types.ObjectId; campaignId: Types.ObjectId; firstAt: Date; lastAt: Date; position: number }> = [];
      if (journey?.salesTrackingConsentAt && lead && journey.salesLeadId && lineage.includes(String(journey.salesLeadId))) {
        // Referrals are evidence of a link visit, never proof that the intended customer registered.
        const source = await SalesLead.findOne({ _id: journey.salesLeadId, email: owner.email.toLowerCase() }).select('_id').lean();
        if (!source) reason = 'REFERRAL_CONTACT_MISMATCH';
        else {
          const touches = journey.salesTouches.slice(0, 20);
          const links = await SalesTrackingLink.find({ _id: { $in: touches.map(t => t.linkId) }, leadId: { $in: lineage.map(id => new Types.ObjectId(id)) } }).select('+intendedEmailHash').lean();
          const campaigns = await SalesCampaign.find({ _id: { $in: links.map(l => l.campaignId) } });
          const contacts = await SalesLead.find({ _id: { $in: links.map(l => l.leadId) }, email: owner.email.toLowerCase() }).select('_id').lean();
          const contactIds = new Set(contacts.map(c => String(c._id)));
          const linkMap = new Map(links.map(l => [String(l._id), l]));
          const campaignMap = new Map(campaigns.map(c => [String(c._id), c]));
          for (const [position, touch] of touches.entries()) {
            const link = linkMap.get(String(touch.linkId));
            const lastAt = touch.lastAt ?? touch.at;
            if (!link || link.intendedEmailHash !== trackingDigest('email:' + owner.email.toLowerCase()) || link.createdAt > touch.at || lastAt < touch.at || lastAt > org.createdAt || link.expiresAt < lastAt || (link.revokedAt && link.revokedAt <= lastAt)) continue;
            const campaign = campaignMap.get(String(link.campaignId));
            if (!campaign || !campaign.approvedHash || payloadHash(campaignPayload(campaign)) !== campaign.approvedHash || org.createdAt.getTime() - lastAt.getTime() > campaign.attributionDays * 86400000) continue;
            if (contactIds.has(String(link.leadId))) eligible.push({ id: link._id, campaignId: campaign._id, firstAt: org.createdAt.getTime() - touch.at.getTime() <= campaign.attributionDays * 86400000 ? touch.at : lastAt, lastAt, position });
          }
        }
      } else if (journey?.salesLeadId && lead) reason = 'REFERRAL_CONTACT_MISMATCH';
      const first = [...eligible].sort((a, b) => Number(a.firstAt) - Number(b.firstAt) || a.position - b.position).at(0), last = [...eligible].sort((a, b) => Number(b.lastAt) - Number(a.lastAt) || b.position - a.position).at(0);
      await SalesAttribution.updateOne({ organizationId, milestone: 'REGISTERED' }, { $setOnInsert: {
        status: last ? 'ATTRIBUTED' : 'UNATTRIBUTED', reason: last ? 'CONSENTED_REFERRAL_AND_VERIFIED_OWNER' : reason,
        ...(lead ? { leadId: lead._id } : {}), ...(journey ? { journeyId: journey._id } : {}),
        ...(first && last ? { firstCampaignId: first.campaignId, lastCampaignId: last.campaignId, referralCampaignId: last.campaignId } : {}),
        evidenceLinkIds: eligible.map(t => t.id), observedAt: new Date(), sourceOccurredAt: org.createdAt,
      } }, { upsert: true });
      registration = await SalesAttribution.findOne({ organizationId, milestone: 'REGISTERED' }).lean();
    }
    if (!registration) return;
    const proof = evidence.verificationEvidence;
    // All later milestones inherit the fixed registration cohort. A later click cannot steal paid attribution.
    for (const milestone of milestones.filter(m => m !== 'REGISTERED')) await SalesAttribution.updateOne({ organizationId, milestone }, { $setOnInsert: {
      status: registration.status, reason: registration.reason, leadId: registration.leadId, journeyId: registration.journeyId,
      firstCampaignId: registration.firstCampaignId, lastCampaignId: registration.lastCampaignId, referralCampaignId: registration.referralCampaignId,
      evidenceLinkIds: registration.evidenceLinkIds, observedAt: new Date(),
      ...(proof && milestone !== 'CHECKOUT_STARTED' ? { invoiceId: proof.invoiceId, contractId: proof.contractId, subscriptionId: proof.subscriptionId, ...(milestone === 'PAYMENT_VERIFIED' ? { sourceOccurredAt: proof.verifiedAt } : {}) } : {}),
    } }, { upsert: true });
    return { milestones: milestones.length, status: registration.status };
  }
}
