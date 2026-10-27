import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { AuthorizationService } from '../../src/core/authorization/authorization.service.js';
import { PaystackProvider } from '../../src/core/integrations/paystack.provider.js';
import { PaymentDestination } from '../../src/database/models/PaymentDestination.js';
import { Organization } from '../../src/database/models/Organization.js';
import { FinanceService } from '../../src/modules/finance/finance.service.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

afterEach(() => vi.restoreAllMocks());

const orgId = new Types.ObjectId();
const auth = { userId: new Types.ObjectId(), isPlatformAdmin: true, memberships: [] } as AuthenticatedUser;

describe('Paystack rent compliance boundary', () => {
  it('rejects new rent subaccounts without contacting Paystack or writing a destination', async () => {
    vi.spyOn(Organization, 'findById').mockReturnValue({ select: () => ({ lean: async () => ({ regionalProfile: { countryCode: 'KE', baseCurrency: 'KES', allowedCurrencies: ['KES'] } }) }) } as never);
    const createSubaccount = vi.spyOn(PaystackProvider.prototype, 'createSubaccount');
    const create = vi.spyOn(PaymentDestination, 'create');
    await expect(FinanceService.createPaymentDestination(auth, String(orgId), {
      provider: 'PAYSTACK', label: 'Rent', isDefault: false, country: 'KE', currency: 'KES',
      businessName: 'Test owner', bankCode: '044', accountNumber: '1234567890', percentageCharge: 0,
    })).rejects.toMatchObject({ code: 'RENT_PAYSTACK_NOT_APPROVED' });
    expect(createSubaccount).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('cannot reactivate a legacy subaccount by refreshing provider status', async () => {
    const destination = { _id: new Types.ObjectId(), organizationId: orgId, provider: 'PAYSTACK', status: 'ACTIVE', save: vi.fn() };
    vi.spyOn(PaymentDestination, 'findById').mockResolvedValue(destination as never);
    const getSubaccount = vi.spyOn(PaystackProvider.prototype, 'getSubaccount');
    await expect(FinanceService.refreshPaystackDestination(auth, String(destination._id))).rejects.toMatchObject({ code: 'RENT_PAYSTACK_NOT_APPROVED' });
    expect(getSubaccount).not.toHaveBeenCalled();
    expect(destination.save).not.toHaveBeenCalled();
  });

  it('requires organization permission before returning even the compliance rejection', async () => {
    vi.spyOn(AuthorizationService, 'assertPermission').mockImplementation(() => { throw new Error('FORBIDDEN'); });
    vi.spyOn(PaymentDestination, 'findById').mockResolvedValue({ organizationId: orgId } as never);
    const getSubaccount = vi.spyOn(PaystackProvider.prototype, 'getSubaccount');
    await expect(FinanceService.refreshPaystackDestination(auth, String(new Types.ObjectId()))).rejects.toThrow('FORBIDDEN');
    expect(getSubaccount).not.toHaveBeenCalled();
  });
});
