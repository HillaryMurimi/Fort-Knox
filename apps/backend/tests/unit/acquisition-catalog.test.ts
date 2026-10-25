import { afterEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionPlan } from '../../src/database/models/SubscriptionPlan.js';
import { AcquisitionService } from '../../src/modules/sales/acquisition.service.js';

afterEach(() => vi.restoreAllMocks());

describe('public plan catalog', () => {
  it('returns configured pricing and marks an invalid tier unavailable', async () => {
    const find = vi.spyOn(SubscriptionPlan, 'find').mockReturnValue({
      select: () => ({ sort: () => ({ limit: () => ({ lean: async () => [
        { key: 'CONTROL', name: 'Control', amount: 10000, currency: 'KES', billingInterval: 'MONTH', metadata: { pricingModel: 'BASE_PLUS_ACTIVE_UNITS', includedUnits: 50, additionalUnitAmount: 200 }, entitlements: { features: ['finance'] } },
        { key: 'FORT_KNOX', name: 'Fort Knox', amount: 30000, currency: 'KES', billingInterval: 'MONTH', metadata: {}, entitlements: { features: ['finance', 'cctv'] } },
      ] }) }) }),
    } as never);
    const catalog = await AcquisitionService.catalog({ units: '55', months: '3' });
    expect(find).toHaveBeenCalledWith({ key: { $in: ['CONTROL', 'FORT_KNOX'] }, active: true });
    expect(catalog.plans).toMatchObject([{ key: 'CONTROL', pricing: { monthlyMinor: 1100000, totalMinor: 3300000, recurringMinor: 1100000 } }]);
    expect(catalog.unavailablePlans).toEqual([{ key: 'FORT_KNOX', name: 'Fort Knox', reason: 'Pricing is not configured for this plan.' }]);
  });

  it('rejects invalid public unit counts before querying plans', async () => {
    const find = vi.spyOn(SubscriptionPlan, 'find');
    await expect(AcquisitionService.catalog({ units: '100001', months: '3' })).rejects.toThrow();
    expect(find).not.toHaveBeenCalled();
  });

  it.each([
    [50, 1000000, 3000000, 0],
    [55, 1100000, 3150000, 5],
  ])('quotes both configured tiers for %i units', async (units, controlMonthly, fortMonthly, extraUnits) => {
    vi.spyOn(SubscriptionPlan, 'find').mockReturnValue({
      select: () => ({ sort: () => ({ limit: () => ({ lean: async () => [
        { key: 'CONTROL', name: 'Control', amount: 10000, currency: 'KES', billingInterval: 'MONTH', metadata: { pricingModel: 'BASE_PLUS_ACTIVE_UNITS', includedUnits: 50, additionalUnitAmount: 200 }, entitlements: { features: [] } },
        { key: 'FORT_KNOX', name: 'Fort Knox', amount: 30000, currency: 'KES', billingInterval: 'MONTH', metadata: { pricingModel: 'BASE_PLUS_ACTIVE_UNITS', includedUnits: 50, additionalUnitAmount: 300 }, entitlements: { features: [] } },
      ] }) }) }),
    } as never);
    const result = await AcquisitionService.catalog({ units: String(units), months: '3' });
    expect(result.unavailablePlans).toEqual([]);
    expect(result.plans).toMatchObject([
      { key: 'CONTROL', pricing: { includedUnits: 50, extraUnits, additionalUnitMinor: 20000, monthlyMinor: controlMonthly, totalMinor: controlMonthly * 3 } },
      { key: 'FORT_KNOX', pricing: { includedUnits: 50, extraUnits, additionalUnitMinor: 30000, monthlyMinor: fortMonthly, totalMinor: fortMonthly * 3 } },
    ]);
  });

  it('does not advertise or price Fort Knox when it omits a Control entitlement', async () => {
    vi.spyOn(SubscriptionPlan, 'find').mockReturnValue({
      select: () => ({ sort: () => ({ limit: () => ({ lean: async () => [
        { key: 'CONTROL', name: 'Control', amount: 10000, currency: 'KES', billingInterval: 'MONTH', metadata: { pricingModel: 'BASE_PLUS_ACTIVE_UNITS', includedUnits: 50, additionalUnitAmount: 200 }, entitlements: { features: ['finance', 'maintenance'] } },
        { key: 'FORT_KNOX', name: 'Fort Knox', amount: 30000, currency: 'KES', billingInterval: 'MONTH', metadata: { pricingModel: 'BASE_PLUS_ACTIVE_UNITS', includedUnits: 50, additionalUnitAmount: 300 }, entitlements: { features: ['finance', 'security'] } },
      ] }) }) }),
    } as never);
    const result = await AcquisitionService.catalog({ units: '50', months: '3' });
    expect(result.plans.map(plan => plan.key)).toEqual(['CONTROL']);
    expect(result.unavailablePlans).toEqual([{ key: 'FORT_KNOX', name: 'Fort Knox', reason: 'Plan capabilities require administrator review.' }]);
  });
});
