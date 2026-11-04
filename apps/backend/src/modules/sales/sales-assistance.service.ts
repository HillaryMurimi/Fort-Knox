import { Types, type ClientSession } from 'mongoose';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/AppError.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import { PropertyOnboardingRequest } from '../../database/models/PropertyOnboardingRequest.js';
import { Organization } from '../../database/models/Organization.js';
import { SalesActivity } from '../../database/models/SalesActivity.js';
import { AuditService } from '../audit/audit.service.js';
import { assertFreshAdmin } from '../auth/admin-security.js';
import { assertSwitchEnabled } from '../platform-control/platform-control.guard.js';
import { SalesAgentRepository, salesTransaction } from './sales-agent.repository.js';
import { SuccessRepository, assertSuccessPermission } from './sales-success.repository.js';
import { assistanceControlSchema, assistanceListSchema } from './sales-assistance.schemas.js';
import { signalSalesFollowUps } from './sales-followup.signal.js';

export async function assertAssistanceIndexes() {
  if (env.NODE_ENV !== 'production') return;
  const indexes = await PropertyOnboardingRequest.collection.indexes().catch(() => []);
  if (!indexes.some(index => index.name === 'sales_assistance_approval_unique' && index.unique && index.key.approvalId === 1 && index.partialFilterExpression?.approvalId?.$type === 'objectId'))
    throw new AppError(503, 'SALES_INDEXES_REQUIRED', 'Install the onboarding assistance deduplication index');
}

export class SalesAssistanceService {
  // Called inside the exact-payload approval transaction. This is an internal handoff, not a customer request or consent.
  static async openApproved(auth: AuthenticatedUser, input: { leadId: Types.ObjectId; approvalId: Types.ObjectId; organizationId?: Types.ObjectId | null; guidance: string }, session: ClientSession) {
    assertFreshAdmin(auth);
    await assertAssistanceIndexes();
    await assertSwitchEnabled('SALES_ASSISTANCE');
    const lead = await SuccessRepository.load(auth, String(input.leadId), 'sales.onboarding.read', session);
    if (!lead.organizationId || !input.organizationId || !lead.organizationId.equals(input.organizationId)) throw new AppError(409, 'ASSISTANCE_ORGANIZATION_CHANGED', 'Generate a new recommendation for the current linked organization');
    if (!await Organization.exists({ _id: lead.organizationId }).session(session)) throw new AppError(409, 'ORGANIZATION_NOT_FOUND', 'Linked organization is unavailable');
    const [request] = await PropertyOnboardingRequest.create([{
      organizationId: lead.organizationId, requestedBy: auth.userId, assignedTo: auth.userId,
      leadId: lead._id, approvalId: input.approvalId, source: 'INTERNAL_ASSISTANCE',
      guidance: input.guidance, properties: [], status: 'REQUESTED',
    }], { session });
    if (!request) throw new AppError(500, 'ASSISTANCE_CREATE_FAILED', 'Unable to open assistance');
    await SalesActivity.create([{ leadId: lead._id, actorUserId: auth.userId, kind: 'sales.assistance.opened', text: 'Internal assistance assigned for a reviewed recommendation; customer contact is not confirmed.', resourceId: request._id }], { session });
    await AuditService.record({ actorUserId: auth.userId, action: 'sales.assistance.opened', resourceType: 'PropertyOnboardingRequest', resourceId: request._id, metadata: { leadId: String(lead._id), organizationId: String(lead.organizationId), approvalId: String(input.approvalId) } }, session);
    await signalSalesFollowUps(lead._id, 'assistance-opened:' + request._id, session);
    return { requestId: String(request._id), internalAssistanceOpened: true, customerContacted: false };
  }

  static async list(auth: AuthenticatedUser, id: string, raw: unknown) {
    const { page } = assistanceListSchema.parse(raw);
    const lead = await SuccessRepository.load(auth, id, 'sales.onboarding.read');
    assertSuccessPermission(auth, 'sales.notes.read');
    if (!lead.organizationId) return { items: [], page, total: 0 };
    const filter = { organizationId: lead.organizationId };
    const [items, total] = await Promise.all([
      PropertyOnboardingRequest.find(filter).select('_id source status assignedTo preferredDate guidance notes outcome revision createdAt completedAt').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 20).limit(20).lean(),
      PropertyOnboardingRequest.countDocuments(filter),
    ]);
    return { items, total, page };
  }

  static async control(auth: AuthenticatedUser, id: string, requestId: string, raw: unknown) {
    const input = assistanceControlSchema.parse(raw);
    assertSuccessPermission(auth, 'sales.assistance.manage');
    assertSuccessPermission(auth, 'sales.notes.read');
    await assertSwitchEnabled('SALES_ASSISTANCE');
    if (input.action === 'ASSIGN') assertFreshAdmin(auth);
    if (input.preferredDate && new Date(input.preferredDate) <= new Date()) throw new AppError(400, 'ASSISTANCE_DATE_INVALID', 'Choose a future assistance date');
    return salesTransaction(async session => {
      const lead = await SuccessRepository.load(auth, id, 'sales.onboarding.read', session);
      if (!lead.organizationId) throw new AppError(409, 'ASSISTANCE_ORGANIZATION_CHANGED', 'Customer has no linked organization');
      const request = await PropertyOnboardingRequest.findOne({ _id: requestId, organizationId: lead.organizationId, revision: input.revision === 0 ? { $in: [0, null] } : input.revision }).session(session);
      if (!request) throw new AppError(409, 'ASSISTANCE_CHANGED', 'Reload the current assistance request');
      if (!auth.isPlatformAdmin && String(request.assignedTo) !== String(auth.userId)) throw new AppError(403, 'ASSISTANCE_NOT_ASSIGNED', 'Only the assigned representative may update this request');
      if (['COMPLETED', 'CANCELLED'].includes(request.status)) throw new AppError(409, 'ASSISTANCE_TERMINAL', 'A closed request cannot change');
      if (input.action === 'ASSIGN' && input.assignedTo) {
        const representative = await SalesAgentRepository.principal(new Types.ObjectId(input.assignedTo));
        await SuccessRepository.load(representative, id, 'sales.onboarding.read', session);
        assertSuccessPermission(representative, 'sales.assistance.manage'); assertSuccessPermission(representative, 'sales.notes.read');
        request.assignedTo = representative.userId;
      } else if (input.action === 'SCHEDULE') {
        if (!['REQUESTED', 'SCHEDULED'].includes(request.status)) throw new AppError(409, 'ASSISTANCE_TRANSITION_INVALID', 'Only pending assistance can be scheduled');
        request.preferredDate = new Date(input.preferredDate!); request.status = 'SCHEDULED';
      } else if (input.action === 'START') {
        if (!['REQUESTED', 'SCHEDULED'].includes(request.status)) throw new AppError(409, 'ASSISTANCE_TRANSITION_INVALID', 'Assistance has already started');
        request.status = 'IN_PROGRESS';
      } else if (input.action === 'COMPLETE') {
        if (request.status !== 'IN_PROGRESS') throw new AppError(409, 'ASSISTANCE_TRANSITION_INVALID', 'Start assistance before recording its outcome');
        request.status = 'COMPLETED'; request.completedAt = new Date(); request.outcome = input.reason;
      } else if (input.action === 'CANCEL') { request.status = 'CANCELLED'; request.outcome = input.reason; }
      request.revision += 1; await request.save({ session });
      await SalesActivity.create([{ leadId: lead._id, actorUserId: auth.userId, kind: 'sales.assistance.' + input.action.toLowerCase(), text: input.reason, resourceId: request._id }], { session });
      await AuditService.record({ actorUserId: auth.userId, action: 'sales.assistance.updated', resourceType: 'PropertyOnboardingRequest', resourceId: request._id, metadata: { action: input.action, status: request.status, revision: request.revision, assignedTo: String(request.assignedTo ?? '') } }, session);
      await signalSalesFollowUps(lead._id, 'assistance:' + request._id + ':' + request.revision, session);
      return { status: request.status, revision: request.revision, customerContacted: false };
    });
  }
}
