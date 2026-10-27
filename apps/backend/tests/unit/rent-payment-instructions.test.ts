import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { Tenancy } from '../../src/database/models/Tenancy.js';
import { Tenant } from '../../src/database/models/Tenant.js';
import { PaymentDestination } from '../../src/database/models/PaymentDestination.js';
import { Organization } from '../../src/database/models/Organization.js';
import { Property } from '../../src/database/models/Property.js';
import { ResourceScopeService } from '../../src/core/authorization/resource-scope.service.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { FinanceService } from '../../src/modules/finance/finance.service.js';
import { integrationConfig } from '../../src/core/integrations/config.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

const initialMpesa = { ...integrationConfig.mpesa };
afterEach(() => { vi.restoreAllMocks(); Object.assign(integrationConfig.mpesa, initialMpesa); });

const organizationId = new Types.ObjectId();
const propertyId = new Types.ObjectId();
const tenancy = { _id: new Types.ObjectId(), organizationId, propertyId, buildingId: new Types.ObjectId(), unitId: new Types.ObjectId(), tenantId: new Types.ObjectId(), leaseNumber: 'LEASE-7', status: 'ACTIVE' };
const auth = { userId: new Types.ObjectId(), isPlatformAdmin: true, memberships: [] } as AuthenticatedUser;

function tenancyFixture() {
  vi.spyOn(Tenancy, 'findById').mockResolvedValue(tenancy as never);
  vi.spyOn(Tenant, 'findById').mockReturnValue({ lean: async () => ({ userId: auth.userId }) } as never);
  vi.spyOn(ResourceScopeService, 'assertUnit').mockImplementation(() => undefined);
}

describe('tenant rent payment instructions', () => {
  it('prefers the own-property PayBill and expands only the own lease reference', async () => {
    tenancyFixture();
    const own = { _id: new Types.ObjectId(), provider: 'MPESA', label: 'Property paybill', currency: 'KES', mpesaShortCode: '123456', mpesaBusinessType: 'PAYBILL', mpesaAccountReference: '{{leaseNumber}}' };
    const find = vi.spyOn(PaymentDestination, 'findOne').mockReturnValue({ lean: async () => own } as never);
    const result = await FinanceService.tenancyPaymentInstructions(auth, String(tenancy._id));
    expect(result.methods[0]).toMatchObject({shortCode:'123456',accountReference:'LEASE-7',verification:'OWNER_ATTESTED',canInitiateStk:false});
    expect(find).toHaveBeenCalledWith(expect.objectContaining({organizationId,propertyId,ownerAttestedAt:{$exists:true}}));
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('uses only the organization default if there is no property override', async () => {
    tenancyFixture();
    const find = vi.spyOn(PaymentDestination, 'findOne').mockReturnValueOnce({ lean: async () => null } as never)
      .mockReturnValueOnce({ lean: async () => ({_id:new Types.ObjectId(),provider:'MPESA',label:'Default',currency:'KES',mpesaShortCode:'654321',mpesaBusinessType:'TILL'}) } as never);
    const result = await FinanceService.tenancyPaymentInstructions(auth, String(tenancy._id));
    expect(result.methods[0]).toMatchObject({shortCode:'654321',businessType:'TILL',canInitiateStk:false});
    expect(find).toHaveBeenNthCalledWith(2,expect.objectContaining({organizationId,isDefault:true,propertyId:{$exists:false}}));
  });

  it('shows no legacy or unattested destination', async () => {
    tenancyFixture();
    vi.spyOn(PaymentDestination, 'findOne').mockReturnValue({ lean: async () => null } as never);
    await expect(FinanceService.tenancyPaymentInstructions(auth,String(tenancy._id))).resolves.toEqual({methods:[]});
  });

  it('does not query destinations if tenancy scope is denied', async () => {
    tenancyFixture();
    vi.spyOn(ResourceScopeService, 'assertUnit').mockImplementation(() => {throw new Error('FORBIDDEN');});
    const find = vi.spyOn(PaymentDestination, 'findOne');
    await expect(FinanceService.tenancyPaymentInstructions(auth,String(tenancy._id))).rejects.toThrow('FORBIDDEN');
    expect(find).not.toHaveBeenCalled();
  });

  it('enforces real tenant ownership and organization scope before revealing instructions', async () => {
    vi.spyOn(Tenancy, 'findById').mockResolvedValue(tenancy as never);
    const otherUserId = new Types.ObjectId();
    vi.spyOn(Tenant, 'findById').mockReturnValue({ lean: async () => ({ userId: otherUserId }) } as never);
    const tenantAuth: AuthenticatedUser = {
      userId: auth.userId,
      isPlatformAdmin: false,
      memberships: [{ organizationId, roleIds: [], roles: ['TENANT'], permissions: ['rent.view'],
        scope: { allProperties: false, propertyIds: [], buildingIds: [], unitIds: [tenancy.unitId] } }],
    };
    const find = vi.spyOn(PaymentDestination, 'findOne');
    await expect(FinanceService.tenancyPaymentInstructions(tenantAuth, String(tenancy._id))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(find).not.toHaveBeenCalled();
    tenantAuth.memberships = [];
    await expect(FinanceService.tenancyPaymentInstructions(tenantAuth, String(tenancy._id))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(find).not.toHaveBeenCalled();
  });

  it('rejects an out-of-scope property before storing owner-attested details', async () => {
    vi.spyOn(Organization, 'findById').mockReturnValue({select:()=>({lean:async()=>({regionalProfile:{countryCode:'KE',baseCurrency:'KES',allowedCurrencies:['KES']}})})} as never);
    vi.spyOn(Property, 'findOne').mockResolvedValue({_id:propertyId,organizationId} as never);
    vi.spyOn(ResourceScopeService, 'assertProperty').mockRejectedValue(new Error('FORBIDDEN'));
    const create = vi.spyOn(PaymentDestination, 'create');
    await expect(FinanceService.createPaymentDestination(auth,String(organizationId),{
      provider:'MPESA',label:'Property PayBill',shortCode:'123456',businessType:'PAYBILL',ownershipAttested:true,
      accountReference:'{{leaseNumber}}',propertyId:String(propertyId),isDefault:false,country:'KE',currency:'KES',
    })).rejects.toThrow('FORBIDDEN');
    expect(create).not.toHaveBeenCalled();
  });

  it('stores a new PayBill as owner-attested, never provider-verified', async () => {
    vi.spyOn(Organization, 'findById').mockReturnValue({select:()=>({lean:async()=>({regionalProfile:{countryCode:'KE',baseCurrency:'KES',allowedCurrencies:['KES']}})})} as never);
    const create = vi.spyOn(PaymentDestination, 'create').mockResolvedValue({_id:new Types.ObjectId(),save:vi.fn()} as never);
    vi.spyOn(AuditService, 'record').mockResolvedValue({} as never);
    await FinanceService.createPaymentDestination(auth,String(organizationId),{
      provider:'MPESA',label:'PayBill',shortCode:'123456',businessType:'PAYBILL',ownershipAttested:true,
      accountReference:'{{leaseNumber}}',isDefault:false,country:'KE',currency:'KES',
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({status:'ACTIVE',mpesaBusinessType:'PAYBILL',ownerAttestedAt:expect.any(Date)}));
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('providerVerifiedAt');
  });
});
