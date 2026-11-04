import { midnight } from '../platform-control/platform-business.schemas.js';
import type { RevenueTargetPolicy } from './sales-revenue.schemas.js';
export function targetPeriod(policy: Pick<RevenueTargetPolicy, 'period' | 'periodStart'>) {
  const end = new Date(policy.periodStart + 'T00:00:00Z');
  end.setUTCMonth(end.getUTCMonth() + ({ MONTHLY: 1, QUARTERLY: 3, ANNUAL: 12 } as const)[policy.period]);
  return { from: midnight(policy.periodStart, 'Africa/Nairobi'), to: midnight(end.toISOString().slice(0, 10), 'Africa/Nairobi') };
}
export function attainment(actual: string, quota: string) {
  const hundredths = BigInt(actual) * 10000n / BigInt(quota);
  return `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, '0')}`;
}
export function targetPerformance(policy: RevenueTargetPolicy, actualMinor: string | null) {
  const baseline = BigInt(policy.baselineMinor);
  return {
    levels: [1, 3, 7, 10].map(multiplier => ({ multiplier, quotaMinor: String(baseline * BigInt(multiplier)), attainmentPercent: actualMinor === null ? null : attainment(actualMinor, String(baseline * BigInt(multiplier))) })),
    actualMinor, varianceMinor: actualMinor === null ? null : String(BigInt(actualMinor) - baseline),
    requiredPipelineMinor: String((baseline * BigInt(policy.pipelineCoverageBps) + 9999n) / 10000n),
    forecast: policy.forecastMinor === undefined ? null : { amountMinor: policy.forecastMinor, basis: 'ADMIN_ESTIMATE' as const, rationale: policy.forecastRationale, attainmentPercent: attainment(policy.forecastMinor, policy.baselineMinor) },
  };
}
