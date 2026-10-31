import { describe, expect, it } from 'vitest';
import { calculateIncomeValuation, calculateInvestmentMetrics, calculateUnleveredDcf } from '../../src/modules/decision-automation/investment-scenario.js';

const income = {
  annualStabilizedNoiMinor: 240_000_000,
  noiSource: 'Owner scenario: annual stabilized NOI',
  assumedCapRateBps: 800,
  capRateSource: 'Owner-selected market assumption',
  asOfDate: '2026-10-28',
  currency: 'KES' as const,
};

const dcf = {
  annualUnleveredCashFlowsMinor: [100_000_000, 100_000_000],
  cashFlowSource: 'Owner scenario: unlevered cash flows',
  terminalNetProceedsMinor: 1_000_000_000,
  terminalProceedsSource: 'Owner scenario: net exit proceeds',
  discountRateBps: 1_000,
  discountRateBasis: 'UNLEVERED_PROPERTY' as const,
  asOfDate: '2026-10-28',
  currency: 'KES' as const,
};

const metrics = {
  propertyValueMinor: 3_000_000_000,
  valueBasis: 'Owner-entered scenario value',
  asOfDate: '2026-10-28',
  currency: 'KES' as const,
};

describe('user-defined investment scenario kernel', () => {
  it('calculates income capitalization and independent cap-rate sensitivity in cents', () => {
    const result = calculateIncomeValuation({ ...income, sensitivityCapRatesBps: [600, 800, 1000] });
    expect(result.valueMinor).toBe(3_000_000_000);
    expect(result.sensitivity.map(row => row.valueMinor)).toEqual([4_000_000_000, 3_000_000_000, 2_400_000_000]);
    expect(result.validation).toBe('ILLUSTRATIVE_NOT_SOURCE_BACKED');
  });

  it('does not give a positive valuation for zero or negative NOI', () => {
    expect(calculateIncomeValuation({ ...income, annualStabilizedNoiMinor: 0 }).valueMinor).toBeNull();
    expect(calculateIncomeValuation({ ...income, annualStabilizedNoiMinor: -1 }).valueMinor).toBeNull();
  });

  it('rejects absent or invalid cap rates, unsupported currency, and impossible dates', () => {
    expect(() => calculateIncomeValuation({ ...income, assumedCapRateBps: 0 })).toThrow();
    expect(() => calculateIncomeValuation({ ...income, capRateSource: '' })).toThrow();
    expect(() => calculateIncomeValuation({ ...income, currency: 'USD' as never })).toThrow();
    expect(() => calculateIncomeValuation({ ...income, asOfDate: '2026-02-30' })).toThrow();
  });

  it('rejects cap valuations beyond safe minor-unit precision', () => {
    expect(() => calculateIncomeValuation({ ...income, annualStabilizedNoiMinor: Number.MAX_SAFE_INTEGER, assumedCapRateBps: 1 })).toThrowError(/safe integer/);
  });

  it('discounts each unlevered year-end flow and counts terminal proceeds once', () => {
    const result = calculateUnleveredDcf(dcf);
    expect(result.years).toEqual([
      { year: 1, cashFlowMinor: 100_000_000, terminalNetProceedsMinor: 0, presentValueMinor: 90_909_091 },
      { year: 2, cashFlowMinor: 100_000_000, terminalNetProceedsMinor: 1_000_000_000, presentValueMinor: 909_090_909 },
    ]);
    expect(result.valueMinor).toBe(1_000_000_000);
    expect(result.method).toBe('UNLEVERED_DCF');
  });

  it('handles negative annual cash flow and a zero-discount scenario', () => {
    const result = calculateUnleveredDcf({ ...dcf, annualUnleveredCashFlowsMinor: [-100_000_000], terminalNetProceedsMinor: 0, discountRateBps: 0 });
    expect(result.valueMinor).toBe(-100_000_000);
  });

  it('rejects DCF period, amount, and discount-basis violations', () => {
    expect(() => calculateUnleveredDcf({ ...dcf, annualUnleveredCashFlowsMinor: [] })).toThrow();
    expect(() => calculateUnleveredDcf({ ...dcf, annualUnleveredCashFlowsMinor: Array(6).fill(1) })).toThrow();
    expect(() => calculateUnleveredDcf({ ...dcf, discountRateBasis: 'EQUITY' as never })).toThrow();
    expect(() => calculateUnleveredDcf({ ...dcf, terminalNetProceedsMinor: -1 })).toThrow();
  });

  it('reports requested yields and financing ratios in basis points', () => {
    const result = calculateInvestmentMetrics({ ...metrics, annualGrossRentalIncomeMinor: 300_000_000, annualStabilizedNoiMinor: 240_000_000,
      annualPreTaxCashFlowMinor: 90_000_000, cashInvestedMinor: 1_500_000_000,
      propertyDebtBalanceMinor: 1_200_000_000, annualDebtServiceMinor: 120_000_000 });
    expect(result).toMatchObject({ grossRentalYieldBps: 1000, impliedCapRateBps: 800,
      cashOnCashBps: 600, loanToValueBps: 4000, debtServiceCoverageBps: 20_000 });
  });

  it('does not attribute all property value or debt to a half owner', () => {
    const result = calculateInvestmentMetrics({ ...metrics, ownershipBps: 5_000, propertyDebtBalanceMinor: 1_200_000_000, attributableSecuredDebtMinor: 600_000_000 });
    expect(result.ownershipAdjustedValueMinor).toBe(1_500_000_000);
    expect(result.attributableEquityMinor).toBe(900_000_000);
    expect(result.loanToValueBps).toBe(4_000);
  });

  it('marks missing inputs and zero denominators unavailable, not zero', () => {
    const empty = calculateInvestmentMetrics(metrics);
    expect(empty.grossRentalYieldBps).toBeNull();
    expect(empty.impliedCapRateBps).toBeNull();
    expect(empty.attributableEquityMinor).toBeNull();
    const zero = calculateInvestmentMetrics({ ...metrics, propertyValueMinor: 0, annualGrossRentalIncomeMinor: 100, cashInvestedMinor: 0, annualPreTaxCashFlowMinor: 10, annualDebtServiceMinor: 0, annualStabilizedNoiMinor: 10 });
    expect(zero.grossRentalYieldBps).toBeNull();
    expect(zero.cashOnCashBps).toBeNull();
    expect(zero.debtServiceCoverageBps).toBeNull();
  });

  it('rejects unsafe financial inputs and invalid ownership shares', () => {
    expect(() => calculateInvestmentMetrics({ ...metrics, propertyValueMinor: Number.MAX_SAFE_INTEGER + 1 })).toThrow();
    expect(() => calculateInvestmentMetrics({ ...metrics, ownershipBps: 10_001 })).toThrow();
  });
});
