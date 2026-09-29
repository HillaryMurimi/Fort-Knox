import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { Payment } from '../../src/database/models/Payment.js';
import { Organization } from '../../src/database/models/Organization.js';
import { RentCharge } from '../../src/database/models/RentCharge.js';
import { PaymentDestination } from '../../src/database/models/PaymentDestination.js';
import { IntegrationAttempt } from '../../src/database/models/IntegrationAttempt.js';
import { Tenant } from '../../src/database/models/Tenant.js';
import { User } from '../../src/database/models/User.js';
import { Job } from '../../src/database/models/Job.js';
import { IntegrationDispatcher } from '../../src/core/integrations/dispatcher.js';
import { integrationConfig } from '../../src/core/integrations/config.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { IntegrationService } from '../../src/modules/integrations/integration.service.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

const paystackEnabled = integrationConfig.paystack.enabled;
afterEach(() => { vi.restoreAllMocks(); integrationConfig.paystack.enabled = paystackEnabled; });

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
  vi.spyOn(User, 'findById').mockReturnValue({ select: () => ({ lean: async () => ({ email: 'tenant@example.com' }) }) } as never);
  return { auth, payment };
}

describe('operational payment rail initiation', () => {
  it('rejects an unsupported organization region before contacting a provider', async () => {
    const { auth, payment } = fixture('GH', 'GHS');
    const provider = vi.spyOn(IntegrationDispatcher, 'payment');
    const attempt = vi.spyOn(IntegrationAttempt, 'create');
    await expect(IntegrationService.initiatePayment(auth, String(payment._id), 'PAYSTACK')).rejects.toMatchObject({ code: 'PAYMENT_RAIL_UNAVAILABLE' });
    expect(provider).not.toHaveBeenCalled();
    expect(attempt).not.toHaveBeenCalled();
  });

  it('requires an active default settlement destination before provider submission', async () => {
    const { auth, payment } = fixture();
    vi.spyOn(PaymentDestination, 'findOne').mockReturnValue({ lean: async () => null } as never);
    const provider = vi.spyOn(IntegrationDispatcher, 'payment');
    const attempt = vi.spyOn(IntegrationAttempt, 'create');
    await expect(IntegrationService.initiatePayment(auth, String(payment._id), 'PAYSTACK')).rejects.toMatchObject({ code: 'PAYMENT_DESTINATION_REQUIRED' });
    expect(provider).not.toHaveBeenCalled();
    expect(attempt).not.toHaveBeenCalled();
  });

  it('routes a KES checkout to the configured Paystack subaccount', async () => {
    const { auth, payment } = fixture();
    integrationConfig.paystack.enabled = true;
    const destination = { _id: new Types.ObjectId(), paystackSubaccountCode: 'ACCT_verified' };
    vi.spyOn(PaymentDestination, 'findOne').mockReturnValue({ lean: async () => destination } as never);
    const initiate = vi.fn().mockResolvedValue({ provider: 'PAYSTACK', providerTransactionId: 'rent-ref', status: 'PENDING', checkoutUrl: 'https://checkout.example.com' });
    vi.spyOn(IntegrationDispatcher, 'payment').mockReturnValue({ key: 'PAYSTACK', initiate, query: vi.fn() } as never);
    vi.spyOn(IntegrationAttempt, 'create').mockResolvedValue({ status: 'STARTED', createdAt: new Date(), save: vi.fn() } as never);
    vi.spyOn(Job, 'findOneAndUpdate').mockResolvedValue({} as never);
    vi.spyOn(AuditService, 'record').mockResolvedValue({} as never);

    await IntegrationService.initiatePayment(auth, String(payment._id), 'PAYSTACK');
    expect(initiate).toHaveBeenCalledWith(expect.objectContaining({
      currency: 'KES', paystackSubaccountCode: 'ACCT_verified', metadata: { paymentDestinationId: String(destination._id) },
    }));
    expect(payment.save).toHaveBeenCalledOnce();
  });
});
