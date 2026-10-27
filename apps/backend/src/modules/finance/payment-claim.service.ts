import mongoose, { Types } from 'mongoose';
import { Payment } from '../../database/models/Payment.js';
import { Tenancy } from '../../database/models/Tenancy.js';
import { Tenant } from '../../database/models/Tenant.js';
import { Evidence } from '../../database/models/Evidence.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { ResourceScopeService } from '../../core/authorization/resource-scope.service.js';
import { AppError } from '../../core/errors/AppError.js';
import { legacyMinorUnits } from '../../core/money/legacy-finance.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import type { ClaimListInput, ClaimReviewInput, PaymentClaimInput } from './finance.schemas.js';

const id = (value: string) => new Types.ObjectId(value);

export class PaymentClaimService {
  static async report(auth: AuthenticatedUser, organizationId: string, input: PaymentClaimInput) {
    const orgId = id(organizationId);
    const membership = AuthorizationService.getMembership(auth, orgId);
    if (!membership.roles.includes('TENANT')) throw new AppError(403, 'TENANT_ONLY', 'Only a tenant can report their own payment');
    AuthorizationService.assertPermission(auth, 'payment.create', orgId);
    const tenancy = await Tenancy.findOne({ _id: id(input.tenancyId), organizationId: orgId }).lean();
    if (!tenancy) throw new AppError(404, 'TENANCY_NOT_FOUND', 'Tenancy not found');
    const tenant = await Tenant.findOne({ _id: tenancy.tenantId, organizationId: orgId }).lean();
    if (!tenant || String(tenant.userId) !== String(auth.userId)) throw new AppError(403, 'TENANCY_ACCESS_DENIED', 'This tenancy does not belong to you');
    ResourceScopeService.assertUnit(auth, tenancy, 'payment.create', tenant.userId);
    if (!['ACTIVE', 'NOTICE'].includes(tenancy.status)) throw new AppError(409, 'TENANCY_INACTIVE', 'Only active tenancies can report payments');
    if (input.paidAt.getTime() > Date.now() + 5 * 60_000) throw new AppError(400, 'FUTURE_PAYMENT_DATE', 'Payment date cannot be in the future');
    if (input.evidenceIds.length) {
      const evidence = await Evidence.find({ _id: { $in: input.evidenceIds.map(id) }, organizationId: orgId, ownerUserId: id(String(auth.userId)), relatedResourceType: 'TENANCY', relatedResourceId: tenancy._id }).select('_id').lean();
      if (evidence.length !== new Set(input.evidenceIds).size) throw new AppError(403, 'INVALID_PAYMENT_EVIDENCE', 'Evidence must belong to this tenancy and tenant');
    }
    const existing = await Payment.findOne({ organizationId: orgId, claimIdempotencyKey: input.idempotencyKey });
    if (existing) {
      if (String(existing.tenancyId) !== input.tenancyId || existing.amountMinor !== legacyMinorUnits(input.amount, input.currency) || existing.method !== input.method || existing.claimTransactionReference !== input.transactionReference || existing.claimPaidAt?.getTime() !== input.paidAt.getTime()) throw new AppError(409, 'CLAIM_IDEMPOTENCY_CONFLICT', 'Idempotency key was used for a different payment');
      return existing;
    }
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        const [payment] = await Payment.create([{ organizationId: orgId, propertyId: tenancy.propertyId, buildingId: tenancy.buildingId, floorId: tenancy.floorId, unitId: tenancy.unitId, tenantId: tenant._id, tenancyId: tenancy._id, amount: input.amount, amountMinor: legacyMinorUnits(input.amount, input.currency), currency: input.currency, method: input.method, status: 'PENDING', source: 'TENANT_CLAIM', verificationState: 'PENDING_VERIFICATION', claimIdempotencyKey: input.idempotencyKey, claimTransactionReference: input.transactionReference, claimReceivingAccount: input.receivingAccount, claimPaidAt: input.paidAt, claimEvidenceIds: input.evidenceIds.map(id), createdBy: auth.userId, updatedBy: auth.userId }], { session });
        if (!payment) throw new AppError(500, 'PAYMENT_CLAIM_FAILED', 'Payment claim could not be recorded');
        await AuditService.record({ organizationId: orgId, actorUserId: auth.userId, action: 'payment.claim.reported', resourceType: 'Payment', resourceId: payment._id, propertyId: tenancy.propertyId, buildingId: tenancy.buildingId, unitId: tenancy.unitId, metadata: { method: input.method, evidenceCount: input.evidenceIds.length } }, session);
        return payment;
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw new AppError(409, 'DUPLICATE_PAYMENT_CLAIM', 'This payment claim has already been reported');
      throw error;
    } finally { await session.endSession(); }
  }

  static async list(auth: AuthenticatedUser, organizationId: string, input: ClaimListInput) {
    const orgId = id(organizationId);
    if (auth.isPlatformAdmin) throw new AppError(403, 'PRIVATE_FINANCE_ACCESS_DENIED', 'Platform administration does not grant access to private payment claims');
    AuthorizationService.assertPermission(auth, 'payment.view', orgId);
    const scopedIds = await ResourceScopeService.scopedUnitIds(auth, orgId);
    const membership = auth.isPlatformAdmin ? null : AuthorizationService.getMembership(auth, orgId);
    const filter: Record<string, unknown> = { organizationId: orgId, source: 'TENANT_CLAIM' };
    if (input.state) filter.verificationState = input.state;
    if (scopedIds) filter.unitId = { $in: scopedIds };
    if (membership?.roles.includes('TENANT')) filter.createdBy = id(String(auth.userId));
    const [items, total] = await Promise.all([Payment.find(filter).sort({ createdAt: -1, _id: -1 }).skip((input.page - 1) * input.limit).limit(input.limit).lean(), Payment.countDocuments(filter)]);
    return { items, total, page: input.page, limit: input.limit };
  }

  static async review(auth: AuthenticatedUser, paymentId: string, input: ClaimReviewInput) {
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        const payment = await Payment.findById(paymentId).session(session);
        if (!payment || payment.source !== 'TENANT_CLAIM') throw new AppError(404, 'PAYMENT_CLAIM_NOT_FOUND', 'Payment claim not found');
        if (auth.isPlatformAdmin) throw new AppError(403, 'PRIVATE_FINANCE_ACCESS_DENIED', 'Platform administration does not grant access to private payment claims');
        ResourceScopeService.assertUnit(auth, payment, 'payment.confirm');
        if (payment.status !== 'PENDING' || !['PENDING_VERIFICATION', 'CLARIFICATION_REQUESTED', 'DISPUTED'].includes(payment.verificationState ?? '')) throw new AppError(409, 'INVALID_CLAIM_STATE', 'This claim cannot be reviewed');
        payment.verificationState = input.action === 'REJECT' ? 'REJECTED' : input.action === 'CLARIFY' ? 'CLARIFICATION_REQUESTED' : 'DISPUTED';
        if (input.action === 'REJECT') payment.status = 'FAILED';
        payment.reviewNote = input.note;
        payment.reviewedBy = id(String(auth.userId));
        payment.reviewedAt = new Date();
        payment.updatedBy = id(String(auth.userId));
        await payment.save({ session });
        await AuditService.record({ organizationId: payment.organizationId, actorUserId: auth.userId, action: `payment.claim.${input.action.toLowerCase()}`, resourceType: 'Payment', resourceId: payment._id, propertyId: payment.propertyId, buildingId: payment.buildingId, unitId: payment.unitId, metadata: { note: input.note } }, session);
        return payment;
      });
    } finally { await session.endSession(); }
  }
}
