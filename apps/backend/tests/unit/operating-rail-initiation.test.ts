import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { Payment } from '../../src/database/models/Payment.js';
import { Organization } from '../../src/database/models/Organization.js';
import { RentCharge } from '../../src/database/models/RentCharge.js';
import { PaymentDestination } from '../../src/database/models/PaymentDestination.js';
import { IntegrationAttempt } from '../../src/database/models/IntegrationAttempt.js';
import { Tenant } from '../../src/database/models/Tenant.js';
import { Tenancy } from '../../src/database/models/Tenancy.js';
import { User } from '../../src/database/models/User.js';
import { Job } from '../../src/database/models/Job.js';
import { IntegrationDispatcher } from '../../src/core/integrations/dispatcher.js';
import { integrationConfig } from '../../src/core/integrations/config.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { IntegrationService } from '../../src/modules/integrations/integration.service.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

const initialMpesa = { ...integrationConfig.mpesa };
afterEach(() => { vi.restoreAllMocks(); Object.assign(integrationConfig.mpesa, initialMpesa); });

function fixture(countryCode = 'KE', baseCurrency = 'KES') {
  const organizationId = new Types.ObjectId();
  const tenantId = new Types.ObjectId();
  const payment = { _id: new Types.ObjectId(), organizationId, tenantId, tenancyId: new Types.ObjectId(),
    propertyId: new Types.ObjectId(), buildingId: new Types.ObjectId(), unitId: new Types.ObjectId(),
    amount: 100, currency: 'KES', status: 'PENDING', providerTransactionId: undefined,
    metadata: new Map<string, unknown>(), save: vi.fn() };
  const auth: AuthenticatedUser = { userId: new Types.ObjectId(), isPlatformAdmin: true, memberships: [] };
  vi.spyOn(Payment, 'findOne').mockResolvedValue(payment as never);
  vi.spyOn(Organization, 'findById').mockReturnValue({ select: () => ({ lean: async () => ({ regionalProfile: { countryCode, baseCurrency, allowedCurrencies: [baseCurrency] } }) }) } as never);
  vi.spyOn(RentCharge, 'find').mockReturnValue({ select: () => ({ lean: async () => [{ balanceAmount: 100 }] }) } as never);
  vi.spyOn(Tenant, 'findById').mockReturnValue({ select: () => ({ lean: async () => ({ userId: new Types.ObjectId() }) }) } as never);
  vi.spyOn(User, 'findById').mockReturnValue({ select: () => ({ lean: async () => ({ phone: '+254712345678' }) }) } as never);
  return { auth, payment };
}

function authorizeMpesa(organizationId: Types.ObjectId) {
  integrationConfig.mpesa.enabled = true;
  integrationConfig.mpesa.rentOrganizationId = String(organizationId);
  integrationConfig.mpesa.shortCode = '123456';
}

describe('operational payment rail initiation', () => {
  it('blocks Paystack rent checkout before contacting the provider, even with a legacy destination', async () => {
    const { auth, payment } = fixture();
    const provider = vi.spyOn(IntegrationDispatcher, 'payment');
    const destination = vi.spyOn(PaymentDestination, 'findOne');
    await expect(IntegrationService.initiatePayment(auth, String(payment._id), 'PAYSTACK')).rejects.toMatchObject({ code: 'RENT_PAYSTACK_NOT_APPROVED' });
    expect(provider).not.toHaveBeenCalled();
    expect(destination).not.toHaveBeenCalled();
  });

  it('blocks M-Pesa rent checkout without an organization-owned credential binding', async () => {
    const { auth, payment } = fixture();
    const provider = vi.spyOn(IntegrationDispatcher, 'payment');
    await expect(IntegrationService.initiatePayment(auth, String(payment._id), 'MPESA')).rejects.toMatchObject({ code: 'RENT_MPESA_NOT_AUTHORIZED' });
    expect(provider).not.toHaveBeenCalled();
  });

  it('rejects an unsupported region before contacting a provider', async () => {
    const { auth, payment } = fixture('GH', 'GHS');
    authorizeMpesa(payment.organizationId);
    const provider = vi.spyOn(IntegrationDispatcher, 'payment');
    await expect(IntegrationService.initiatePayment(auth, String(payment._id), 'MPESA')).rejects.toMatchObject({ code: 'PAYMENT_RAIL_UNAVAILABLE' });
    expect(provider).not.toHaveBeenCalled();
  });

  it('requires an attested destination before STK submission', async () => {
    const { auth, payment } = fixture();
    authorizeMpesa(payment.organizationId);
    const findDestination = vi.spyOn(PaymentDestination, 'findOne').mockReturnValue({ lean: async () => null } as never);
    const provider = vi.spyOn(IntegrationDispatcher, 'payment');
    await expect(IntegrationService.initiatePayment(auth, String(payment._id), 'MPESA')).rejects.toMatchObject({ code: 'PAYMENT_DESTINATION_REQUIRED' });
    expect(findDestination).toHaveBeenCalledWith(expect.objectContaining({ ownerAttestedAt: { $exists: true } }));
    expect(provider).not.toHaveBeenCalled();
  });

  it('routes STK only to a matching landlord PayBill', async () => {
    const { auth, payment } = fixture();
    authorizeMpesa(payment.organizationId);
    const destination = { _id: new Types.ObjectId(), mpesaShortCode: '123456', mpesaBusinessType: 'PAYBILL', mpesaAccountReference: '{{leaseNumber}}' };
    vi.spyOn(PaymentDestination, 'findOne').mockReturnValue({ lean: async () => destination } as never);
    vi.spyOn(Tenancy, 'findOne').mockReturnValue({ select: () => ({ lean: async () => ({ leaseNumber: 'A123' }) }) } as never);
    const initiate = vi.fn().mockResolvedValue({ provider: 'MPESA', providerTransactionId: 'checkout-1', status: 'PENDING' });
    vi.spyOn(IntegrationDispatcher, 'payment').mockReturnValue({ key: 'MPESA', initiate, query: vi.fn() } as never);
    vi.spyOn(IntegrationAttempt, 'create').mockResolvedValue({ status: 'STARTED', createdAt: new Date(), save: vi.fn() } as never);
    vi.spyOn(Job, 'findOneAndUpdate').mockResolvedValue({} as never);
    vi.spyOn(AuditService, 'record').mockResolvedValue({} as never);
    await IntegrationService.initiatePayment(auth, String(payment._id), 'MPESA');
    expect(initiate).toHaveBeenCalledWith(expect.objectContaining({ currency: 'KES', phone: '+254712345678', reference: 'A123', metadata: { paymentDestinationId: String(destination._id) } }));
    expect(payment.save).toHaveBeenCalledOnce();
  });

  it('does not submit STK when the resolved reference exceeds Safaricom limits', async () => {
    const { auth, payment } = fixture();
    authorizeMpesa(payment.organizationId);
    vi.spyOn(PaymentDestination, 'findOne').mockReturnValue({ lean: async () => ({ mpesaShortCode: '123456', mpesaBusinessType: 'PAYBILL', mpesaAccountReference: '{{leaseNumber}}' }) } as never);
    vi.spyOn(Tenancy, 'findOne').mockReturnValue({ select: () => ({ lean: async () => ({ leaseNumber: 'LONGLEASE12345' }) }) } as never);
    const provider = vi.spyOn(IntegrationDispatcher, 'payment');
    await expect(IntegrationService.initiatePayment(auth, String(payment._id), 'MPESA')).rejects.toMatchObject({ code: 'MPESA_STK_REFERENCE_UNAVAILABLE' });
    expect(provider).not.toHaveBeenCalled();
  });
});
