import { describe, expect, it } from 'vitest';
import { addMonths, contractVariables, hash, interpolate, priceSnapshot } from '../../src/modules/onboarding/contract-snapshot.js';
import { defaultContractDraft } from '../../src/modules/onboarding/contract-default.js';
import { signContractSchema, configureLandlordSchema } from '../../src/modules/onboarding/landlord-onboarding.schemas.js';
import { renderArtifact } from '../../src/modules/documents/generated-document.service.js';
const plan = { key: 'CONTROL', name: 'Control', amount: 10000, currency: 'KES', billingInterval: 'MONTH', metadata: { pricingModel: 'BASE_PLUS_ACTIVE_UNITS', includedUnits: 50, additionalUnitAmount: 200 } };
describe('contract commercial snapshots', () => {
  it('calculates the first three months in integer minor units with additional units', () => {
    const snapshot = priceSnapshot(plan, 55, 3);
    expect(snapshot).toMatchObject({ monthlyMinor: 1100000, totalMinor: 3300000, recurringMinor: 1100000, extraUnits: 5, taxMinor: 0 });
    expect(snapshot.lineItems.reduce((total, line) => total + line.totalMinor, 0)).toBe(snapshot.totalMinor);
  });
  it.each(['QUARTER', 'YEAR'])('preserves %s renewal interval while collecting three monthly equivalents', interval => {
    const multiple = interval === 'QUARTER' ? 3 : 12;
    expect(priceSnapshot({ ...plan, amount: plan.amount * multiple, billingInterval: interval }, 50, 3)).toMatchObject({ totalMinor: 3000000, recurringMinor: 1000000 * multiple });
  });
  it('rejects invalid precision, currency and unit pricing metadata', () => {
    expect(() => priceSnapshot({ ...plan, amount: 0.001 }, 50, 3)).toThrow();
    expect(() => priceSnapshot({ ...plan, currency: 'USD' }, 50, 3)).toThrow();
    expect(() => priceSnapshot({ ...plan, metadata: { ...plan.metadata, includedUnits: -1 } }, 50, 3)).toThrow();
  });
  it('interpolates organization-specific values as literal text, with no executable or recursive substitution', () => {
    expect(interpolate('{{legalName}} / {{organizationId}}', ['legalName', 'organizationId'], { legalName: '{{monthlyPrice}} <script>x</script>', organizationId: 'org-1' })).toBe('{{monthlyPrice}} <script>x</script> / org-1');
    expect(() => interpolate('{{unknown}}', ['unknown'], { unknown: 'x' })).toThrow();
    expect(() => interpolate('{{legalName}}', ['legalName'], {})).toThrow();
    expect(() => interpolate('{{legalName}', ['legalName'], { legalName: 'x' })).toThrow();
  });
  it('requires every draft commercial variable and stable hashes', () => {
    const values = Object.fromEntries(contractVariables.map(key => [key, 'snapshot']));
    expect(interpolate(defaultContractDraft.body, [...contractVariables], values)).not.toContain('{{');
    expect(hash('one')).not.toBe(hash('two'));
  });
  it('adds calendar months without Jan 31 overflow or losing the time of day', () => {
    expect(addMonths(new Date('2028-01-31T10:30:00Z'), 1).toISOString()).toBe('2028-02-29T10:30:00.000Z');
  });
  it('requires explicit authority and acceptance and rejects client activation injection', () => {
    const valid = { contractId: 'a'.repeat(24), documentHash: 'b'.repeat(64), signatoryName: 'Test Owner', authorityConfirmed: true, termsAccepted: true };
    expect(signContractSchema.safeParse(valid).success).toBe(true);
    expect(signContractSchema.safeParse({ ...valid, authorityConfirmed: false }).success).toBe(false);
    expect(signContractSchema.safeParse({ ...valid, activate: true }).success).toBe(false);
    expect(configureLandlordSchema.safeParse({ legalName: 'Test', legalIdentifier: 'ID', billingEmail: 'owner@example.com', unitCount: 1, state: 'ACTIVE' }).success).toBe(false);
  });
  it('renders deterministic PDF bytes with Unicode names and long, paginated historical terms', async () => {
    const input = { title: 'Contract — Jürgen Holdings', text: `${'Agreement terms for Jürgen Holdings.\n'.repeat(180)}KES 33000.00`, issuedAt: new Date('2026-10-01T10:30:00Z'), contentHash: hash('fixed') };
    const first = await renderArtifact(input), second = await renderArtifact(input);
    expect(first.subarray(0, 5).toString()).toBe('%PDF-'); expect(first.equals(second)).toBe(true);
    expect(first.length).toBeGreaterThan(10000);
  });
});
