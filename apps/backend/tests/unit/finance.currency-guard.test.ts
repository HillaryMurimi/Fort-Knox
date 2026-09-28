import { afterEach, describe, expect, it, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { Payment } from '../../src/database/models/Payment.js';
import { RentCharge } from '../../src/database/models/RentCharge.js';
import { PaymentAllocation } from '../../src/database/models/PaymentAllocation.js';
import { Tenant } from '../../src/database/models/Tenant.js';
import { ResourceScopeService } from '../../src/core/authorization/resource-scope.service.js';
import { FinanceService } from '../../src/modules/finance/finance.service.js';
import { IntegrationService } from '../../src/modules/integrations/integration.service.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

afterEach(() => vi.restoreAllMocks());

describe('finance currency guards', () => {
  it('rejects a later mismatched charge before writing any allocation', async () => {
    const organizationId = new Types.ObjectId();
    const tenancyId = new Types.ObjectId();
    const tenantId = new Types.ObjectId();
    const firstId = new Types.ObjectId();
    const secondId = new Types.ObjectId();
    const payment = { _id: new Types.ObjectId(), organizationId, tenancyId, tenantId, currency: 'KES', amount: 100, status: 'PENDING' };
    vi.spyOn(mongoose, 'startSession').mockResolvedValue({ withTransaction: async (callback: () => Promise<unknown>) => callback(), endSession: vi.fn() } as never);
    vi.spyOn(Payment, 'findById').mockReturnValue({ session: async () => payment } as never);
    vi.spyOn(Tenant, 'findById').mockReturnValue({ session: () => ({ lean: async () => ({ userId: new Types.ObjectId() }) }) } as never);
    vi.spyOn(ResourceScopeService, 'assertUnit').mockImplementation(() => undefined);
    vi.spyOn(RentCharge, 'findById').mockImplementation((id) => ({ session: async () => ({ _id: id, organizationId, tenancyId, tenantId, currency: String(id) === String(firstId) ? 'KES' : 'USD', balanceAmount: 50 }) }) as never);
    vi.spyOn(PaymentAllocation, 'exists').mockReturnValue({ session: async () => null } as never);
    const createAllocation = vi.spyOn(PaymentAllocation, 'create');

    await expect(FinanceService.confirmPayment({ userId: new Types.ObjectId() } as AuthenticatedUser, String(payment._id), { allocations: [{ rentChargeId: String(firstId), amount: 50 }, { rentChargeId: String(secondId), amount: 50 }] })).rejects.toMatchObject({ code: 'ALLOCATION_CURRENCY_MISMATCH' });
    expect(createAllocation).not.toHaveBeenCalled();
  });

  it('queries only same-currency charges for provider confirmation', async () => {
    vi.spyOn(mongoose, 'startSession').mockResolvedValue({ withTransaction: async (callback: () => Promise<unknown>) => callback(), endSession: vi.fn() } as never);
    const findCharges = vi.spyOn(RentCharge, 'find').mockReturnValue({ sort: () => ({ session: async () => [] }) } as never);
    const payment = { _id: new Types.ObjectId(), organizationId: new Types.ObjectId(), propertyId: new Types.ObjectId(), buildingId: new Types.ObjectId(), unitId: new Types.ObjectId(), tenancyId: new Types.ObjectId(), createdBy: new Types.ObjectId(), updatedBy: new Types.ObjectId(), currency: 'KES', amount: 50, method: 'CARD' as const, status: 'PENDING' };
    vi.spyOn(Payment, 'findOne').mockReturnValue({ session: async () => payment } as never);

    await expect(IntegrationService.confirmProviderPayment(payment)).rejects.toMatchObject({ code: 'UNALLOCATED_PROVIDER_PAYMENT' });
    expect(findCharges).toHaveBeenCalledWith(expect.objectContaining({ currency: 'KES', organizationId: payment.organizationId, tenancyId: payment.tenancyId }));
  });
});
