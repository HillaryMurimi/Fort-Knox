import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { composeLandlordActionDigest, resolveBriefWindow } from '../../src/modules/command-center/landlord-brief-foundation.js';

const id = () => String(new Types.ObjectId());
const organizationId = id(), propertyId = id();
const base = { period: 'YESTERDAY' as const, timeZone: 'Africa/Nairobi', asOf: '2026-10-29T05:30:00.000Z' };

function input(): Parameters<typeof composeLandlordActionDigest>[0] {
  return { ...base, organizationId, authorizedPropertyIds: [propertyId], sourceItems: [
    { organizationId, propertyId, sourceId: id(), kind: 'MAINTENANCE_EMERGENCY' as const, observedAt: '2026-10-28T09:00:00.000Z' },
  ] };
}

function firstItem(request: ReturnType<typeof input>) {
  const item = request.sourceItems[0];
  if (!item) throw new Error('Expected a source item in the test fixture');
  return item;
}

describe('landlord brief period and action-digest foundation', () => {
  it('resolves yesterday from the organization timezone as a half-open UTC interval', () => {
    expect(resolveBriefWindow(base)).toMatchObject({
      from: '2026-10-27T21:00:00.000Z', to: '2026-10-28T21:00:00.000Z', endExclusive: true,
    });
  });

  it('uses month-to-date and previous-month local boundaries without mixing UTC dates', () => {
    expect(resolveBriefWindow({ ...base, period: 'MONTH_TO_DATE' })).toMatchObject({ from: '2026-09-30T21:00:00.000Z', to: base.asOf });
    expect(resolveBriefWindow({ ...base, period: 'PREVIOUS_MONTH' })).toMatchObject({
      from: '2026-08-31T21:00:00.000Z', to: '2026-09-30T21:00:00.000Z',
    });
  });

  it('handles a 23-hour daylight-saving spring day', () => {
    const result = resolveBriefWindow({ period: 'YESTERDAY', timeZone: 'America/New_York', asOf: '2026-03-09T12:00:00.000Z' });
    expect(result).toMatchObject({ from: '2026-03-08T05:00:00.000Z', to: '2026-03-09T04:00:00.000Z' });
  });

  it('handles a 25-hour daylight-saving autumn day', () => {
    const result = resolveBriefWindow({ period: 'YESTERDAY', timeZone: 'America/New_York', asOf: '2026-11-02T12:00:00.000Z' });
    expect(result).toMatchObject({ from: '2026-11-01T04:00:00.000Z', to: '2026-11-02T05:00:00.000Z' });
  });

  it('rejects invalid timezone and empty current-day period', () => {
    expect(() => resolveBriefWindow({ ...base, timeZone: 'Not/A_Timezone' })).toThrowError(/IANA/);
    expect(() => resolveBriefWindow({ ...base, period: 'TODAY', asOf: '2026-10-28T21:00:00.000Z' })).toThrowError(/not begun/);
  });

  it('creates only source-referenced advisory actions with required permissions', () => {
    const result = composeLandlordActionDigest(input());
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ organizationId, propertyId, priority: 'CRITICAL',
      requiredPermission: 'maintenance.view', status: 'RECOMMENDED_NOT_EXECUTED',
      source: { type: 'MaintenanceRequest' } });
    expect(result.coverage.financialTotals).toBe('UNAVAILABLE');
    expect(result.coverage.anomalyFindings).toBe('UNAVAILABLE');
  });

  it('rejects evidence from another organization or unassigned property', () => {
    const foreignOrg = input(); firstItem(foreignOrg).organizationId = id();
    expect(() => composeLandlordActionDigest(foreignOrg)).toThrowError(/outside the authorized/);
    const foreignProperty = input(); firstItem(foreignProperty).propertyId = id();
    expect(() => composeLandlordActionDigest(foreignProperty)).toThrowError(/outside the authorized/);
  });

  it('deduplicates repeated evidence and ignores events outside the half-open period', () => {
    const request = input();
    request.sourceItems.push({ ...firstItem(request), observedAt: '2026-10-28T11:00:00Z' });
    request.sourceItems.push({ ...firstItem(request), sourceId: id(), observedAt: '2026-10-28T21:00:00Z' });
    const result = composeLandlordActionDigest(request);
    expect(result.totalItems).toBe(1);
    expect(result.items[0]?.source.observedAt).toBe('2026-10-28T11:00:00Z');
  });

  it('orders critical and approval work before moderate reminders', () => {
    const request = input();
    request.sourceItems.push({ organizationId, propertyId, sourceId: id(), kind: 'EXPENSE_APPROVAL_PENDING', observedAt: '2026-10-28T08:00:00Z' });
    request.sourceItems.push({ organizationId, propertyId, sourceId: id(), kind: 'ASSET_SERVICE_OVERDUE', observedAt: '2026-10-28T07:00:00Z' });
    const result = composeLandlordActionDigest(request);
    expect(result.items.map(item => item.priority)).toEqual(['CRITICAL', 'HIGH', 'MODERATE']);
    expect(result.items[1]).toMatchObject({ approvalRequired: true, requiredPermission: 'expense.approve' });
  });

  it('exposes missing coverage and no invented totals when there are no source items', () => {
    const result = composeLandlordActionDigest({ ...input(), sourceItems: [] });
    expect(result.items).toEqual([]);
    expect(result.totalItems).toBe(0);
    expect(result.coverage).toMatchObject({ financialTotals: 'UNAVAILABLE', occupancyTotals: 'UNAVAILABLE', forecasts: 'UNAVAILABLE' });
  });

  it('bounds a large action digest and reports truncation without inventing omitted actions', () => {
    const request = input();
    request.sourceItems = Array.from({ length: 25 }, () => ({ ...firstItem(input()), sourceId: id() }));
    const result = composeLandlordActionDigest(request);
    expect(result.items).toHaveLength(20);
    expect(result.totalItems).toBe(25);
    expect(result.truncated).toBe(true);
  });
});
