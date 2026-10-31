import { z } from 'zod';
import { addMinorUnits } from '../../core/money/legacy-finance.js';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const minor = z.number().int().safe().positive();
const chargeSchema = z.object({
  organizationId: id, propertyId: id, unitId: id, tenancyId: id,
  currency: z.string().regex(/^[A-Z]{3}$/),
}).strict();

export const paymentIntegritySnapshotSchema = z.object({
  evaluatedAt: z.iso.datetime(),
  allocationsComplete: z.literal(true),
  payment: z.object({
    id, organizationId: id, propertyId: id, unitId: id, tenancyId: id,
    status: z.enum(['PENDING', 'CONFIRMED', 'FAILED', 'REVERSED']),
    amountMinor: minor.optional(),
    currency: z.literal('KES'),
    confirmationSource: z.enum(['PROVIDER', 'MANUAL_ACKNOWLEDGED']).optional(),
  }).strict(),
  allocations: z.array(z.object({
    id, organizationId: id, rentChargeId: id, amountMinor: minor.optional(),
    charge: chargeSchema.nullable(),
  }).strict()).max(100),
  refundStatus: z.enum(['PENDING', 'PROCESSING', 'PROCESSED', 'FAILED']).optional(),
}).strict();

export type PaymentIntegritySnapshot = z.input<typeof paymentIntegritySnapshotSchema>;
export type IntegrityFinding = {
  id: string;
  rule: string;
  category: 'INTEGRITY_INCONSISTENCY' | 'DATA_QUALITY' | 'OPERATIONAL_EXCEPTION';
  severity: 'LOW' | 'MODERATE' | 'HIGH';
  organizationId: string;
  paymentId: string;
  sourceIds: string[];
  explanation: string;
  potentialExposureMinor: number | null;
  currency: 'KES';
};

const RULE_VERSION = 'PAYMENT_INTEGRITY_V1';

export function reviewPaymentIntegrity(raw: PaymentIntegritySnapshot) {
  const snapshot = paymentIntegritySnapshotSchema.parse(raw);
  const { payment, allocations } = snapshot;
  const findings: IntegrityFinding[] = [];
  const add = (rule: string, category: IntegrityFinding['category'], severity: IntegrityFinding['severity'],
    explanation: string, potentialExposureMinor: number | null, sourceIds: string[] = []) => {
    findings.push({ id: `${RULE_VERSION}:${payment.organizationId}:${payment.id}:${rule}:${sourceIds.join(':')}`,
      rule, category, severity, organizationId: payment.organizationId, paymentId: payment.id,
      sourceIds: [payment.id, ...sourceIds], explanation, potentialExposureMinor, currency: payment.currency });
  };

  if (payment.amountMinor === undefined) {
    add('PAYMENT_MINOR_MISSING', 'DATA_QUALITY', 'LOW', 'Payment has no authoritative minor-unit amount; allocation totals cannot be certified.', null);
  }
  if (payment.status === 'CONFIRMED' && !payment.confirmationSource) {
    add('CONFIRMATION_SOURCE_MISSING', 'DATA_QUALITY', 'LOW', 'Confirmed payment has no recorded provider/manual confirmation source.', null);
  }
  if ((payment.status === 'PENDING' || payment.status === 'FAILED') && allocations.length) {
    add('UNCONFIRMED_WITH_ALLOCATIONS', 'INTEGRITY_INCONSISTENCY', 'HIGH', 'Unconfirmed payment has allocation rows requiring ledger review.', payment.amountMinor ?? null);
  }
  if (payment.status === 'CONFIRMED' && allocations.length === 0) {
    add('CONFIRMED_WITHOUT_ALLOCATIONS', 'INTEGRITY_INCONSISTENCY', 'HIGH', 'Confirmed payment has no allocation rows in the complete snapshot.', payment.amountMinor ?? null);
  }
  if (payment.status === 'CONFIRMED' && snapshot.refundStatus === 'PROCESSED') {
    add('PROCESSED_REFUND_WITH_CONFIRMED_LEDGER', 'OPERATIONAL_EXCEPTION', 'HIGH', 'A processed refund and confirmed ledger state require supervised reconciliation.', payment.amountMinor ?? null);
  }

  let sum = 0;
  let completeAmounts = payment.amountMinor !== undefined;
  const seenCharges = new Set<string>();
  for (const allocation of allocations) {
    if (allocation.amountMinor === undefined) {
      completeAmounts = false;
      add('ALLOCATION_MINOR_MISSING', 'DATA_QUALITY', 'LOW', 'Allocation has no authoritative minor-unit amount.', null, [allocation.id]);
    } else {
      sum = addMinorUnits(sum, allocation.amountMinor);
    }
    const chargeId = allocation.rentChargeId.toLowerCase();
    if (seenCharges.has(chargeId)) {
      add('REPEATED_CHARGE_ALLOCATION', 'INTEGRITY_INCONSISTENCY', 'HIGH', 'Multiple allocation rows reference the same payment and rent charge.', allocation.amountMinor ?? null, [allocation.id, allocation.rentChargeId]);
    }
    seenCharges.add(chargeId);
    if (allocation.organizationId.toLowerCase() !== payment.organizationId.toLowerCase()) {
      add('ALLOCATION_ORGANIZATION_MISMATCH', 'INTEGRITY_INCONSISTENCY', 'HIGH', 'Allocation organization differs from its payment.', allocation.amountMinor ?? null, [allocation.id]);
    }
    if (!allocation.charge) {
      add('CHARGE_EVIDENCE_MISSING', 'DATA_QUALITY', 'MODERATE', 'Rent charge could not be resolved from the supplied snapshot.', null, [allocation.id, allocation.rentChargeId]);
      continue;
    }
    const charge = allocation.charge;
    if (charge.currency !== payment.currency) {
      completeAmounts = false;
      add('CHARGE_CURRENCY_MISMATCH', 'INTEGRITY_INCONSISTENCY', 'HIGH', 'Allocated rent charge currency differs from the payment; amounts are not combined.', null, [allocation.id, allocation.rentChargeId]);
    }
    if ([['organizationId', charge.organizationId, payment.organizationId],
      ['propertyId', charge.propertyId, payment.propertyId],
      ['unitId', charge.unitId, payment.unitId],
      ['tenancyId', charge.tenancyId, payment.tenancyId]]
      .some(([, actual, expected]) => actual?.toLowerCase() !== expected?.toLowerCase())) {
      add('CHARGE_SCOPE_MISMATCH', 'INTEGRITY_INCONSISTENCY', 'HIGH', 'Allocated rent charge does not match the payment organization, property, unit and tenancy.', allocation.amountMinor ?? null, [allocation.id, allocation.rentChargeId]);
    }
  }
  if (payment.status === 'CONFIRMED' && completeAmounts && payment.amountMinor !== undefined && sum !== payment.amountMinor) {
    add('CONFIRMED_ALLOCATION_TOTAL_MISMATCH', 'INTEGRITY_INCONSISTENCY', 'HIGH',
      'Complete allocation total differs from confirmed payment amount.', Math.abs(sum - payment.amountMinor), allocations.map(row => row.id));
  }

  return {
    kind: 'DETERMINISTIC_PAYMENT_REVIEW' as const,
    ruleVersion: RULE_VERSION,
    evaluatedAt: snapshot.evaluatedAt,
    completeness: completeAmounts && allocations.every(row => row.charge !== null) ? 'COMPLETE' as const : 'INCOMPLETE' as const,
    findings,
    limitations: [
      'Findings are review candidates, not fraud findings or realized losses.',
      'Reversed payment allocations remain historical evidence and are not a discrepancy by themselves.',
      'No bank settlement or provider verification is inferred from payment status.',
    ],
  };
}

export function summarizePotentialExposure(findings: IntegrityFinding[]) {
  const byPayment = new Map<string, { organizationId: string; paymentId: string; currency: 'KES'; potentialExposureMinor: number }>();
  for (const finding of findings) {
    if (finding.potentialExposureMinor === null) continue;
    const key = `${finding.organizationId}:${finding.currency}:${finding.paymentId}`;
    const previous = byPayment.get(key);
    if (!previous || finding.potentialExposureMinor > previous.potentialExposureMinor) {
      byPayment.set(key, { organizationId: finding.organizationId, paymentId: finding.paymentId,
        currency: finding.currency, potentialExposureMinor: finding.potentialExposureMinor });
    }
  }
  const byOrganization = new Map<string, number>();
  for (const item of byPayment.values()) {
    byOrganization.set(item.organizationId, addMinorUnits(byOrganization.get(item.organizationId) ?? 0, item.potentialExposureMinor));
  }
  return { currency: 'KES' as const, byPayment: [...byPayment.values()],
    byOrganization: [...byOrganization].map(([organizationId, potentialExposureMinor]) => ({ organizationId, potentialExposureMinor })),
    classification: 'POTENTIAL_EXPOSURE_NOT_CONFIRMED_LOSS' as const };
}
