import { describe, expect, it } from 'vitest';
import { calculateFinancialScenario, type FinancialScenarioInput } from '../../src/modules/decision-automation/financial-scenario.js';

const base: FinancialScenarioInput = {
  startMonth: '2027-01', horizonMonths: 60,
  unitMonthlyRentsMinor: Array(50).fill(2_000_000),
  occupancyBps: 5_000, collectionBps: 10_000, annualRentChangeBps: 0, currency: 'KES',
};

describe('user-defined financial scenario', () => {
  it('reproduces the 50-unit five-year occupancy illustration without calling it profit', () => {
    const result = calculateFinancialScenario(base);
    expect(result.months).toHaveLength(60);
    expect(result.months[0]).toMatchObject({ period: '2027-01', grossPotentialMinor: 100_000_000,
      scheduledRentMinor: 50_000_000, illustrativeCollectionsMinor: 50_000_000, vacancyOpportunityMinor: 50_000_000 });
    expect(result.totals.scheduledRentMinor).toBe(3_000_000_000);
    expect(result.annual).toHaveLength(5);
    expect(result.noiMinor).toBeNull();
    expect(result.cashFlowMinor).toBeNull();
    expect(result.validation).toBe('ILLUSTRATIVE_NOT_SOURCE_BACKED');
  });

  it('uses unit-level asking rent and keeps collection efficiency distinct from occupancy', () => {
    const result = calculateFinancialScenario({ ...base, horizonMonths: 1,
      unitMonthlyRentsMinor: [1_000_000, 2_000_000], occupancyBps: 7_500, collectionBps: 8_000 });
    expect(result.months[0]).toMatchObject({ grossPotentialMinor: 3_000_000,
      scheduledRentMinor: 2_250_000, illustrativeCollectionsMinor: 1_800_000, vacancyOpportunityMinor: 750_000 });
  });

  it('applies rent changes only at the start of each scenario year', () => {
    const input = { ...base, horizonMonths: 24 as const, unitMonthlyRentsMinor: [1_000_000], annualRentChangeBps: 500 };
    const increase = calculateFinancialScenario(input);
    expect(increase.months[11]?.grossPotentialMinor).toBe(1_000_000);
    expect(increase.months[12]?.grossPotentialMinor).toBe(1_050_000);
    const decrease = calculateFinancialScenario({ ...input, annualRentChangeBps: -500 });
    expect(decrease.months[12]?.grossPotentialMinor).toBe(950_000);
    expect(input.unitMonthlyRentsMinor).toEqual([1_000_000]);
  });

  it('supports zero units, zero occupancy, and partial calendar years', () => {
    const empty = calculateFinancialScenario({ ...base, startMonth: '2027-11', horizonMonths: 3,
      unitMonthlyRentsMinor: [], occupancyBps: 0, collectionBps: 0 });
    expect(empty.totals.scheduledRentMinor).toBe(0);
    expect(empty.annual.map(row => [row.year, row.months])).toEqual([['2027', 2], ['2028', 1]]);
  });

  it('rejects unsupported horizons, unsafe amounts, and accumulated overflow', () => {
    expect(() => calculateFinancialScenario({ ...base, horizonMonths: 7 as never })).toThrow();
    expect(() => calculateFinancialScenario({ ...base, unitMonthlyRentsMinor: [Number.MAX_SAFE_INTEGER + 1] })).toThrow();
    expect(() => calculateFinancialScenario({ ...base, unitMonthlyRentsMinor: [Number.MAX_SAFE_INTEGER] })).toThrow();
  });
});
