import { AppError } from '../errors/AppError.js';
import { toPaystackMinorUnits } from '../integrations/paystack.provider.js';

interface PlanPrice { amount: number; currency: string }

export function choosePaidRenewalPlan<T extends PlanPrice>(current: T, pending: T | null, amountMinorUnits: number, currency: string): { plan: T; applyPending: boolean } {
  const matches = (plan: T) => Number.isSafeInteger(amountMinorUnits) && amountMinorUnits === toPaystackMinorUnits(plan.amount) && currency.toUpperCase() === plan.currency.toUpperCase();
  if (pending && matches(pending)) return { plan: pending, applyPending: true };
  if (matches(current)) return { plan: current, applyPending: false };
  throw new AppError(409, 'PROVIDER_AMOUNT_MISMATCH', 'Renewal charge does not match the subscription plan');
}
