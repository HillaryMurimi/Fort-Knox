import type { ClientSession } from 'mongoose';
import { AppError } from '../../core/errors/AppError.js';
import { SubscriptionPlan } from '../../database/models/SubscriptionPlan.js';

type Features = { features?: string[] } | null | undefined;

export function assertFortKnoxInheritsControl(control: Features, fortKnox: Features) {
  if (!control || !fortKnox || control.features?.some(feature => !fortKnox.features?.includes(feature))) {
    throw new AppError(409, 'PLAN_INHERITANCE_INVALID', 'Fort Knox must include every Control capability');
  }
}

export async function assertPublishedFortKnoxInheritance(plan: { key: string; entitlements?: Features }, session?: ClientSession) {
  if (plan.key !== 'FORT_KNOX') return;
  const query = SubscriptionPlan.findOne({ key: 'CONTROL', active: true }).select('entitlements.features');
  if (session) query.session(session);
  const control = await query.lean();
  assertFortKnoxInheritsControl(control?.entitlements, plan.entitlements);
}
