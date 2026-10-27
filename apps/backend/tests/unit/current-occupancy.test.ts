import { describe, expect, it } from 'vitest';
import { currentOccupancy } from '../../src/modules/command-center/current-occupancy.js';

const today = new Date('2026-10-27T12:00:00.000Z');
const before = new Date('2026-09-01T00:00:00.000Z');
const after = new Date('2026-11-01T00:00:00.000Z');

describe('current occupancy from tenancy records', () => {
  it('treats reservation as vacant and maintenance as an independent occupied condition', () => {
    const result = currentOccupancy(
      [{ _id: 'one', status: 'RESERVED' }, { _id: 'two', status: 'MAINTENANCE' }],
      [{ unitId: 'two', status: 'ACTIVE', startDate: before }], today,
    );
    expect(result).toMatchObject({ rentable: 2, occupied: 1, vacant: 1, reserved: 1, maintenance: 1, quality: { complete: true } });
  });

  it('does not count a future start as occupied', () => {
    const result = currentOccupancy([{ _id: 'one', status: 'VACANT' }],
      [{ unitId: 'one', status: 'ACTIVE', startDate: after }], today);
    expect(result).toMatchObject({ occupied: 0, vacant: 1, quality: { complete: true } });
  });

  it('does not vacate a holdover tenancy merely because its lease term ended', () => {
    const result = currentOccupancy([{ _id: 'one', status: 'OCCUPIED' }],
      [{ unitId: 'one', status: 'NOTICE', startDate: before }], today);
    expect(result.occupied).toBe(1);
  });

  it('uses actual move-out and flags stale unit status', () => {
    const result = currentOccupancy([{ _id: 'one', status: 'OCCUPIED' }],
      [{ unitId: 'one', status: 'ACTIVE', startDate: before, movedOutAt: before }], today);
    expect(result).toMatchObject({ occupied: 0, vacant: 1, quality: { statusMismatches: 1, complete: false } });
  });

  it('reports two active tenancies and an inactive occupied unit without counting either twice', () => {
    const result = currentOccupancy([{ _id: 'one', status: 'VACANT' }, { _id: 'two', status: 'INACTIVE' }],
      [{ unitId: 'one', status: 'ACTIVE', startDate: before }, { unitId: 'one', status: 'NOTICE', startDate: before },
        { unitId: 'two', status: 'ACTIVE', startDate: before }], today);
    expect(result).toMatchObject({ rentable: 1, occupied: 1, vacant: 0,
      quality: { conflictingTenancies: 1, inactiveWithTenancy: 1, statusMismatches: 1, complete: false } });
  });

  it('reports an active tenancy with no matching unit in the property data', () => {
    const result = currentOccupancy([], [{ unitId: 'missing', status: 'ACTIVE', startDate: before }], today);
    expect(result.quality).toMatchObject({ missingUnits: 1, complete: false });
  });
});
