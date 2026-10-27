import { z } from 'zod';
import { addMinorUnits } from '../../core/money/legacy-finance.js';
import { AppError } from '../../core/errors/AppError.js';

export const financialScenarioSchema = z.object({
  startMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  horizonMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12), z.literal(24), z.literal(36), z.literal(60)]),
  unitMonthlyRentsMinor: z.array(z.number().int().safe().nonnegative()).max(10_000),
  occupancyBps: z.number().int().min(0).max(10_000),
  collectionBps: z.number().int().min(0).max(10_000),
  annualRentChangeBps: z.number().int().min(-10_000).max(10_000),
  currency: z.literal('KES'),
}).strict();

export type FinancialScenarioInput = z.infer<typeof financialScenarioSchema>;

function roundedRatio(amount: number, numerator: number, denominator = 10_000): number {
  const result = (BigInt(amount) * BigInt(numerator) + BigInt(denominator / 2)) / BigInt(denominator);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new AppError(400, 'SCENARIO_AMOUNT_OVERFLOW', 'Scenario amount exceeds the safe integer range');
  return Number(result);
}

export function calculateFinancialScenario(raw: FinancialScenarioInput) {
  const input = financialScenarioSchema.parse(raw);
  const [yearText, monthText] = input.startMonth.split('-');
  const year = Number(yearText), month = Number(monthText);
  if (year < 1900 || year > 9990) throw new AppError(400, 'INVALID_SCENARIO_MONTH', 'Scenario start month is outside the supported range');
  let rents = [...input.unitMonthlyRentsMinor];
  const months = [];
  const totals = { grossPotentialMinor: 0, scheduledRentMinor: 0, illustrativeCollectionsMinor: 0, vacancyOpportunityMinor: 0 };

  for (let index = 0; index < input.horizonMonths; index++) {
    if (index > 0 && index % 12 === 0) rents = rents.map(rent => roundedRatio(rent, 10_000 + input.annualRentChangeBps));
    const grossPotentialMinor = rents.reduce(addMinorUnits, 0);
    const scheduledRentMinor = roundedRatio(grossPotentialMinor, input.occupancyBps);
    const illustrativeCollectionsMinor = roundedRatio(scheduledRentMinor, input.collectionBps);
    const vacancyOpportunityMinor = grossPotentialMinor - scheduledRentMinor;
    const period = new Date(Date.UTC(year, month - 1 + index, 1)).toISOString().slice(0, 7);
    const row = { period, grossPotentialMinor, scheduledRentMinor, illustrativeCollectionsMinor, vacancyOpportunityMinor };
    months.push(row);
    totals.grossPotentialMinor = addMinorUnits(totals.grossPotentialMinor, grossPotentialMinor);
    totals.scheduledRentMinor = addMinorUnits(totals.scheduledRentMinor, scheduledRentMinor);
    totals.illustrativeCollectionsMinor = addMinorUnits(totals.illustrativeCollectionsMinor, illustrativeCollectionsMinor);
    totals.vacancyOpportunityMinor = addMinorUnits(totals.vacancyOpportunityMinor, vacancyOpportunityMinor);
  }

  const annual = Object.values(months.reduce<Record<string, { year: string; months: number; grossPotentialMinor: number; scheduledRentMinor: number; illustrativeCollectionsMinor: number; vacancyOpportunityMinor: number }>>((years, row) => {
    const yearKey = row.period.slice(0, 4);
    const bucket = years[yearKey] ?? { year: yearKey, months: 0, grossPotentialMinor: 0, scheduledRentMinor: 0, illustrativeCollectionsMinor: 0, vacancyOpportunityMinor: 0 };
    bucket.months++;
    bucket.grossPotentialMinor = addMinorUnits(bucket.grossPotentialMinor, row.grossPotentialMinor);
    bucket.scheduledRentMinor = addMinorUnits(bucket.scheduledRentMinor, row.scheduledRentMinor);
    bucket.illustrativeCollectionsMinor = addMinorUnits(bucket.illustrativeCollectionsMinor, row.illustrativeCollectionsMinor);
    bucket.vacancyOpportunityMinor = addMinorUnits(bucket.vacancyOpportunityMinor, row.vacancyOpportunityMinor);
    years[yearKey] = bucket;
    return years;
  }, {}));

  return {
    kind: 'USER_DEFINED_SCENARIO' as const,
    validation: 'ILLUSTRATIVE_NOT_SOURCE_BACKED' as const,
    engineVersion: 'KES_SCENARIO_V1' as const,
    assumptions: { ...input, unitMonthlyRentsMinor: [...input.unitMonthlyRentsMinor] },
    months, annual, totals,
    noiMinor: null, cashFlowMinor: null,
    limitations: ['Unit rents and assumptions are user-supplied, not verified lease history.',
      'Collections are a hypothetical efficiency adjustment, not bank receipts or a prediction.',
      'Vacancy opportunity is foregone scheduled rent, not cash expense or audited NOI.',
      'Operating expenses, financing, tax, capital expenditure and lease changes are not modeled.'],
  };
}
