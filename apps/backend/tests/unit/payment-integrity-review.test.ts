import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { reviewPaymentIntegrity, summarizePotentialExposure, type PaymentIntegritySnapshot } from '../../src/modules/finance/payment-integrity-review.js';

const id = () => String(new Types.ObjectId());
const org = id(), property = id(), unit = id(), tenancy = id(), paymentId = id(), chargeId = id(), allocationId = id();

function fixture(): PaymentIntegritySnapshot {
  return {
    evaluatedAt: '2026-10-28T08:00:00.000Z', allocationsComplete: true,
    payment: { id: paymentId, organizationId: org, propertyId: property, unitId: unit, tenancyId: tenancy,
      status: 'CONFIRMED', amountMinor: 2_000_000, currency: 'KES', confirmationSource: 'MANUAL_ACKNOWLEDGED' },
    allocations: [{ id: allocationId, organizationId: org, rentChargeId: chargeId, amountMinor: 2_000_000,
      charge: { organizationId: org, propertyId: property, unitId: unit, tenancyId: tenancy, currency: 'KES' } }],
  };
}

function firstAllocation(input: PaymentIntegritySnapshot) {
  const allocation = input.allocations[0];
  if (!allocation) throw new Error('Expected an allocation in the test fixture');
  return allocation;
}

describe('deterministic payment integrity review', () => {
  it('does not flag a complete, correctly allocated confirmed payment', () => {
    const result = reviewPaymentIntegrity(fixture());
    expect(result.findings).toEqual([]);
    expect(result.completeness).toBe('COMPLETE');
  });

  it('does not call two separate equal-amount payments duplicates', () => {
    const first = reviewPaymentIntegrity(fixture());
    const second = fixture(); second.payment.id = id();
    expect(first.findings).toEqual([]);
    expect(reviewPaymentIntegrity(second).findings).toEqual([]);
  });

  it('flags a repeated charge allocation without changing the ledger', () => {
    const input = fixture();
    input.allocations.push({ ...firstAllocation(input), id: id() });
    const result = reviewPaymentIntegrity(input);
    expect(result.findings.map(item => item.rule)).toContain('REPEATED_CHARGE_ALLOCATION');
    expect(result.findings.map(item => item.rule)).toContain('CONFIRMED_ALLOCATION_TOTAL_MISMATCH');
    expect(input.payment.status).toBe('CONFIRMED');
  });

  it('identifies cross-organization and cross-tenancy evidence', () => {
    const input = fixture();
    firstAllocation(input).organizationId = id();
    firstAllocation(input).charge = { organizationId: id(), propertyId: property, unitId: unit, tenancyId: id(), currency: 'KES' };
    const result = reviewPaymentIntegrity(input);
    expect(result.findings.map(item => item.rule)).toEqual(expect.arrayContaining(['ALLOCATION_ORGANIZATION_MISMATCH', 'CHARGE_SCOPE_MISMATCH']));
    expect(result.findings.every(item => item.organizationId === org)).toBe(true);
  });

  it('classifies missing legacy minor units and charge evidence as quality gaps', () => {
    const input = fixture();
    delete input.payment.amountMinor;
    delete firstAllocation(input).amountMinor;
    firstAllocation(input).charge = null;
    const result = reviewPaymentIntegrity(input);
    expect(result.completeness).toBe('INCOMPLETE');
    expect(result.findings.map(item => item.rule)).toEqual(expect.arrayContaining(['PAYMENT_MINOR_MISSING', 'ALLOCATION_MINOR_MISSING', 'CHARGE_EVIDENCE_MISSING']));
    expect(result.findings.every(item => item.category === 'DATA_QUALITY')).toBe(true);
    expect(summarizePotentialExposure(result.findings).byPayment).toEqual([]);
  });

  it('does not accuse a reversed payment merely because allocation history remains', () => {
    const input = fixture(); input.payment.status = 'REVERSED';
    expect(reviewPaymentIntegrity(input).findings).toEqual([]);
  });

  it('flags a charge currency mismatch without comparing unlike minor units', () => {
    const input = fixture();
    firstAllocation(input).charge = { organizationId: org, propertyId: property, unitId: unit, tenancyId: tenancy, currency: 'USD' };
    const result = reviewPaymentIntegrity(input);
    expect(result.completeness).toBe('INCOMPLETE');
    expect(result.findings.map(item => item.rule)).toContain('CHARGE_CURRENCY_MISMATCH');
    expect(result.findings.map(item => item.rule)).not.toContain('CONFIRMED_ALLOCATION_TOTAL_MISMATCH');
    expect(result.findings.find(item => item.rule === 'CHARGE_CURRENCY_MISMATCH')?.potentialExposureMinor).toBeNull();
  });

  it('separates a processed-refund reconciliation review from a proven loss', () => {
    const input = fixture(); input.refundStatus = 'PROCESSED';
    const result = reviewPaymentIntegrity(input);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ rule: 'PROCESSED_REFUND_WITH_CONFIRMED_LEDGER', category: 'OPERATIONAL_EXCEPTION', potentialExposureMinor: 2_000_000 });
    expect(result.limitations[0]).toContain('not fraud findings');
  });

  it('flags unconfirmed payments with allocations and confirmed payments without allocations', () => {
    const pending = fixture(); pending.payment.status = 'PENDING';
    expect(reviewPaymentIntegrity(pending).findings.map(item => item.rule)).toContain('UNCONFIRMED_WITH_ALLOCATIONS');
    const confirmed = fixture(); confirmed.allocations = [];
    expect(reviewPaymentIntegrity(confirmed).findings.map(item => item.rule)).toEqual(expect.arrayContaining(['CONFIRMED_WITHOUT_ALLOCATIONS', 'CONFIRMED_ALLOCATION_TOTAL_MISMATCH']));
  });

  it('deduplicates overlapping rule exposure per payment, not per finding', () => {
    const input = fixture(); input.payment.status = 'PENDING'; firstAllocation(input).organizationId = id();
    const findings = reviewPaymentIntegrity(input).findings;
    expect(findings.length).toBeGreaterThan(1);
    expect(summarizePotentialExposure(findings)).toMatchObject({
      byPayment: [{ organizationId: org, paymentId, potentialExposureMinor: 2_000_000 }],
      byOrganization: [{ organizationId: org, potentialExposureMinor: 2_000_000 }],
      classification: 'POTENTIAL_EXPOSURE_NOT_CONFIRMED_LOSS',
    });
    expect(reviewPaymentIntegrity(input).findings.map(item => item.id)).toEqual(reviewPaymentIntegrity(input).findings.map(item => item.id));
  });

  it('rejects unsupported currencies, incomplete snapshots and unsafe amounts', () => {
    expect(() => reviewPaymentIntegrity({ ...fixture(), allocationsComplete: false as never })).toThrow();
    const currency = fixture(); currency.payment.currency = 'USD' as never;
    expect(() => reviewPaymentIntegrity(currency)).toThrow();
    const unsafe = fixture(); firstAllocation(unsafe).amountMinor = Number.MAX_SAFE_INTEGER + 1;
    expect(() => reviewPaymentIntegrity(unsafe)).toThrow();
  });
});
