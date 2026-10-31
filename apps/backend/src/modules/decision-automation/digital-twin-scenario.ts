import { z } from 'zod';
import { AppError } from '../../core/errors/AppError.js';
import { addMinorUnits } from '../../core/money/legacy-finance.js';
import { calculateFinancialScenario, financialScenarioSchema } from './financial-scenario.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const bps = z.number().int().min(0).max(10_000);

const variantSchema = z.object({
  key: z.string().trim().min(1).max(40).regex(/^[a-zA-Z0-9_-]+$/),
  label: z.string().trim().min(1).max(80),
  occupancyBps: bps.optional(),
  collectionBps: bps.optional(),
  annualRentChangeBps: z.number().int().min(-10_000).max(10_000).optional(),
  unitMonthlyRentsMinor: financialScenarioSchema.shape.unitMonthlyRentsMinor.optional(),
}).strict();

export const digitalTwinScenarioSchema = z.object({
  organizationId: objectId,
  propertyId: objectId,
  inputBasis: z.literal('USER_SUPPLIED_NOT_VERIFIED'),
  rentBasisDescription: z.string().trim().min(3).max(240),
  baseline: financialScenarioSchema,
  variants: z.array(variantSchema).min(1).max(3),
}).strict().superRefine((value, context) => {
  const keys = new Set<string>();
  value.variants.forEach((variant, index) => {
    if (keys.has(variant.key)) context.addIssue({ code: 'custom', path: ['variants', index, 'key'], message: 'Scenario keys must be unique' });
    keys.add(variant.key);
    if (variant.unitMonthlyRentsMinor && variant.unitMonthlyRentsMinor.length !== value.baseline.unitMonthlyRentsMinor.length) {
      context.addIssue({ code: 'custom', path: ['variants', index, 'unitMonthlyRentsMinor'], message: 'Unit rent overrides must preserve the baseline unit count' });
    }
  });
});

type ScenarioInput = z.input<typeof digitalTwinScenarioSchema>;
type FinancialResult = ReturnType<typeof calculateFinancialScenario>;

function difference(value: number, baseline: number): number {
  return addMinorUnits(value, -baseline);
}

function comparableRows(result: FinancialResult, baseline: FinancialResult) {
  return result.months.map((row, index) => {
    const base = baseline.months[index];
    if (!base || base.period !== row.period) throw new AppError(500, 'SCENARIO_PERIOD_MISMATCH', 'Scenario periods did not align');
    return { period: row.period,
      scheduledRentMinor: row.scheduledRentMinor,
      illustrativeCollectionsMinor: row.illustrativeCollectionsMinor,
      vacancyOpportunityMinor: row.vacancyOpportunityMinor,
      scheduledRentDeltaMinor: difference(row.scheduledRentMinor, base.scheduledRentMinor),
      illustrativeCollectionsDeltaMinor: difference(row.illustrativeCollectionsMinor, base.illustrativeCollectionsMinor),
    };
  });
}

export function compareDigitalTwinScenarios(raw: ScenarioInput) {
  const input = digitalTwinScenarioSchema.parse(raw);
  const baseline = calculateFinancialScenario(input.baseline);
  const variants = input.variants.map(variant => {
    const assumptions = { ...input.baseline,
      occupancyBps: variant.occupancyBps ?? input.baseline.occupancyBps,
      collectionBps: variant.collectionBps ?? input.baseline.collectionBps,
      annualRentChangeBps: variant.annualRentChangeBps ?? input.baseline.annualRentChangeBps,
      unitMonthlyRentsMinor: variant.unitMonthlyRentsMinor ?? input.baseline.unitMonthlyRentsMinor,
    };
    const result = calculateFinancialScenario(assumptions);
    return { key: variant.key, label: variant.label, assumptions: result.assumptions,
      months: comparableRows(result, baseline), annual: result.annual,
      totals: result.totals,
      deltas: {
        scheduledRentMinor: difference(result.totals.scheduledRentMinor, baseline.totals.scheduledRentMinor),
        illustrativeCollectionsMinor: difference(result.totals.illustrativeCollectionsMinor, baseline.totals.illustrativeCollectionsMinor),
        vacancyOpportunityMinor: difference(result.totals.vacancyOpportunityMinor, baseline.totals.vacancyOpportunityMinor),
      },
    };
  });
  return {
    kind: 'PROPERTY_SCENARIO_COMPARISON_PREVIEW' as const,
    engineVersion: 'DIGITAL_TWIN_COMPARISON_V1' as const,
    underlyingEngineVersion: baseline.engineVersion,
    validation: 'ILLUSTRATIVE_NOT_SOURCE_BACKED' as const,
    organizationId: input.organizationId, propertyId: input.propertyId, currency: 'KES' as const,
    inputBasis: input.inputBasis, rentBasisDescription: input.rentBasisDescription,
    baseline, variants,
    actualCollectionsMinor: null, operatingExpensesMinor: null, noiMinor: null,
    capitalExpenditureMinor: null, cashFlowMinor: null, modeledValueMinor: null,
    limitations: [
      'Organization and property identifiers are labels supplied to this pure function; it does not authorize a caller or read property records.',
      'All rents and assumptions are user supplied and isolated from live records; no saved snapshot or historical state is implied.',
      'Illustrative collections are not verified payments, bank receipts or a probability-weighted prediction.',
      'Expenses, NOI, capital expenditure, debt service, cash flow and value remain unavailable without independently sourced inputs and definitions.',
    ],
  };
}
