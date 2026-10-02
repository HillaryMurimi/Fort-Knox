import { createHash } from 'node:crypto';
import { AppError } from '../../core/errors/AppError.js';
import { toPaystackMinorUnits } from '../../core/integrations/paystack.provider.js';

export const contractVariables = ['legalName', 'organizationId', 'legalIdentifier', 'landlordName', 'planName', 'planKey', 'unitCount', 'currency', 'monthlyPrice', 'initialAmount', 'prepaidMonths', 'billingCycle', 'effectiveDate', 'hardwareTerms'] as const;
export const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export function addMonths(date: Date, months: number) {
  const end = new Date(date), day = end.getUTCDate();
  end.setUTCDate(1); end.setUTCMonth(end.getUTCMonth() + months);
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, last)); return end;
}
export function interpolate(body: string, variables: string[], values: Record<string, string>) {
  const used = [...body.matchAll(/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g)].map(match => match[1]!);
  if (body.replace(/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g, '').includes('{{') || used.some(key => !variables.includes(key) || !(contractVariables as readonly string[]).includes(key)) || variables.some(key => !used.includes(key))) throw new AppError(400, 'INVALID_TEMPLATE_VARIABLES', 'Declare exactly the supported variables used in the template');
  return body.replace(/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g, (_match, key: string) => {
    if (values[key] === undefined) throw new AppError(400, 'MISSING_TEMPLATE_VARIABLE', `Missing template variable ${key}`);
    return values[key]!;
  });
}
export function priceSnapshot(plan: { key: string; name: string; currency: string; amount: number; billingInterval: string; metadata?: unknown }, units: number, months: number) {
  const intervalMonths = { MONTH: 1, QUARTER: 3, YEAR: 12 }[plan.billingInterval];
  if (!intervalMonths || plan.currency !== 'KES') throw new AppError(400, 'UNSUPPORTED_ONBOARDING_PLAN', 'Onboarding requires a KES monthly, quarterly or annual plan');
  const metadata = plan.metadata as Record<string, unknown> | undefined;
  const baseIntervalMinor = toPaystackMinorUnits(plan.amount, plan.currency);
  if (baseIntervalMinor % intervalMonths) throw new AppError(400, 'INVALID_PLAN_PRICE', 'Plan price cannot be allocated to whole monthly minor units');
  const includedUnits = metadata?.pricingModel === 'BASE_PLUS_ACTIVE_UNITS' ? Number(metadata.includedUnits) : units;
  const additionalUnitMinor = metadata?.pricingModel === 'BASE_PLUS_ACTIVE_UNITS' ? toPaystackMinorUnits(Number(metadata.additionalUnitAmount), plan.currency) : 0;
  if (!Number.isSafeInteger(includedUnits) || includedUnits < 0) throw new AppError(400, 'INVALID_PLAN_PRICE', 'Included unit count is invalid');
  const extraUnits = Math.max(0, units - includedUnits), baseMonthlyMinor = baseIntervalMinor / intervalMonths;
  const monthlyMinor = baseMonthlyMinor + extraUnits * additionalUnitMinor, totalMinor = monthlyMinor * months;
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) throw new AppError(400, 'INVALID_PLAN_PRICE', 'The subscription total must be a positive safe integer');
  return { planKey: plan.key, planName: plan.name, currency: plan.currency, billingCycle: plan.billingInterval, intervalMonths, unitCount: units, includedUnits, extraUnits, baseMonthlyMinor, additionalUnitMinor, monthlyMinor, recurringMinor: monthlyMinor * intervalMonths, prepaidMonths: months, subtotalMinor: totalMinor, taxMinor: 0, totalMinor,
    lineItems: [{ description: `${plan.name} base subscription`, quantity: months, unitAmountMinor: baseMonthlyMinor, totalMinor: baseMonthlyMinor * months }, ...(extraUnits ? [{ description: 'Additional portfolio units', quantity: extraUnits * months, unitAmountMinor: additionalUnitMinor, totalMinor: extraUnits * months * additionalUnitMinor }] : [])] };
}
export type CommercialSnapshot = ReturnType<typeof priceSnapshot> & { organizationId: string; legalName: string; legalIdentifier: string; billingEmail: string; landlordName: string; effectiveAt: string; issuedAt: string; planId: string };
