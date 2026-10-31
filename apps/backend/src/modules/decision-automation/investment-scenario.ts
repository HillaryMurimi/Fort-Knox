import { z } from 'zod';
import { AppError } from '../../core/errors/AppError.js';
import { addMinorUnits } from '../../core/money/legacy-finance.js';

const minor = z.number().int().safe();
const nonnegativeMinor = minor.nonnegative();
const rateBps = z.number().int().min(1).max(10_000);
const source = z.string().trim().min(3).max(240);
const asOfDate = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/)
  .refine(value => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value,
    'Use a valid calendar date');

export const incomeValuationSchema = z.object({
  annualStabilizedNoiMinor: minor,
  noiSource: source,
  assumedCapRateBps: rateBps,
  capRateSource: source,
  sensitivityCapRatesBps: z.array(rateBps).max(12).default([]),
  asOfDate,
  currency: z.literal('KES'),
}).strict();

export const unleveredDcfSchema = z.object({
  annualUnleveredCashFlowsMinor: z.array(minor).min(1).max(5),
  cashFlowSource: source,
  terminalNetProceedsMinor: nonnegativeMinor,
  terminalProceedsSource: source,
  discountRateBps: z.number().int().min(0).max(10_000),
  discountRateBasis: z.literal('UNLEVERED_PROPERTY'),
  asOfDate,
  currency: z.literal('KES'),
}).strict();

export const investmentMetricsSchema = z.object({
  propertyValueMinor: nonnegativeMinor,
  valueBasis: source,
  asOfDate,
  annualGrossRentalIncomeMinor: nonnegativeMinor.optional(),
  annualStabilizedNoiMinor: minor.optional(),
  annualPreTaxCashFlowMinor: minor.optional(),
  cashInvestedMinor: nonnegativeMinor.optional(),
  annualDebtServiceMinor: nonnegativeMinor.optional(),
  propertyDebtBalanceMinor: nonnegativeMinor.optional(),
  ownershipBps: z.number().int().min(0).max(10_000).optional(),
  attributableSecuredDebtMinor: nonnegativeMinor.optional(),
  currency: z.literal('KES'),
}).strict();

function checked(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new AppError(400, 'INVESTMENT_AMOUNT_OVERFLOW', 'Investment scenario amount exceeds the safe integer range');
  }
  return Number(value);
}

function roundedDivide(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n) throw new AppError(400, 'INVALID_INVESTMENT_DENOMINATOR', 'Investment scenario denominator must be positive');
  const magnitude = numerator < 0n ? -numerator : numerator;
  const rounded = (magnitude + denominator / 2n) / denominator;
  return checked(numerator < 0n ? -rounded : rounded);
}

function basisPointRatio(numerator: number, denominator: number): number | null {
  return denominator <= 0 ? null : roundedDivide(BigInt(numerator) * 10_000n, BigInt(denominator));
}

export function calculateIncomeValuation(raw: z.input<typeof incomeValuationSchema>) {
  const input = incomeValuationSchema.parse(raw);
  const valueAt = (capRateBps: number) => input.annualStabilizedNoiMinor <= 0
    ? null
    : roundedDivide(BigInt(input.annualStabilizedNoiMinor) * 10_000n, BigInt(capRateBps));
  return {
    kind: 'USER_DEFINED_SCENARIO' as const,
    validation: 'ILLUSTRATIVE_NOT_SOURCE_BACKED' as const,
    engineVersion: 'INVESTMENT_SCENARIO_V1' as const,
    method: 'INCOME_CAPITALIZATION' as const,
    asOfDate: input.asOfDate,
    currency: input.currency,
    valueMinor: valueAt(input.assumedCapRateBps),
    sensitivity: input.sensitivityCapRatesBps.map(capRateBps => ({ capRateBps, valueMinor: valueAt(capRateBps) })),
    assumptions: { annualStabilizedNoiMinor: input.annualStabilizedNoiMinor, noiSource: input.noiSource,
      assumedCapRateBps: input.assumedCapRateBps, capRateSource: input.capRateSource },
    limitations: [
      'NOI and capitalization rates are user-supplied, not verified financial or market evidence.',
      'A non-positive NOI cannot support a positive income-capitalization valuation.',
      'Illustrative investment valuation; not a certified market appraisal.',
    ],
  };
}

export function calculateUnleveredDcf(raw: z.input<typeof unleveredDcfSchema>) {
  const input = unleveredDcfSchema.parse(raw);
  const discountBase = 10_000n + BigInt(input.discountRateBps);
  const years = input.annualUnleveredCashFlowsMinor.map((cashFlowMinor, index) => {
    const year = index + 1;
    const terminalNetProceedsMinor = year === input.annualUnleveredCashFlowsMinor.length ? input.terminalNetProceedsMinor : 0;
    const undiscountedMinor = addMinorUnits(cashFlowMinor, terminalNetProceedsMinor);
    const presentValueMinor = roundedDivide(BigInt(undiscountedMinor) * 10_000n ** BigInt(year), discountBase ** BigInt(year));
    return { year, cashFlowMinor, terminalNetProceedsMinor, presentValueMinor };
  });
  return {
    kind: 'USER_DEFINED_SCENARIO' as const,
    validation: 'ILLUSTRATIVE_NOT_SOURCE_BACKED' as const,
    engineVersion: 'INVESTMENT_SCENARIO_V1' as const,
    method: 'UNLEVERED_DCF' as const,
    asOfDate: input.asOfDate,
    currency: input.currency,
    valueMinor: years.reduce((total, year) => addMinorUnits(total, year.presentValueMinor), 0),
    years,
    assumptions: { discountRateBps: input.discountRateBps, discountRateBasis: input.discountRateBasis,
      cashFlowSource: input.cashFlowSource, terminalProceedsSource: input.terminalProceedsSource },
    limitations: [
      'Annual unlevered cash flows and net terminal proceeds are user-supplied, not the Phase 5 forecast.',
      'Each annual flow, including net terminal proceeds only in the final year, is discounted at year end.',
      'Do not include sale proceeds in annual cash flows or use an equity discount rate.',
      'Illustrative investment valuation; not a certified market appraisal.',
    ],
  };
}

export function calculateInvestmentMetrics(raw: z.input<typeof investmentMetricsSchema>) {
  const input = investmentMetricsSchema.parse(raw);
  return {
    kind: 'USER_DEFINED_SCENARIO' as const,
    validation: 'ILLUSTRATIVE_NOT_SOURCE_BACKED' as const,
    engineVersion: 'INVESTMENT_SCENARIO_V1' as const,
    asOfDate: input.asOfDate,
    currency: input.currency,
    valueBasis: input.valueBasis,
    grossRentalYieldBps: input.annualGrossRentalIncomeMinor === undefined ? null : basisPointRatio(input.annualGrossRentalIncomeMinor, input.propertyValueMinor),
    impliedCapRateBps: input.annualStabilizedNoiMinor === undefined ? null : basisPointRatio(input.annualStabilizedNoiMinor, input.propertyValueMinor),
    cashOnCashBps: input.annualPreTaxCashFlowMinor === undefined || input.cashInvestedMinor === undefined
      ? null : basisPointRatio(input.annualPreTaxCashFlowMinor, input.cashInvestedMinor),
    loanToValueBps: input.propertyDebtBalanceMinor === undefined ? null : basisPointRatio(input.propertyDebtBalanceMinor, input.propertyValueMinor),
    debtServiceCoverageBps: input.annualStabilizedNoiMinor === undefined || input.annualDebtServiceMinor === undefined
      ? null : basisPointRatio(input.annualStabilizedNoiMinor, input.annualDebtServiceMinor),
    ownershipAdjustedValueMinor: input.ownershipBps === undefined ? null
      : roundedDivide(BigInt(input.propertyValueMinor) * BigInt(input.ownershipBps), 10_000n),
    attributableEquityMinor: input.ownershipBps === undefined || input.attributableSecuredDebtMinor === undefined ? null
      : checked(BigInt(roundedDivide(BigInt(input.propertyValueMinor) * BigInt(input.ownershipBps), 10_000n)) - BigInt(input.attributableSecuredDebtMinor)),
    limitations: [
      'All amounts and the value basis are user-supplied; ratios are not verified operating results.',
      'Missing inputs and zero denominators yield null, never zero performance by implication.',
      'Equity uses separately attributed secured debt; whole-property debt is used only for LTV.',
      'NOI, cash flow, debt service and ownership must refer to consistent periods and legal interests.',
    ],
  };
}
