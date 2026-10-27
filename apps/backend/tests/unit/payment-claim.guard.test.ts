import { afterEach, describe, expect, it, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { Payment } from '../../src/database/models/Payment.js';
import { Tenant } from '../../src/database/models/Tenant.js';
import { PaymentAllocation } from '../../src/database/models/PaymentAllocation.js';
import { ResourceScopeService } from '../../src/core/authorization/resource-scope.service.js';
import { FinanceService } from '../../src/modules/finance/finance.service.js';
import { PaymentClaimService } from '../../src/modules/finance/payment-claim.service.js';
import { paymentClaimSchema, manualConfirmationSchema } from '../../src/modules/finance/finance.schemas.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

afterEach(() => vi.restoreAllMocks());

describe('assisted rent verification guards', () => {
  it('does not let platform administration read private claim records', async () => {
    const auth: AuthenticatedUser = { userId: new Types.ObjectId(), isPlatformAdmin: true, memberships: [] };
    await expect(PaymentClaimService.list(auth, String(new Types.ObjectId()), { page: 1, limit: 20 })).rejects.toMatchObject({ code: 'PRIVATE_FINANCE_ACCESS_DENIED' });
  });

  it('does not let non-tenants report another resident payment', async () => {
    const orgId = new Types.ObjectId();
    const auth: AuthenticatedUser = { userId: new Types.ObjectId(), isPlatformAdmin: false, memberships: [{ organizationId: orgId, roleIds: [], roles: ['LANDLORD'], permissions: ['payment.create'], scope: { allProperties: true, propertyIds: [], buildingIds: [], unitIds: [] } }] };
    await expect(PaymentClaimService.report(auth, String(orgId), { tenancyId: String(new Types.ObjectId()), amount: 100, currency: 'KES', method: 'MPESA', paidAt: new Date(), evidenceIds: [], idempotencyKey: crypto.randomUUID() })).rejects.toMatchObject({ code: 'TENANT_ONLY' });
  });

  it('validates an explicit receiving-account check and basis', () => {
    const allocations = [{ rentChargeId: String(new Types.ObjectId()), amount: 100 }];
    expect(manualConfirmationSchema.safeParse({ allocations }).success).toBe(false);
    expect(manualConfirmationSchema.safeParse({ allocations, verification: { checkedReceivingAccount: false, basis: 'Bank statement checked' } }).success).toBe(false);
    expect(manualConfirmationSchema.safeParse({ allocations, verification: { checkedReceivingAccount: true, basis: 'Bank statement checked' } }).success).toBe(true);
  });

  it('requires an idempotency key and valid money for tenant reports', () => {
    const report = { tenancyId: String(new Types.ObjectId()), amount: 12.345, method: 'MPESA', paidAt: new Date(), idempotencyKey: crypto.randomUUID() };
    expect(paymentClaimSchema.safeParse(report).success).toBe(false);
    expect(paymentClaimSchema.safeParse({ ...report, amount: 12.34 }).success).toBe(true);
    expect(paymentClaimSchema.safeParse({ ...report, amount: 12.34, idempotencyKey: undefined }).success).toBe(false);
  });

  it('does not turn a tenant claim into collected rent without verification basis', async () => {
    const payment = { _id: new Types.ObjectId(), organizationId: new Types.ObjectId(), tenantId: new Types.ObjectId(), propertyId: new Types.ObjectId(), buildingId: new Types.ObjectId(), unitId: new Types.ObjectId(), source: 'TENANT_CLAIM', status: 'PENDING' };
    vi.spyOn(mongoose, 'startSession').mockResolvedValue({ withTransaction: async (callback: () => Promise<unknown>) => callback(), endSession: vi.fn() } as never);
    vi.spyOn(Payment, 'findById').mockReturnValue({ session: async () => payment } as never);
    vi.spyOn(Tenant, 'findById').mockReturnValue({ session: () => ({ lean: async () => ({ userId: new Types.ObjectId() }) }) } as never);
    vi.spyOn(ResourceScopeService, 'assertUnit').mockImplementation(() => undefined);
    const allocations = vi.spyOn(PaymentAllocation, 'create');
    await expect(FinanceService.confirmPayment({ userId: new Types.ObjectId() } as AuthenticatedUser, String(payment._id), { allocations: [{ rentChargeId: String(new Types.ObjectId()), amount: 100 }] })).rejects.toMatchObject({ code: 'VERIFICATION_BASIS_REQUIRED' });
    expect(allocations).not.toHaveBeenCalled();
  });

  it('never manually confirms a provider initiation', async () => {
    const payment = { _id: new Types.ObjectId(), organizationId: new Types.ObjectId(), tenantId: new Types.ObjectId(), propertyId: new Types.ObjectId(), buildingId: new Types.ObjectId(), unitId: new Types.ObjectId(), source: 'PROVIDER_INITIATION', status: 'PENDING' };
    vi.spyOn(mongoose, 'startSession').mockResolvedValue({ withTransaction: async (callback: () => Promise<unknown>) => callback(), endSession: vi.fn() } as never);
    vi.spyOn(Payment, 'findById').mockReturnValue({ session: async () => payment } as never);
    vi.spyOn(Tenant, 'findById').mockReturnValue({ session: () => ({ lean: async () => ({ userId: new Types.ObjectId() }) }) } as never);
    vi.spyOn(ResourceScopeService, 'assertUnit').mockImplementation(() => undefined);
    await expect(FinanceService.confirmPayment({ userId: new Types.ObjectId() } as AuthenticatedUser, String(payment._id), { allocations: [{ rentChargeId: String(new Types.ObjectId()), amount: 100 }], verification: { checkedReceivingAccount: true, basis: 'Bank statement checked' } })).rejects.toMatchObject({ code: 'PROVIDER_CONFIRMATION_REQUIRED' });
  });
});
