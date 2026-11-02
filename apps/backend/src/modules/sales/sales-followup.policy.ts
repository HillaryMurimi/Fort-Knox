import type { SalesFollowUpRecord } from '../../database/models/SalesFollowUp.js';
import type { followUpEvidence } from './sales-followup-evidence.repository.js';
export function followUpStopReason(plan: SalesFollowUpRecord, current: Awaited<ReturnType<typeof followUpEvidence>>) {
  const base = plan.baseline;
  if (current.optedOut) return 'CONTACT_OPTED_OUT';
  if (current.baseline.contactHash !== base.contactHash || current.baseline.consentRevision !== base.consentRevision) return 'CONTACT_OR_CONSENT_CHANGED';
  if (current.baseline.organizationId !== base.organizationId) return 'CUSTOMER_IDENTITY_CHANGED';
  if (current.baseline.responseHash !== base.responseHash) return 'CUSTOMER_RESPONDED';
  if (current.baseline.meetingIds.some(id => !base.meetingIds.includes(id))) return 'MEETING_BOOKED';
  if (current.baseline.lastResponseAt && current.baseline.lastResponseAt > (base.lastResponseAt ?? plan.startedAt)) return 'CUSTOMER_RESPONDED';
  if (current.latestMeetingAt && current.latestMeetingAt > plan.startedAt) return 'MEETING_BOOKED';
  if (!base.verifiedPayment && current.baseline.verifiedPayment) return 'PAYMENT_VERIFIED';
  if (current.baseline.pipelineRank > base.pipelineRank || current.baseline.stage !== base.stage || current.baseline.leadStatus !== base.leadStatus) return 'CUSTOMER_STAGE_CHANGED';
  if (current.baseline.onboardingRevision !== base.onboardingRevision) return 'ONBOARDING_RESUMED';
  if (current.baseline.properties > base.properties || current.baseline.units > base.units || (current.baseline.inventoryAt && base.inventoryAt && current.baseline.inventoryAt > base.inventoryAt)) return 'ONBOARDING_RESUMED';
  if (!current.source || current.source.key !== plan.sourceKey || current.source.status !== base.sourceStatus) return 'SOURCE_RESOLVED_OR_CHANGED';
  if (plan.expiresAt <= new Date()) return 'SEQUENCE_EXPIRED';
  return null;
}
