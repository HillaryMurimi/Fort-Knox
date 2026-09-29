import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose, { Types } from 'mongoose';
import crypto from 'node:crypto';
import { Payment } from '../../src/database/models/Payment.js';
import { PaymentRefund } from '../../src/database/models/PaymentRefund.js';
import { RentCharge } from '../../src/database/models/RentCharge.js';
import { PaymentAllocation } from '../../src/database/models/PaymentAllocation.js';
import { AuditLog } from '../../src/database/models/AuditLog.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { FinanceService } from '../../src/modules/finance/finance.service.js';
import { RefundService } from '../../src/modules/finance/refund.service.js';
import { IntegrationService } from '../../src/modules/integrations/integration.service.js';
import { PaystackProvider } from '../../src/core/integrations/paystack.provider.js';
import { integrationConfig } from '../../src/core/integrations/config.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

describe.skipIf(!process.env.RUN_TRANSACTION_E2E)('finance transactions on a replica set', () => {
  let replSet: MongoMemoryReplSet;
  const originalPaystack = { ...integrationConfig.paystack };

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      binary: process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : {},
    });
    await mongoose.connect(replSet.getUri());
  }, 180_000);

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    integrationConfig.paystack.enabled = true;
    integrationConfig.paystack.secretKey = 'sk_test_refund';
  });

  afterEach(() => { vi.restoreAllMocks(); Object.assign(integrationConfig.paystack, originalPaystack); });

  afterAll(async () => {
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
  });

  async function fixture() {
    const ids = {
      organizationId: new Types.ObjectId(), propertyId: new Types.ObjectId(), buildingId: new Types.ObjectId(),
      floorId: new Types.ObjectId(), unitId: new Types.ObjectId(), tenantId: new Types.ObjectId(),
      tenancyId: new Types.ObjectId(), actorId: new Types.ObjectId(),
    };
    const charges = await RentCharge.create([50, 50].map((amount, index) => ({
      ...ids, periodStart: new Date(`2026-0${index + 8}-01`), periodEnd: new Date(`2026-0${index + 8}-28`),
      dueDate: new Date(`2026-0${index + 8}-05`), rentAmount: amount, totalAmount: amount,
      paidAmount: 0, balanceAmount: amount, currency: 'KES', status: 'OPEN', createdBy: ids.actorId, updatedBy: ids.actorId,
    })));
    const payment = await Payment.create({ ...ids, amount: 100, currency: 'KES', method: 'CARD', status: 'PENDING', createdBy: ids.actorId, updatedBy: ids.actorId });
    return { ids, charges, payment };
  }

  function mockVerifiedRefundPayment(payment: { _id: Types.ObjectId; organizationId: Types.ObjectId; amount: number; currency: string }, reference: string) {
    return vi.spyOn(PaystackProvider.prototype, 'query').mockResolvedValue({
      provider: 'PAYSTACK', providerTransactionId: reference, status: 'CONFIRMED',
      amountMinorUnits: payment.amount * 100, currency: payment.currency,
      raw: { id: 713, metadata: { paymentId: String(payment._id), organizationId: String(payment.organizationId) } },
    });
  }

  it('commits manual allocation and its audit together', async () => {
    const { ids, charges, payment } = await fixture();
    const auth: AuthenticatedUser = { userId: ids.actorId, isPlatformAdmin: true, memberships: [] };
    await FinanceService.confirmPayment(auth, String(payment._id), { allocations: charges.map((charge) => ({ rentChargeId: String(charge._id), amount: 50 })) });

    expect((await Payment.findById(payment._id))?.status).toBe('CONFIRMED');
    expect(await PaymentAllocation.countDocuments({ paymentId: payment._id })).toBe(2);
    expect(await RentCharge.countDocuments({ _id: { $in: charges.map((charge) => charge._id) }, status: 'PAID', balanceAmount: 0 })).toBe(2);
    expect(await AuditLog.countDocuments({ resourceId: payment._id, action: 'payment.confirmed' })).toBe(1);
  });

  it('rolls back manual allocations and balances when audit fails', async () => {
    const { ids, charges, payment } = await fixture();
    const auth: AuthenticatedUser = { userId: ids.actorId, isPlatformAdmin: true, memberships: [] };
    const audit = vi.spyOn(AuditService, 'record').mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(FinanceService.confirmPayment(auth, String(payment._id), { allocations: charges.map((charge) => ({ rentChargeId: String(charge._id), amount: 50 })) })).rejects.toThrow('audit unavailable');
    audit.mockRestore();

    expect((await Payment.findById(payment._id))?.status).toBe('PENDING');
    expect(await PaymentAllocation.countDocuments({ paymentId: payment._id })).toBe(0);
    expect(await RentCharge.countDocuments({ _id: { $in: charges.map((charge) => charge._id) }, balanceAmount: 50 })).toBe(2);
  });

  it('reverses confirmed payment balances and records the audit once', async () => {
    const { ids, charges, payment } = await fixture();
    const auth: AuthenticatedUser = { userId: ids.actorId, isPlatformAdmin: true, memberships: [] };
    const allocations = { allocations: charges.map((charge) => ({ rentChargeId: String(charge._id), amount: 50 })) };
    await FinanceService.confirmPayment(auth, String(payment._id), allocations);

    await FinanceService.reversePayment(auth, String(payment._id));
    expect((await Payment.findById(payment._id))?.status).toBe('REVERSED');
    expect(await PaymentAllocation.countDocuments({ paymentId: payment._id })).toBe(2);
    expect(await RentCharge.countDocuments({ _id: { $in: charges.map((charge) => charge._id) }, paidAmount: 0, balanceAmount: 50, status: { $in: ['OPEN', 'OVERDUE'] } })).toBe(2);
    expect(await AuditLog.countDocuments({ resourceId: payment._id, action: 'payment.reversed' })).toBe(1);
    await expect(FinanceService.reversePayment(auth, String(payment._id))).rejects.toMatchObject({ code: 'INVALID_PAYMENT_STATE' });
    expect(await AuditLog.countDocuments({ resourceId: payment._id, action: 'payment.reversed' })).toBe(1);
  });

  it('rolls back reversal when audit fails', async () => {
    const { ids, charges, payment } = await fixture();
    const auth: AuthenticatedUser = { userId: ids.actorId, isPlatformAdmin: true, memberships: [] };
    await FinanceService.confirmPayment(auth, String(payment._id), { allocations: charges.map((charge) => ({ rentChargeId: String(charge._id), amount: 50 })) });
    const audit = vi.spyOn(AuditService, 'record').mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(FinanceService.reversePayment(auth, String(payment._id))).rejects.toThrow('audit unavailable');
    audit.mockRestore();

    expect((await Payment.findById(payment._id))?.status).toBe('CONFIRMED');
    expect(await RentCharge.countDocuments({ _id: { $in: charges.map((charge) => charge._id) }, status: 'PAID', paidAmount: 50, balanceAmount: 0 })).toBe(2);
    expect(await AuditLog.countDocuments({ resourceId: payment._id, action: 'payment.reversed' })).toBe(0);
  });

  it('refuses reversal when the historical allocation set is incomplete', async () => {
    const { ids, charges, payment } = await fixture();
    const auth: AuthenticatedUser = { userId: ids.actorId, isPlatformAdmin: true, memberships: [] };
    await FinanceService.confirmPayment(auth, String(payment._id), { allocations: charges.map((charge) => ({ rentChargeId: String(charge._id), amount: 50 })) });
    await PaymentAllocation.deleteOne({ paymentId: payment._id, rentChargeId: charges[0]?._id });

    await expect(FinanceService.reversePayment(auth, String(payment._id))).rejects.toMatchObject({ code: 'INVALID_PAYMENT_ALLOCATIONS' });
    expect((await Payment.findById(payment._id))?.status).toBe('CONFIRMED');
    expect(await RentCharge.countDocuments({ _id: { $in: charges.map((charge) => charge._id) }, status: 'PAID', balanceAmount: 0 })).toBe(2);
  });

  it('rejects reversal without scoped authorization', async () => {
    const { ids, charges, payment } = await fixture();
    const admin: AuthenticatedUser = { userId: ids.actorId, isPlatformAdmin: true, memberships: [] };
    await FinanceService.confirmPayment(admin, String(payment._id), { allocations: charges.map((charge) => ({ rentChargeId: String(charge._id), amount: 50 })) });
    const outsider: AuthenticatedUser = { userId: new Types.ObjectId(), isPlatformAdmin: false, memberships: [] };

    await expect(FinanceService.reversePayment(outsider, String(payment._id))).rejects.toMatchObject({ statusCode: 403 });
    expect((await Payment.findById(payment._id))?.status).toBe('CONFIRMED');
    expect(await RentCharge.countDocuments({ _id: { $in: charges.map((charge) => charge._id) }, status: 'PAID', balanceAmount: 0 })).toBe(2);
    expect(await AuditLog.countDocuments({ resourceId: payment._id, action: 'payment.reversed' })).toBe(0);
  });

  it('submits one Paystack refund and reconciles its status without changing the ledger', async () => {
    const { ids, charges, payment } = await fixture();
    const auth: AuthenticatedUser = { userId: ids.actorId, isPlatformAdmin: true, memberships: [] };
    await FinanceService.confirmPayment(auth, String(payment._id), { allocations: charges.map((charge) => ({ rentChargeId: String(charge._id), amount: 50 })) });
    await Payment.updateOne({ _id: payment._id }, { provider: 'PAYSTACK', providerTransactionId: 'rent-ref-1' });
    mockVerifiedRefundPayment(payment, 'rent-ref-1');
    const submit = vi.spyOn(PaystackProvider.prototype, 'createRefund').mockResolvedValue({ providerRefundId: 321, amountMinorUnits: 10000, currency: 'KES', status: 'PENDING' });
    const fetch = vi.spyOn(PaystackProvider.prototype, 'getRefund').mockResolvedValue({ providerRefundId: 321, amountMinorUnits: 10000, currency: 'KES', status: 'PROCESSED' });

    expect((await RefundService.request(auth, String(payment._id), 'Duplicate rent payment'))?.status).toBe('PENDING');
    await RefundService.request(auth, String(payment._id), 'Duplicate rent payment');
    expect(submit).toHaveBeenCalledOnce();
    expect((await RefundService.reconcile(auth, String(payment._id)))?.status).toBe('PROCESSED');
    expect(fetch).toHaveBeenCalledWith(321);
    expect((await Payment.findById(payment._id))?.status).toBe('CONFIRMED');
    expect(await RentCharge.countDocuments({ _id: { $in: charges.map((charge) => charge._id) }, status: 'PAID', balanceAmount: 0 })).toBe(2);
    expect(await AuditLog.countDocuments({ resourceType: 'PaymentRefund', action: 'payment.refund.requested' })).toBe(1);
  });

  it('lists refunds only within the manager assigned unit and organization', async () => {
    const { ids, payment } = await fixture();
    const otherUnitId = new Types.ObjectId();
    const otherPaymentId = new Types.ObjectId();
    await PaymentRefund.create([
      { organizationId: ids.organizationId, paymentId: payment._id, propertyId: ids.propertyId, buildingId: ids.buildingId, unitId: ids.unitId, provider: 'PAYSTACK', transactionReference: 'scoped-1', amountMinorUnits: 10000, currency: 'KES', status: 'PENDING', reason: 'Duplicate rent payment', requestedBy: ids.actorId },
      { organizationId: ids.organizationId, paymentId: otherPaymentId, propertyId: ids.propertyId, buildingId: ids.buildingId, unitId: otherUnitId, provider: 'PAYSTACK', transactionReference: 'scoped-2', amountMinorUnits: 10000, currency: 'KES', status: 'PENDING', reason: 'Duplicate rent payment', requestedBy: ids.actorId },
    ]);
    const manager: AuthenticatedUser = { userId: ids.actorId, isPlatformAdmin: false, memberships: [{ organizationId: ids.organizationId, roleIds: [], roles: ['PROPERTY_MANAGER'], permissions: ['financial.manage'], scope: { allProperties: false, propertyIds: [], buildingIds: [], unitIds: [ids.unitId] } }] };
    const refunds = await RefundService.list(manager, String(ids.organizationId));
    expect(refunds.map(refund => String(refund.paymentId))).toEqual([String(payment._id)]);
    await expect(RefundService.list(manager, String(new Types.ObjectId()))).rejects.toMatchObject({ statusCode: 403 });
  });

  it('requires processed provider evidence and supervised action before reversing Paystack rent', async () => {
    const { ids, charges, payment } = await fixture();
    const auth: AuthenticatedUser = { userId: ids.actorId, isPlatformAdmin: true, memberships: [] };
    await FinanceService.confirmPayment(auth, String(payment._id), { allocations: charges.map((charge) => ({ rentChargeId: String(charge._id), amount: 50 })) });
    await Payment.updateOne({ _id: payment._id }, { provider: 'PAYSTACK', providerTransactionId: 'rent-ref-ledger' });
    mockVerifiedRefundPayment(payment, 'rent-ref-ledger');
    vi.spyOn(PaystackProvider.prototype, 'createRefund').mockResolvedValue({ providerRefundId: 500, amountMinorUnits: 10000, currency: 'KES', status: 'PENDING' });
    const fetch = vi.spyOn(PaystackProvider.prototype, 'getRefund').mockResolvedValueOnce({ providerRefundId: 500, amountMinorUnits: 10000, currency: 'KES', status: 'PENDING' }).mockResolvedValue({ providerRefundId: 500, amountMinorUnits: 10000, currency: 'KES', status: 'PROCESSED' });
    await RefundService.request(auth, String(payment._id), 'Duplicate rent payment');

    await expect(FinanceService.reversePayment(auth, String(payment._id))).rejects.toMatchObject({ code: 'REFUND_LEDGER_ACTION_REQUIRED' });
    await expect(RefundService.applyLedger(auth, String(payment._id))).rejects.toMatchObject({ code: 'REFUND_NOT_PROCESSED' });
    expect((await Payment.findById(payment._id))?.status).toBe('CONFIRMED');
    await RefundService.applyLedger(auth, String(payment._id));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((await Payment.findById(payment._id))?.status).toBe('REVERSED');
    expect(await RentCharge.countDocuments({ _id: { $in: charges.map((charge) => charge._id) }, paidAmount: 0, balanceAmount: 50 })).toBe(2);
    expect((await PaymentRefund.findOne({ paymentId: payment._id }))?.ledgerReversedBy).toEqual(auth.userId);
    await expect(RefundService.applyLedger(auth, String(payment._id))).rejects.toMatchObject({ code: 'INVALID_PAYMENT_STATE' });
    expect(await AuditLog.countDocuments({ resourceId: payment._id, action: 'payment.reversed' })).toBe(1);
  });

  it('rolls back the refund ledger marker with balances when audit fails', async () => {
    const { ids, charges, payment } = await fixture();
    const auth: AuthenticatedUser = { userId: ids.actorId, isPlatformAdmin: true, memberships: [] };
    await FinanceService.confirmPayment(auth, String(payment._id), { allocations: charges.map((charge) => ({ rentChargeId: String(charge._id), amount: 50 })) });
    await Payment.updateOne({ _id: payment._id }, { provider: 'PAYSTACK', providerTransactionId: 'rent-ref-rollback' });
    mockVerifiedRefundPayment(payment, 'rent-ref-rollback');
    vi.spyOn(PaystackProvider.prototype, 'createRefund').mockResolvedValue({ providerRefundId: 501, amountMinorUnits: 10000, currency: 'KES', status: 'PROCESSED' });
    vi.spyOn(PaystackProvider.prototype, 'getRefund').mockResolvedValue({ providerRefundId: 501, amountMinorUnits: 10000, currency: 'KES', status: 'PROCESSED' });
    await RefundService.request(auth, String(payment._id), 'Duplicate rent payment');
    const audit = vi.spyOn(AuditService, 'record').mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(RefundService.applyLedger(auth, String(payment._id))).rejects.toThrow('audit unavailable');
    audit.mockRestore();

    expect((await Payment.findById(payment._id))?.status).toBe('CONFIRMED');
    expect((await PaymentRefund.findOne({ paymentId: payment._id }))?.ledgerReversedAt).toBeUndefined();
    expect(await RentCharge.countDocuments({ _id: { $in: charges.map((charge) => charge._id) }, status: 'PAID', balanceAmount: 0 })).toBe(2);
  });

  it('quarantines an ambiguous submission and rejects mismatched provider evidence', async () => {
    const { ids, charges, payment } = await fixture();
    const auth: AuthenticatedUser = { userId: ids.actorId, isPlatformAdmin: true, memberships: [] };
    await FinanceService.confirmPayment(auth, String(payment._id), { allocations: charges.map((charge) => ({ rentChargeId: String(charge._id), amount: 50 })) });
    await Payment.updateOne({ _id: payment._id }, { provider: 'PAYSTACK', providerTransactionId: 'rent-ref-2' });
    mockVerifiedRefundPayment(payment, 'rent-ref-2');
    const submit = vi.spyOn(PaystackProvider.prototype, 'createRefund').mockRejectedValue(new Error('timeout'));

    expect((await RefundService.request(auth, String(payment._id), 'Duplicate rent payment'))?.status).toBe('SUBMISSION_UNKNOWN');
    await RefundService.request(auth, String(payment._id), 'Duplicate rent payment');
    expect(submit).toHaveBeenCalledOnce();
    await expect(RefundService.recordWebhookStatus('rent-ref-2', { amountMinorUnits: 9999, currency: 'KES', status: 'PROCESSED' })).rejects.toMatchObject({ code: 'REFUND_AMOUNT_MISMATCH' });
    expect((await PaymentRefund.findOne({ paymentId: payment._id }))?.status).toBe('SUBMISSION_UNKNOWN');
    expect((await Payment.findById(payment._id))?.status).toBe('CONFIRMED');
  });

  it('links an unknown submission only to a matching Paystack refund without resubmitting', async () => {
    const { ids, charges, payment } = await fixture();
    const auth: AuthenticatedUser = { userId: ids.actorId, isPlatformAdmin: true, memberships: [] };
    await FinanceService.confirmPayment(auth, String(payment._id), { allocations: charges.map(charge => ({ rentChargeId: String(charge._id), amount: 50 })) });
    await Payment.updateOne({ _id: payment._id }, { provider: 'PAYSTACK', providerTransactionId: 'review-ref-1' });
    mockVerifiedRefundPayment(payment, 'review-ref-1');
    const submit = vi.spyOn(PaystackProvider.prototype, 'createRefund').mockRejectedValue(new Error('timeout'));
    const fetch = vi.spyOn(PaystackProvider.prototype, 'getRefund').mockResolvedValueOnce({ providerRefundId: 777, transactionId: 999, amountMinorUnits: 10000, currency: 'KES', status: 'PENDING' }).mockResolvedValue({ providerRefundId: 777, transactionId: 713, amountMinorUnits: 10000, currency: 'KES', status: 'PENDING' });
    await RefundService.request(auth, String(payment._id), 'Duplicate rent payment');

    await expect(RefundService.review(auth, String(payment._id), { note: 'Checked Paystack but refund ID is unknown' })).rejects.toMatchObject({ code: 'REFUND_ID_REQUIRED' });
    const outsider: AuthenticatedUser = { userId: new Types.ObjectId(), isPlatformAdmin: false, memberships: [] };
    await expect(RefundService.review(outsider, String(payment._id), { providerRefundId: 777, note: 'Unauthorized dashboard investigation' })).rejects.toMatchObject({ statusCode: 403 });
    await expect(RefundService.review(auth, String(payment._id), { providerRefundId: 777, note: 'Found refund in Paystack dashboard' })).rejects.toMatchObject({ code: 'REFUND_REVIEW_VERIFICATION_FAILED' });
    expect((await PaymentRefund.findOne({ paymentId: payment._id }))?.status).toBe('SUBMISSION_UNKNOWN');
    await RefundService.review(auth, String(payment._id), { providerRefundId: 777, note: 'Matched transaction and full refund in Paystack' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(submit).toHaveBeenCalledOnce();
    expect((await PaymentRefund.findOne({ paymentId: payment._id }))?.providerRefundId).toBe(777);
    expect((await PaymentRefund.findOne({ paymentId: payment._id }))?.lastReviewedBy).toEqual(auth.userId);
    expect((await Payment.findById(payment._id))?.status).toBe('CONFIRMED');
    expect(await RentCharge.countDocuments({ _id: { $in: charges.map(charge => charge._id) }, status: 'PAID', balanceAmount: 0 })).toBe(2);
    expect(await AuditLog.countDocuments({ action: 'payment.refund.reviewed' })).toBe(1);
    await expect(RefundService.review(auth, String(payment._id), { providerRefundId: 777, note: 'Attempt another review of a pending refund' })).rejects.toMatchObject({ code: 'REFUND_REVIEW_NOT_REQUIRED' });
  });

  it('keeps a needs-attention review and provider update atomic with audit', async () => {
    const { ids, charges, payment } = await fixture();
    const auth: AuthenticatedUser = { userId: ids.actorId, isPlatformAdmin: true, memberships: [] };
    await FinanceService.confirmPayment(auth, String(payment._id), { allocations: charges.map(charge => ({ rentChargeId: String(charge._id), amount: 50 })) });
    await Payment.updateOne({ _id: payment._id }, { provider: 'PAYSTACK', providerTransactionId: 'review-ref-2' });
    mockVerifiedRefundPayment(payment, 'review-ref-2');
    vi.spyOn(PaystackProvider.prototype, 'createRefund').mockResolvedValue({ providerRefundId: 778, amountMinorUnits: 10000, currency: 'KES', status: 'NEEDS_ATTENTION' });
    vi.spyOn(PaystackProvider.prototype, 'getRefund').mockResolvedValue({ providerRefundId: 778, transactionId: 713, amountMinorUnits: 10000, currency: 'KES', status: 'PROCESSING' });
    await RefundService.request(auth, String(payment._id), 'Duplicate rent payment');
    const audit = vi.spyOn(AuditService, 'record').mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(RefundService.review(auth, String(payment._id), { note: 'Checked customer details in Paystack dashboard' })).rejects.toThrow('audit unavailable');
    audit.mockRestore();
    expect((await PaymentRefund.findOne({ paymentId: payment._id }))?.status).toBe('NEEDS_ATTENTION');
    expect((await PaymentRefund.findOne({ paymentId: payment._id }))?.lastReviewedAt).toBeUndefined();
    await RefundService.review(auth, String(payment._id), { note: 'Checked customer details in Paystack dashboard' });
    expect((await PaymentRefund.findOne({ paymentId: payment._id }))?.status).toBe('PROCESSING');
    expect(await AuditLog.countDocuments({ action: 'payment.refund.reviewed' })).toBe(1);
    expect((await Payment.findById(payment._id))?.status).toBe('CONFIRMED');
  });

  it('accepts only signed matching Paystack refund status events', async () => {
    const { ids, charges, payment } = await fixture();
    const auth: AuthenticatedUser = { userId: ids.actorId, isPlatformAdmin: true, memberships: [] };
    await FinanceService.confirmPayment(auth, String(payment._id), { allocations: charges.map((charge) => ({ rentChargeId: String(charge._id), amount: 50 })) });
    await Payment.updateOne({ _id: payment._id }, { provider: 'PAYSTACK', providerTransactionId: 'rent-ref-3' });
    mockVerifiedRefundPayment(payment, 'rent-ref-3');
    vi.spyOn(PaystackProvider.prototype, 'createRefund').mockResolvedValue({ providerRefundId: 322, amountMinorUnits: 10000, currency: 'KES', status: 'PENDING' });
    await RefundService.request(auth, String(payment._id), 'Duplicate rent payment');
    const previous = { ...integrationConfig.paystack };
    integrationConfig.paystack.secretKey = 'sk_test_refund_webhook';
    try {
      const fetch = vi.spyOn(PaystackProvider.prototype, 'getRefund').mockResolvedValue({ providerRefundId: 322, amountMinorUnits: 10000, currency: 'KES', status: 'PROCESSING' });
      const noIdPayload = Buffer.from(JSON.stringify({ event: 'refund.processing', data: { transaction_reference: 'rent-ref-3', amount: '10000', currency: 'KES' } }));
      const noIdSignature = crypto.createHmac('sha512', 'sk_test_refund_webhook').update(noIdPayload).digest('hex');
      await IntegrationService.handleWebhook('PAYSTACK', noIdPayload, noIdSignature);
      expect(fetch).toHaveBeenCalledWith(322);
      expect((await PaymentRefund.findOne({ paymentId: payment._id }))?.status).toBe('PROCESSING');
      const payload = Buffer.from(JSON.stringify({ event: 'refund.processed', data: { transaction_reference: 'rent-ref-3', id: 322, amount: '10000', currency: 'KES' } }));
      await expect(IntegrationService.handleWebhook('PAYSTACK', payload, 'invalid')).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_SIGNATURE' });
      const signature = crypto.createHmac('sha512', 'sk_test_refund_webhook').update(payload).digest('hex');
      await IntegrationService.handleWebhook('PAYSTACK', payload, signature);
      await IntegrationService.handleWebhook('PAYSTACK', payload, signature);
      expect((await PaymentRefund.findOne({ paymentId: payment._id }))?.status).toBe('PROCESSED');
      expect(await AuditLog.countDocuments({ resourceType: 'PaymentRefund', action: 'payment.refund.provider-status' })).toBe(3);
      expect((await Payment.findById(payment._id))?.status).toBe('CONFIRMED');
    } finally {
      Object.assign(integrationConfig.paystack, previous);
    }
  });

  it('rejects refund requests without financial management scope or a supported provider', async () => {
    const { ids, charges, payment } = await fixture();
    const admin: AuthenticatedUser = { userId: ids.actorId, isPlatformAdmin: true, memberships: [] };
    await FinanceService.confirmPayment(admin, String(payment._id), { allocations: charges.map((charge) => ({ rentChargeId: String(charge._id), amount: 50 })) });
    const outsider: AuthenticatedUser = { userId: new Types.ObjectId(), isPlatformAdmin: false, memberships: [] };
    await expect(RefundService.request(outsider, String(payment._id), 'Duplicate rent payment')).rejects.toMatchObject({ statusCode: 403 });
    await expect(RefundService.request(admin, String(payment._id), 'Duplicate rent payment')).rejects.toMatchObject({ code: 'REFUND_PROVIDER_UNAVAILABLE' });
    expect(await PaymentRefund.countDocuments({ paymentId: payment._id })).toBe(0);
  });

  it('refuses a Paystack reference that was not originated for this payment', async () => {
    const { ids, charges, payment } = await fixture();
    const auth: AuthenticatedUser = { userId: ids.actorId, isPlatformAdmin: true, memberships: [] };
    await FinanceService.confirmPayment(auth, String(payment._id), { allocations: charges.map((charge) => ({ rentChargeId: String(charge._id), amount: 50 })) });
    await Payment.updateOne({ _id: payment._id }, { provider: 'PAYSTACK', providerTransactionId: 'someone-elses-transaction' });
    const query = mockVerifiedRefundPayment(payment, 'someone-elses-transaction');
    query.mockResolvedValueOnce({ provider: 'PAYSTACK', providerTransactionId: 'someone-elses-transaction', status: 'CONFIRMED', amountMinorUnits: 10000, currency: 'KES', raw: { metadata: { paymentId: 'other-payment', organizationId: String(ids.organizationId) } } });
    const submit = vi.spyOn(PaystackProvider.prototype, 'createRefund');

    await expect(RefundService.request(auth, String(payment._id), 'Duplicate rent payment')).rejects.toMatchObject({ code: 'REFUND_PAYMENT_VERIFICATION_FAILED' });
    expect(submit).not.toHaveBeenCalled();
    expect(await PaymentRefund.countDocuments({ paymentId: payment._id })).toBe(0);
  });

  it('does not contact Paystack if refund reservation audit fails', async () => {
    const { ids, charges, payment } = await fixture();
    const auth: AuthenticatedUser = { userId: ids.actorId, isPlatformAdmin: true, memberships: [] };
    await FinanceService.confirmPayment(auth, String(payment._id), { allocations: charges.map((charge) => ({ rentChargeId: String(charge._id), amount: 50 })) });
    await Payment.updateOne({ _id: payment._id }, { provider: 'PAYSTACK', providerTransactionId: 'rent-ref-4' });
    mockVerifiedRefundPayment(payment, 'rent-ref-4');
    const submit = vi.spyOn(PaystackProvider.prototype, 'createRefund');
    vi.spyOn(AuditService, 'record').mockRejectedValueOnce(new Error('audit unavailable'));

    await expect(RefundService.request(auth, String(payment._id), 'Duplicate rent payment')).rejects.toThrow('audit unavailable');
    expect(await PaymentRefund.countDocuments({ paymentId: payment._id })).toBe(0);
    expect(submit).not.toHaveBeenCalled();
  });

  it('rolls back provider balances if audit fails, then confirms exactly once', async () => {
    const { charges, payment } = await fixture();
    const audit = vi.spyOn(AuditService, 'record').mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(IntegrationService.confirmProviderPayment(payment)).rejects.toThrow('audit unavailable');
    audit.mockRestore();

    expect((await Payment.findById(payment._id))?.status).toBe('PENDING');
    expect(await PaymentAllocation.countDocuments({ paymentId: payment._id })).toBe(0);
    expect(await RentCharge.countDocuments({ _id: { $in: charges.map((charge) => charge._id) }, balanceAmount: 50 })).toBe(2);

    const confirmed = await IntegrationService.confirmProviderPayment(payment);
    expect(confirmed.status).toBe('CONFIRMED');
    await IntegrationService.confirmProviderPayment(payment);
    expect(await PaymentAllocation.countDocuments({ paymentId: payment._id })).toBe(2);
    expect(await AuditLog.countDocuments({ resourceId: payment._id, action: 'payment.provider.confirmed' })).toBe(1);
  });
});
