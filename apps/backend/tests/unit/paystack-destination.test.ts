import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { AuthorizationService } from '../../src/core/authorization/authorization.service.js';
import { PaystackProvider } from '../../src/core/integrations/paystack.provider.js';
import { PaymentDestination } from '../../src/database/models/PaymentDestination.js';
import { Organization } from '../../src/database/models/Organization.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { FinanceService } from '../../src/modules/finance/finance.service.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

afterEach(() => vi.restoreAllMocks());

const orgId = new Types.ObjectId();
const auth = { userId: new Types.ObjectId(), isPlatformAdmin: true, memberships: [] } as AuthenticatedUser;
const subaccount = {
  subaccount_code: 'ACCT_123abc', business_name: 'Test owner', account_number: '1234567890',
  settlement_bank: '044', currency: 'KES', active: true, is_verified: false,
};

describe('Paystack rent settlement destinations', () => {
  it('keeps a newly created unverified subaccount pending', async () => {
    vi.spyOn(AuthorizationService, 'assertPermission').mockImplementation(() => undefined);
    vi.spyOn(Organization, 'findById').mockReturnValue({ select: () => ({ lean: async () => ({ regionalProfile: { countryCode: 'KE', baseCurrency: 'KES', allowedCurrencies: ['KES'] } }) }) } as never);
    vi.spyOn(PaystackProvider.prototype, 'createSubaccount').mockResolvedValue(subaccount);
    const create = vi.spyOn(PaymentDestination, 'create').mockResolvedValue({ _id: new Types.ObjectId(), save: vi.fn() } as never);
    vi.spyOn(AuditService, 'record').mockResolvedValue({} as never);

    await FinanceService.createPaymentDestination(auth, String(orgId), {
      provider: 'PAYSTACK', label: 'Rent', isDefault: false, country: 'KE', currency: 'KES',
      businessName: 'Test owner', bankCode: '044', accountNumber: '1234567890', percentageCharge: 0,
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING_PROVIDER_SETUP' }));
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('providerVerifiedAt');
  });

  it('activates only after provider verification, and returns to pending if verification is lost', async () => {
    vi.spyOn(AuthorizationService, 'assertPermission').mockImplementation(() => undefined);
    vi.spyOn(AuditService, 'record').mockResolvedValue({} as never);
    const destination = {
      _id: new Types.ObjectId(), organizationId: orgId, provider: 'PAYSTACK', status: 'PENDING_PROVIDER_SETUP',
      paystackSubaccountCode: subaccount.subaccount_code, accountNumberLast4: '7890', currency: 'KES',
      providerVerifiedAt: undefined as Date | undefined, updatedBy: auth.userId, save: vi.fn(),
    };
    vi.spyOn(PaymentDestination, 'findById').mockResolvedValue(destination as never);
    const getSubaccount = vi.spyOn(PaystackProvider.prototype, 'getSubaccount').mockResolvedValue({ ...subaccount, is_verified: true });

    await FinanceService.refreshPaystackDestination(auth, String(destination._id));
    expect(destination.status).toBe('ACTIVE');
    expect(destination.providerVerifiedAt).toBeInstanceOf(Date);
    getSubaccount.mockResolvedValue(subaccount);
    await FinanceService.refreshPaystackDestination(auth, String(destination._id));
    expect(destination.status).toBe('PENDING_PROVIDER_SETUP');
    expect(destination.providerVerifiedAt).toBeUndefined();
  });

  it('does not activate a mismatched or disabled destination', async () => {
    vi.spyOn(AuthorizationService, 'assertPermission').mockImplementation(() => undefined);
    const destination = {
      _id: new Types.ObjectId(), organizationId: orgId, provider: 'PAYSTACK', status: 'PENDING_PROVIDER_SETUP',
      paystackSubaccountCode: subaccount.subaccount_code, accountNumberLast4: '7890', currency: 'KES', save: vi.fn(),
    };
    vi.spyOn(PaymentDestination, 'findById').mockResolvedValue(destination as never);
    vi.spyOn(PaystackProvider.prototype, 'getSubaccount').mockResolvedValue({ ...subaccount, account_number: '9999999999', is_verified: true });
    await expect(FinanceService.refreshPaystackDestination(auth, String(destination._id))).rejects.toMatchObject({ code: 'PAYSTACK_SUBACCOUNT_MISMATCH' });
    expect(destination.save).not.toHaveBeenCalled();
    destination.status = 'DISABLED';
    await expect(FinanceService.refreshPaystackDestination(auth, String(destination._id))).rejects.toMatchObject({ code: 'PAYSTACK_DESTINATION_UNAVAILABLE' });
  });

  it('requires organization permission before contacting Paystack', async () => {
    vi.spyOn(AuthorizationService, 'assertPermission').mockImplementation(() => { throw new Error('FORBIDDEN'); });
    vi.spyOn(PaymentDestination, 'findById').mockResolvedValue({ organizationId: orgId } as never);
    const getSubaccount = vi.spyOn(PaystackProvider.prototype, 'getSubaccount');
    await expect(FinanceService.refreshPaystackDestination(auth, String(new Types.ObjectId()))).rejects.toThrow('FORBIDDEN');
    expect(getSubaccount).not.toHaveBeenCalled();
  });
});
