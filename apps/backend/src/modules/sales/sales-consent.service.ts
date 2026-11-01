import { Types, type ClientSession } from 'mongoose';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import { SalesLead } from '../../database/models/SalesLead.js';
import { SalesConsentEvent, SalesRecipientControl, SalesMessage } from '../../database/models/SalesCommunication.js';
import { SalesActivity } from '../../database/models/SalesActivity.js';
import { AppError } from '../../core/errors/AppError.js';
import { assertFreshAdmin } from '../auth/admin-security.js';
import { AuditService } from '../audit/audit.service.js';
import { SuccessRepository, assertSuccessPermission } from './sales-success.repository.js';
import { salesTransaction } from './sales-agent.repository.js';
import { consentEvidenceSchema, outreachPageSchema } from './sales-outreach.schemas.js';
import { contactFor, recipientHash } from './sales-outreach.policy.js';
import { assertOutreachIndexes } from './sales-success-indexes.js';

export class SalesConsentService {
  static async list(auth: AuthenticatedUser, id: string, raw: unknown) {
    const lead = await SuccessRepository.load(auth, id, 'sales.leads.read'); assertSuccessPermission(auth, 'sales.notes.read');
    const { page } = outreachPageSchema.parse(raw);
    return { items: await SalesConsentEvent.find({ leadId: { $in: [lead._id, ...lead.mergedLeadIds] } }).select('-recipientHash').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 20).limit(20).lean(), page, limit: 20 };
  }
  static async record(auth: AuthenticatedUser, id: string, raw: unknown) {
    assertFreshAdmin(auth); const input = consentEvidenceSchema.parse(raw);
    if (input.decision === 'OPT_IN') await assertOutreachIndexes();
    return salesTransaction(async session => {
      const lead = await SuccessRepository.load(auth, id, 'sales.leads.update', session);
      if (lead.revision !== input.revision) throw new AppError(409, 'CUSTOMER_CHANGED', 'Reload the current customer before recording consent');
      const contact = contactFor(input.channel, lead), hash = recipientHash(input.channel, contact);
      if (input.decision === 'OPT_OUT') {
        await this.suppress(lead._id, { channel: input.channel, recipientHash: hash }, 'STAFF_REVIEW', input.evidence, session, auth.userId);
        return { decision: 'OPT_OUT', status: 'SUPPRESSED' };
      }
      const previous = await SalesRecipientControl.findOne({ channel: input.channel, recipientHash: hash }).session(session);
      const contactField = input.channel === 'EMAIL' ? 'email' : 'phone';
      if (await SalesLead.exists({ _id: { $ne: lead._id }, mergedInto: { $exists: false }, [contactField]: contact, $or: [{ consent: 'OPTED_OUT' }, { optedOutAt: { $type: 'date' } }] }).session(session))
        throw new AppError(409, 'SUPPRESSED_CONTACT_REVIEW_REQUIRED', 'A matching canonical customer opted out; review that identity before recording new consent');
      const reinstating = !!(lead.optedOutAt || lead.consent === 'OPTED_OUT' || previous?.suppressedAt);
      if (reinstating && !input.acknowledgePreviousSuppression) throw new AppError(409, 'PREVIOUS_SUPPRESSION_REVIEW_REQUIRED', 'New explicit consent and acknowledgement of the previous opt-out or delivery suppression are required');
      if (reinstating) { lead.consentRevision = (lead.consentRevision ?? 0) + 1; lead.optedOutAt = undefined; }
      lead.consent = 'OPTED_IN'; lead.revision += 1;
      const control = await SalesRecipientControl.findOneAndUpdate({ channel: input.channel, recipientHash: hash }, {
        $inc: { epoch: 1 }, $set: { reinstatedAt: new Date() }, $unset: { suppressedAt: 1, suppressionReason: 1 },
      }, { session, upsert: true, returnDocument: 'after' });
      if (!control) throw new AppError(409, 'CONSENT_CHANGED', 'Recipient consent changed');
      const [event] = await SalesConsentEvent.create([{ leadId: lead._id, channel: input.channel, recipientHash: hash, epoch: lead.consentRevision ?? 0, recipientEpoch: control.epoch, decision: 'OPT_IN', source: 'EXPLICIT_REQUEST', evidence: input.evidence, timezone: input.timezone, actorUserId: auth.userId }], { session });
      await lead.save({ session });
      await AuditService.record({ actorUserId: auth.userId, action: 'sales.consent.recorded', resourceType: 'SalesLead', resourceId: lead._id, metadata: { decision: 'OPT_IN', channel: input.channel, eventId: String(event?._id), previousSuppressionAcknowledged: reinstating } }, session);
      return { decision: 'OPT_IN', consentEventId: String(event?._id), revision: lead.revision };
    });
  }
  static async eligible(leadId: Types.ObjectId, channel: 'EMAIL' | 'SMS' | 'WHATSAPP', session?: ClientSession) {
    const lead = await SalesLead.findOne({ _id: leadId, mergedInto: { $exists: false } }).session(session ?? null);
    if (!lead || lead.consent !== 'OPTED_IN' || lead.optedOutAt) throw new AppError(409, 'CONTACT_SUPPRESSED', 'Current customer consent does not permit sales outreach');
    const contact = contactFor(channel, lead), hash = recipientHash(channel, contact);
    const contactField = channel === 'EMAIL' ? 'email' : 'phone';
    if (await SalesLead.exists({ mergedInto: { $exists: false }, [contactField]: contact, $or: [{ consent: 'OPTED_OUT' }, { optedOutAt: { $type: 'date' } }] }).session(session ?? null))
      throw new AppError(409, 'CONTACT_SUPPRESSED', 'A matching canonical contact has opted out of sales outreach');
    const control = await SalesRecipientControl.findOne({ channel, recipientHash: hash }).session(session ?? null);
    if (!control || control.suppressedAt) throw new AppError(409, 'OUTREACH_CONSENT_REQUIRED', 'Reviewed channel-specific consent evidence is required');
    const event = await SalesConsentEvent.findOne({ leadId, channel, recipientHash: hash, decision: 'OPT_IN', epoch: lead.consentRevision ?? 0, recipientEpoch: control.epoch }).sort({ createdAt: -1, _id: -1 }).session(session ?? null);
    if (!event) throw new AppError(409, 'OUTREACH_CONSENT_REQUIRED', 'Reviewed consent no longer matches the current contact or consent revision');
    return { lead, contact, hash, event, control };
  }
  static async suppress(
    leadId: Types.ObjectId, original: { channel: 'EMAIL' | 'SMS' | 'WHATSAPP'; recipientHash: string },
    source: 'STAFF_REVIEW' | 'PUBLIC_UNSUBSCRIBE' | 'PROVIDER_REPLY' | 'PROVIDER_COMPLAINT', evidence: string,
    session: ClientSession, actorUserId?: Types.ObjectId,
  ) {
    // Merge history is preserved; an old invitation must suppress its current canonical customer too.
    const canonical = await SalesLead.findOne({ $or: [{ _id: leadId }, { mergedLeadIds: leadId }], mergedInto: { $exists: false } }).session(session);
    const lead = canonical ?? await SalesLead.findById(leadId).session(session);
    const existing = await SalesRecipientControl.findOne({ channel: original.channel, recipientHash: original.recipientHash }).session(session);
    if (source === 'PUBLIC_UNSUBSCRIBE' && existing?.suppressedAt && (!lead || (lead.consent === 'OPTED_OUT' && lead.optedOutAt))) return { suppressed: true };
    if (!lead) {
      await SalesRecipientControl.updateOne({ channel: original.channel, recipientHash: original.recipientHash }, { $inc: { epoch: 1 }, $set: { suppressedAt: new Date(), suppressionReason: source === 'PROVIDER_COMPLAINT' ? 'COMPLAINT' : 'OPT_OUT' } }, { session, upsert: true });
      await AuditService.record({ actorUserId, action: 'sales.consent.archived_contact.opted_out', resourceType: 'SalesLead', resourceId: leadId, metadata: { source, channel: original.channel } }, session);
      return { suppressed: true };
    }
    const recipients = new Map<string, { channel: 'EMAIL' | 'SMS' | 'WHATSAPP'; hash: string }>();
    recipients.set(original.channel + original.recipientHash, { channel: original.channel, hash: original.recipientHash });
    for (const channel of ['EMAIL', 'SMS', 'WHATSAPP'] as const) {
      try { const hash = recipientHash(channel, contactFor(channel, lead)); recipients.set(channel + hash, { channel, hash }); } catch { /* Missing contacts do not prevent global suppression. */ }
    }
    let recipientEpoch = 0;
    for (const item of recipients.values()) {
      const control = await SalesRecipientControl.findOneAndUpdate({ channel: item.channel, recipientHash: item.hash }, { $inc: { epoch: 1 }, $set: { suppressedAt: new Date(), suppressionReason: source === 'PROVIDER_COMPLAINT' ? 'COMPLAINT' : 'OPT_OUT' } }, { session, upsert: true, returnDocument: 'after' });
      if (item.channel === original.channel && item.hash === original.recipientHash) recipientEpoch = control?.epoch ?? 0;
    }
    lead.consent = 'OPTED_OUT'; lead.optedOutAt = new Date(); lead.consentRevision = (lead.consentRevision ?? 0) + 1; lead.revision += 1;
    await lead.save({ session });
    if (String(lead._id) !== String(leadId)) await SalesLead.updateOne({ _id: leadId }, { $set: { consent: 'OPTED_OUT', optedOutAt: new Date() }, $inc: { consentRevision: 1, revision: 1 } }, { session });
    const ids = [lead._id, leadId, ...lead.mergedLeadIds];
    const pending = { leadId: { $in: ids }, status: { $in: ['DRAFT', 'PENDING_APPROVAL', 'QUEUED', 'PAUSED'] as const } };
    await SalesMessage.updateMany({ ...pending, firstAttemptAt: { $exists: false } }, { $set: { status: 'SUPPRESSED', errorCode: 'CONTACT_OPTED_OUT', dedupeActive: false } }, { session });
    await SalesMessage.updateMany({ ...pending, firstAttemptAt: { $type: 'date' } }, { $set: { status: 'UNCERTAIN', errorCode: 'CONTACT_OPTED_OUT' } }, { session });
    const [event] = await SalesConsentEvent.create([{ leadId: lead._id, channel: original.channel, recipientHash: original.recipientHash, epoch: lead.consentRevision, recipientEpoch, decision: 'OPT_OUT', source, evidence: evidence.slice(0, 2000), actorUserId }], { session });
    await SalesActivity.create([{ leadId: lead._id, actorUserId, actorKind: actorUserId ? 'HUMAN' : 'SYSTEM', kind: 'sales.consent.opted_out', text: 'Sales outreach suppressed after a recorded opt-out.', resourceId: event?._id }], { session });
    await AuditService.record({ actorUserId, action: 'sales.consent.opted_out', resourceType: 'SalesLead', resourceId: lead._id, metadata: { source, channel: original.channel, eventId: String(event?._id) } }, session);
    return { suppressed: true };
  }
}
