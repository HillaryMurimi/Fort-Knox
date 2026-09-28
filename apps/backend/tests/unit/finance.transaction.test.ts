import mongoose, { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Payment } from '../../src/database/models/Payment.js';
import { RentCharge } from '../../src/database/models/RentCharge.js';
import { PaymentAllocation } from '../../src/database/models/PaymentAllocation.js';
import { Tenant } from '../../src/database/models/Tenant.js';
import { ResourceScopeService } from '../../src/core/authorization/resource-scope.service.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { FinanceService } from '../../src/modules/finance/finance.service.js';
import { IntegrationService } from '../../src/modules/integrations/integration.service.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

afterEach(() => vi.restoreAllMocks());

function mockSession() {
  const session = { withTransaction: vi.fn(async (callback: () => Promise<unknown>) => callback()), endSession: vi.fn() };
  vi.spyOn(mongoose, 'startSession').mockResolvedValue(session as never);
  return session;
}

describe('payment allocation transactions', () => {
  it('writes manual allocations, balances, payment and audit in one session', async () => {
    const session = mockSession();
    const organizationId = new Types.ObjectId();
    const tenancyId = new Types.ObjectId();
    const tenantId = new Types.ObjectId();
    const ids = [new Types.ObjectId(), new Types.ObjectId()];
    const payment = { _id: new Types.ObjectId(), organizationId, tenancyId, tenantId, amount: 100, currency: 'KES', status: 'PENDING', paidAt: null as Date | null, confirmedAt: null as Date | null, save: vi.fn() };
    const charges = ids.map((_id, index) => ({ _id, organizationId, tenancyId, tenantId, totalAmount: index === 0 ? 60 : 40, paidAmount: 0, balanceAmount: index === 0 ? 60 : 40, currency: 'KES', status: 'OPEN', save: vi.fn() }));
    vi.spyOn(Payment, 'findById').mockReturnValue({ session: async () => payment } as never);
    vi.spyOn(Tenant, 'findById').mockReturnValue({ session: () => ({ lean: async () => ({ userId: new Types.ObjectId() }) }) } as never);
    vi.spyOn(ResourceScopeService, 'assertUnit').mockImplementation(() => undefined);
    vi.spyOn(RentCharge, 'findById').mockImplementation((id) => ({ session: async () => charges.find((charge) => String(charge._id) === String(id)) }) as never);
    vi.spyOn(PaymentAllocation, 'exists').mockReturnValue({ session: async () => null } as never);
    const createAllocation = vi.spyOn(PaymentAllocation, 'create').mockResolvedValue([] as never);
    const audit = vi.spyOn(AuditService, 'record').mockResolvedValue(undefined as never);
    const auth = { userId: new Types.ObjectId() } as AuthenticatedUser;

    const confirmed = await FinanceService.confirmPayment(auth, String(payment._id), { allocations: ids.map((rentChargeId, index) => ({ rentChargeId: String(rentChargeId), amount: index === 0 ? 60 : 40 })) });

    expect(confirmed.status).toBe('CONFIRMED');
    expect(createAllocation).toHaveBeenCalledTimes(2);
    for (const call of createAllocation.mock.calls) expect(call[1]).toEqual({ session });
    for (const charge of charges) expect(charge.save).toHaveBeenCalledWith({ session });
    expect(payment.save).toHaveBeenCalledWith({ session });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'payment.confirmed', resourceId: payment._id }), session);
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it('does not allocate or re-audit a provider payment already confirmed', async () => {
    const session = mockSession();
    const payment = { _id: new Types.ObjectId(), organizationId: new Types.ObjectId(), propertyId: new Types.ObjectId(), buildingId: new Types.ObjectId(), unitId: new Types.ObjectId(), tenancyId: new Types.ObjectId(), createdBy: new Types.ObjectId(), updatedBy: new Types.ObjectId(), currency: 'KES', amount: 50, method: 'CARD' as const, status: 'CONFIRMED' };
    vi.spyOn(Payment, 'findOne').mockReturnValue({ session: async () => payment } as never);
    const createAllocation = vi.spyOn(PaymentAllocation, 'create');
    const audit = vi.spyOn(AuditService, 'record');

    expect(await IntegrationService.confirmProviderPayment(payment)).toBe(payment);
    expect(createAllocation).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it('propagates a provider allocation failure and closes the session', async () => {
    const session = mockSession();
    const payment = { _id: new Types.ObjectId(), organizationId: new Types.ObjectId(), propertyId: new Types.ObjectId(), buildingId: new Types.ObjectId(), unitId: new Types.ObjectId(), tenancyId: new Types.ObjectId(), createdBy: new Types.ObjectId(), updatedBy: new Types.ObjectId(), currency: 'KES', amount: 50, method: 'CARD' as const, status: 'PENDING' };
    const charge = { _id: new Types.ObjectId(), balanceAmount: 50, totalAmount: 50, paidAmount: 0, status: 'OPEN', updatedBy: payment.updatedBy, save: vi.fn() };
    vi.spyOn(Payment, 'findOne').mockReturnValue({ session: async () => payment } as never);
    vi.spyOn(RentCharge, 'find').mockReturnValue({ sort: () => ({ session: async () => [charge] }) } as never);
    vi.spyOn(PaymentAllocation, 'create').mockRejectedValue(new Error('write failed'));
    const audit = vi.spyOn(AuditService, 'record');

    await expect(IntegrationService.confirmProviderPayment(payment)).rejects.toThrow('write failed');
    expect(charge.save).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledOnce();
  });
});
