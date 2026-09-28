import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose, { Types } from 'mongoose';
import { Payment } from '../../src/database/models/Payment.js';
import { RentCharge } from '../../src/database/models/RentCharge.js';
import { PaymentAllocation } from '../../src/database/models/PaymentAllocation.js';
import { AuditLog } from '../../src/database/models/AuditLog.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { FinanceService } from '../../src/modules/finance/finance.service.js';
import { IntegrationService } from '../../src/modules/integrations/integration.service.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

describe.skipIf(!process.env.RUN_TRANSACTION_E2E)('finance transactions on a replica set', () => {
  let replSet: MongoMemoryReplSet;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      binary: process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : {},
    });
    await mongoose.connect(replSet.getUri());
  }, 180_000);

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
  });

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
