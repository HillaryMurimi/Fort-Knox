import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { compareDigitalTwinScenarios } from '../../src/modules/decision-automation/digital-twin-scenario.js';

const organizationId = String(new Types.ObjectId());
const propertyId = String(new Types.ObjectId());
const base = {
  organizationId, propertyId, inputBasis: 'USER_SUPPLIED_NOT_VERIFIED' as const,
  rentBasisDescription: 'Owner-entered example asking rents',
  baseline: { startMonth: '2027-01', horizonMonths: 12 as const, unitMonthlyRentsMinor: [1_000_000, 2_000_000],
    occupancyBps: 10_000, collectionBps: 8_000, annualRentChangeBps: 0, currency: 'KES' as const },
  variants: [{ key: 'lower_occupancy', label: 'Lower occupancy', occupancyBps: 5_000 }],
};

describe('property digital-twin scenario comparison foundation', () => {
  it('reuses the existing KES scenario engine for aligned monthly and annual comparisons', () => {
    const result = compareDigitalTwinScenarios(base);
    expect(result.baseline.months[0]).toMatchObject({ period: '2027-01', scheduledRentMinor: 3_000_000,
      illustrativeCollectionsMinor: 2_400_000, vacancyOpportunityMinor: 0 });
    expect(result.variants[0]?.months[0]).toMatchObject({ period: '2027-01', scheduledRentMinor: 1_500_000,
      scheduledRentDeltaMinor: -1_500_000, illustrativeCollectionsDeltaMinor: -1_200_000,
      vacancyOpportunityMinor: 1_500_000 });
    expect(result.variants[0]?.deltas.scheduledRentMinor).toBe(-18_000_000);
    expect(result.variants[0]?.annual).toHaveLength(1);
    expect(result.underlyingEngineVersion).toBe('KES_SCENARIO_V1');
  });

  it('keeps collection, rent and occupancy assumptions separate and leaves live metrics unavailable', () => {
    const result = compareDigitalTwinScenarios({ ...base, variants: [
      { key: 'collection', label: 'Better collection', collectionBps: 10_000 },
      { key: 'rent', label: 'Rent change', unitMonthlyRentsMinor: [1_500_000, 2_000_000] },
    ] });
    expect(result.variants[0]?.months[0]).toMatchObject({ scheduledRentDeltaMinor: 0, illustrativeCollectionsDeltaMinor: 600_000 });
    expect(result.variants[1]?.months[0]).toMatchObject({ scheduledRentDeltaMinor: 500_000, illustrativeCollectionsDeltaMinor: 400_000 });
    expect(result.actualCollectionsMinor).toBeNull();
    expect(result.noiMinor).toBeNull();
    expect(result.cashFlowMinor).toBeNull();
    expect(result.modeledValueMinor).toBeNull();
    expect(base.baseline.unitMonthlyRentsMinor).toEqual([1_000_000, 2_000_000]);
  });

  it('rejects duplicate scenario keys, unit-count changes and unsupported currency', () => {
    expect(() => compareDigitalTwinScenarios({ ...base, variants: [base.variants[0], base.variants[0]] })).toThrow();
    expect(() => compareDigitalTwinScenarios({ ...base, variants: [{ key: 'short', label: 'Short', unitMonthlyRentsMinor: [1_000_000] }] })).toThrow();
    expect(() => compareDigitalTwinScenarios({ ...base, baseline: { ...base.baseline, currency: 'USD' as never } })).toThrow();
  });

  it('rejects unsafe amount accumulation rather than emitting imprecise comparisons', () => {
    expect(() => compareDigitalTwinScenarios({ ...base, baseline: { ...base.baseline,
      unitMonthlyRentsMinor: [Number.MAX_SAFE_INTEGER, 1] } })).toThrow();
  });
});
