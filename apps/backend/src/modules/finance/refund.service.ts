import mongoose from 'mongoose';
import { Types } from 'mongoose';
import { Payment } from '../../database/models/Payment.js';
import { PaymentRefund } from '../../database/models/PaymentRefund.js';
import { Tenant } from '../../database/models/Tenant.js';
import { ResourceScopeService } from '../../core/authorization/resource-scope.service.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { AppError } from '../../core/errors/AppError.js';
import { getRefundProvider } from '../../core/integrations/payment-providers.js';
import { getPaymentProvider } from '../../core/integrations/payment-providers.js';
import { integrationConfig } from '../../core/integrations/config.js';
import type { RefundResult, RefundStatus } from '../../core/integrations/provider.types.js';
import { moneyFromMajorUnits } from '../../core/money/money.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import { AuditService } from '../audit/audit.service.js';
import { FinanceService } from './finance.service.js';

export class RefundService {
  private static async scopedPayment(auth: AuthenticatedUser, paymentId: string) {
    const payment = await Payment.findById(paymentId);
    if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
    ResourceScopeService.assertUnit(auth, payment, 'financial.manage', (await Tenant.findById(payment.tenantId).lean())?.userId);
    return payment;
  }

  static async request(auth: AuthenticatedUser, paymentId: string, reason: string) {
    const payment = await this.scopedPayment(auth, paymentId);
    if (payment.status !== 'CONFIRMED') throw new AppError(409, 'INVALID_PAYMENT_STATE', 'Only confirmed payments can be refunded');
    const transactionReference = payment.providerTransactionId;
    if (payment.provider !== 'PAYSTACK' || !transactionReference) throw new AppError(409, 'REFUND_PROVIDER_UNAVAILABLE', 'This payment does not support automated refunds');
    if (!integrationConfig.paystack.enabled || !integrationConfig.paystack.secretKey) throw new AppError(503, 'PAYSTACK_NOT_CONFIGURED', 'Paystack refunds are not configured');
    const provider = getRefundProvider('PAYSTACK');
    if (!provider) throw new AppError(503, 'REFUND_PROVIDER_UNAVAILABLE', 'Refund provider is unavailable');
    const amountMinorUnits = moneyFromMajorUnits(payment.amount, payment.currency).minorUnits;
    const existing = await PaymentRefund.findOne({ paymentId: payment._id });
    if (existing) return existing;
    const verified = await getPaymentProvider('PAYSTACK').query(transactionReference);
    const raw = verified.raw as { metadata?: unknown } | undefined;
    let metadata = raw?.metadata;
    if (typeof metadata === 'string') {
      try { metadata = JSON.parse(metadata) as unknown; } catch { metadata = null; }
    }
    const origin = metadata && typeof metadata === 'object' ? metadata as Record<string, unknown> : null;
    if (verified.status !== 'CONFIRMED' || verified.providerTransactionId !== transactionReference || verified.amountMinorUnits !== amountMinorUnits || verified.currency !== payment.currency || origin?.paymentId !== String(payment._id) || origin.organizationId !== String(payment.organizationId)) {
      throw new AppError(409, 'REFUND_PAYMENT_VERIFICATION_FAILED', 'Paystack transaction does not match this payment');
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const [refund] = await PaymentRefund.create([{
          organizationId: payment.organizationId, paymentId: payment._id, provider: 'PAYSTACK',
          propertyId: payment.propertyId, buildingId: payment.buildingId, unitId: payment.unitId,
          transactionReference, amountMinorUnits, currency: payment.currency,
          status: 'SUBMITTING', reason, requestedBy: auth.userId,
        }], { session });
        if (!refund) throw new AppError(500, 'REFUND_RECORD_FAILED', 'Refund record was not created');
        await AuditService.record({ organizationId: payment.organizationId, actorUserId: auth.userId, action: 'payment.refund.requested', resourceType: 'PaymentRefund', resourceId: refund._id, propertyId: payment.propertyId, buildingId: payment.buildingId, unitId: payment.unitId, metadata: { paymentId: String(payment._id), amountMinorUnits, currency: payment.currency } }, session);
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return PaymentRefund.findOne({ paymentId: payment._id });
      throw error;
    } finally {
      await session.endSession();
    }

    const refund = await PaymentRefund.findOne({ paymentId: payment._id });
    if (!refund) throw new AppError(500, 'REFUND_RECORD_FAILED', 'Refund record was not found');
    try {
      const result = await provider.createRefund(transactionReference, reason);
      return this.recordProviderStatus(String(refund._id), result);
    } catch {
      const failureSession = await mongoose.startSession();
      try {
        return await failureSession.withTransaction(async () => {
          const current = await PaymentRefund.findById(refund._id).session(failureSession);
          if (!current || current.status !== 'SUBMITTING') return current;
          current.status = 'SUBMISSION_UNKNOWN';
          await current.save({ session: failureSession });
          await AuditService.record({ organizationId: current.organizationId, action: 'payment.refund.submission-unknown', resourceType: 'PaymentRefund', resourceId: current._id, metadata: { paymentId: String(current.paymentId) } }, failureSession);
          return current;
        });
      } finally {
        await failureSession.endSession();
      }
    }
  }

  static async get(auth: AuthenticatedUser, paymentId: string) {
    const payment = await this.scopedPayment(auth, paymentId);
    return PaymentRefund.findOne({ organizationId: payment.organizationId, paymentId: payment._id });
  }

  static async list(auth: AuthenticatedUser, organizationId: string) {
    if (!Types.ObjectId.isValid(organizationId)) throw new AppError(400, 'INVALID_ORGANIZATION_ID', 'Invalid organization ID');
    const orgId = new Types.ObjectId(organizationId);
    AuthorizationService.assertPermission(auth, 'financial.manage', orgId);
    const ids = await ResourceScopeService.scopedUnitIds(auth, orgId);
    return PaymentRefund.find({ organizationId: orgId, ...(ids ? { unitId: { $in: ids } } : {}) }).sort({ createdAt: -1 }).limit(100).lean();
  }

  static async reconcile(auth: AuthenticatedUser, paymentId: string) {
    const refund = await this.get(auth, paymentId);
    if (!refund) throw new AppError(404, 'REFUND_NOT_FOUND', 'Refund request not found');
    if (!refund.providerRefundId) throw new AppError(409, 'REFUND_REQUIRES_MANUAL_REVIEW', 'Provider refund ID is unavailable; review the provider dashboard before taking further action');
    const provider = getRefundProvider('PAYSTACK');
    if (!provider) throw new AppError(503, 'REFUND_PROVIDER_UNAVAILABLE', 'Refund provider is unavailable');
    return this.recordProviderStatus(String(refund._id), await provider.getRefund(refund.providerRefundId));
  }

  static async review(auth: AuthenticatedUser, paymentId: string, input: { note: string; providerRefundId?: number }) {
    const payment = await this.scopedPayment(auth, paymentId);
    const refund = await PaymentRefund.findOne({ organizationId: payment.organizationId, paymentId: payment._id });
    if (!refund) throw new AppError(404, 'REFUND_NOT_FOUND', 'Refund request not found');
    if (refund.status !== 'SUBMISSION_UNKNOWN' && refund.status !== 'NEEDS_ATTENTION') throw new AppError(409, 'REFUND_REVIEW_NOT_REQUIRED', 'This refund is not awaiting manual review');
    const providerRefundId = input.providerRefundId ?? refund.providerRefundId;
    if (!providerRefundId) throw new AppError(400, 'REFUND_ID_REQUIRED', 'Enter the refund ID found in Paystack; do not submit another refund');
    if (refund.providerRefundId && refund.providerRefundId !== providerRefundId) throw new AppError(409, 'REFUND_ID_MISMATCH', 'Refund ID does not match this request');
    const provider = getRefundProvider('PAYSTACK');
    if (!provider) throw new AppError(503, 'REFUND_PROVIDER_UNAVAILABLE', 'Refund provider is unavailable');
    const result = await provider.getRefund(providerRefundId);
    const verified = await getPaymentProvider('PAYSTACK').query(refund.transactionReference);
    const transaction = verified.raw as { id?: unknown; metadata?: unknown } | undefined;
    let metadata = transaction?.metadata;
    if (typeof metadata === 'string') {
      try { metadata = JSON.parse(metadata) as unknown; } catch { metadata = null; }
    }
    const origin = metadata && typeof metadata === 'object' ? metadata as Record<string, unknown> : null;
    if (!Number.isSafeInteger(transaction?.id) || result.transactionId !== transaction?.id || verified.providerTransactionId !== refund.transactionReference || verified.amountMinorUnits !== refund.amountMinorUnits || verified.currency !== refund.currency || result.amountMinorUnits !== refund.amountMinorUnits || result.currency !== refund.currency || origin?.paymentId !== String(payment._id) || origin.organizationId !== String(payment.organizationId)) {
      throw new AppError(409, 'REFUND_REVIEW_VERIFICATION_FAILED', 'Provider refund does not match the original PMCC payment');
    }
    return this.recordProviderStatus(String(refund._id), result, { actorUserId: auth.userId, note: input.note });
  }

  static async applyLedger(auth: AuthenticatedUser, paymentId: string) {
    const refund = await this.reconcile(auth, paymentId);
    if (!refund || refund.status !== 'PROCESSED') throw new AppError(409, 'REFUND_NOT_PROCESSED', 'Paystack has not processed this refund');
    return FinanceService.reversePayment(auth, paymentId, String(refund._id));
  }

  static async recordWebhookStatus(transactionReference: string, result: Omit<RefundResult, 'providerRefundId'> & { providerRefundId?: number }) {
    const payment = await Payment.findOne({ provider: 'PAYSTACK', providerTransactionId: transactionReference });
    if (!payment) return null;
    const refund = await PaymentRefund.findOne({ organizationId: payment.organizationId, paymentId: payment._id });
    if (!refund) return null;
    if (refund.amountMinorUnits !== result.amountMinorUnits || refund.currency !== result.currency.toUpperCase()) throw new AppError(409, 'REFUND_AMOUNT_MISMATCH', 'Provider refund does not match the payment');
    if (!refund.providerRefundId) return refund;
    if (result.providerRefundId && result.providerRefundId !== refund.providerRefundId) throw new AppError(409, 'REFUND_ID_MISMATCH', 'Webhook refund ID does not match this request');
    if (!result.providerRefundId) {
      const provider = getRefundProvider('PAYSTACK');
      if (!provider) throw new AppError(503, 'REFUND_PROVIDER_UNAVAILABLE', 'Refund provider is unavailable');
      return this.recordProviderStatus(String(refund._id), await provider.getRefund(refund.providerRefundId));
    }
    return this.recordProviderStatus(String(refund._id), result);
  }

  private static async recordProviderStatus(refundId: string, result: Omit<RefundResult, 'providerRefundId'> & { providerRefundId?: number }, review?: { actorUserId: Types.ObjectId; note: string }) {
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        const refund = await PaymentRefund.findById(refundId).session(session);
        if (!refund) throw new AppError(404, 'REFUND_NOT_FOUND', 'Refund request not found');
        if (refund.amountMinorUnits !== result.amountMinorUnits || refund.currency !== result.currency.toUpperCase()) throw new AppError(409, 'REFUND_AMOUNT_MISMATCH', 'Provider refund does not match the payment');
        if (result.providerRefundId && refund.providerRefundId && refund.providerRefundId !== result.providerRefundId) throw new AppError(409, 'REFUND_ID_MISMATCH', 'Provider refund ID changed');
        if (review && refund.status !== 'SUBMISSION_UNKNOWN' && refund.status !== 'NEEDS_ATTENTION') throw new AppError(409, 'REFUND_REVIEW_NOT_REQUIRED', 'This refund is not awaiting manual review');
        if (refund.status === 'PROCESSED') return refund;
        const nextStatus: RefundStatus = result.status;
        const order: Record<string, number> = { SUBMITTING: 0, SUBMISSION_UNKNOWN: 0, PENDING: 1, PROCESSING: 2, NEEDS_ATTENTION: 2, FAILED: 3, PROCESSED: 4 };
        const statusChanged = (order[nextStatus] ?? 0) >= (order[refund.status] ?? 0) && (refund.status !== nextStatus || (result.providerRefundId && refund.providerRefundId !== result.providerRefundId));
        if (!statusChanged && !review) return refund;
        if (statusChanged) {
          refund.status = nextStatus;
          if (result.providerRefundId) refund.providerRefundId = result.providerRefundId;
          refund.providerUpdatedAt = new Date();
        }
        if (review) {
          refund.lastReviewedAt = new Date();
          refund.lastReviewedBy = review.actorUserId;
          refund.lastReviewNote = review.note;
        }
        await refund.save({ session });
        if (statusChanged) await AuditService.record({ organizationId: refund.organizationId, action: 'payment.refund.provider-status', resourceType: 'PaymentRefund', resourceId: refund._id, metadata: { paymentId: String(refund.paymentId), status: nextStatus, providerRefundId: refund.providerRefundId } }, session);
        if (review) await AuditService.record({ organizationId: refund.organizationId, actorUserId: review.actorUserId, action: 'payment.refund.reviewed', resourceType: 'PaymentRefund', resourceId: refund._id, metadata: { paymentId: String(refund.paymentId), providerRefundId: refund.providerRefundId, status: refund.status } }, session);
        return refund;
      });
    } finally {
      await session.endSession();
    }
  }
}
