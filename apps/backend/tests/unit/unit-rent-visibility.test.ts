import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { UnitService } from '../../src/modules/units/unit.service.js';
import { Unit } from '../../src/database/models/Unit.js';
import { ResourceScopeService } from '../../src/core/authorization/resource-scope.service.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

const organizationId = new Types.ObjectId();
const propertyId = new Types.ObjectId();
const buildingId = new Types.ObjectId();
const unitId = new Types.ObjectId();
const row = { _id: unitId, organizationId, propertyId, buildingId, floorId: new Types.ObjectId(), name: 'A01', code: 'A01', unitType: 'STUDIO', monthlyRent: 14000, serviceCharge: 500 };
const auth = (permissions: string[]): AuthenticatedUser => ({ userId: new Types.ObjectId(), isPlatformAdmin: false, memberships: [{ organizationId, roleIds: [], roles: ['CONTRACTOR'], permissions, scope: { allProperties: false, propertyIds: [], buildingIds: [], unitIds: [unitId] } }] });

afterEach(() => vi.restoreAllMocks());

describe('unit rent visibility', () => {
  it('redacts asking rent and service charge without scoped rent.view', async () => {
    vi.spyOn(ResourceScopeService, 'scopedUnitIds').mockResolvedValue([unitId]);
    vi.spyOn(Unit, 'find').mockReturnValue({ sort: () => ({ lean: async () => [row] }) } as never);
    const result = await UnitService.list(auth(['unit.view']), String(organizationId));
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('monthlyRent');
    expect(result[0]).not.toHaveProperty('serviceCharge');
    expect(result[0]).toHaveProperty('name', 'A01');
  });
  it('retains rent for an authorized, scoped operator', async () => {
    vi.spyOn(ResourceScopeService, 'scopedUnitIds').mockResolvedValue([unitId]);
    vi.spyOn(Unit, 'find').mockReturnValue({ sort: () => ({ lean: async () => [row] }) } as never);
    const result = await UnitService.list(auth(['unit.view', 'rent.view']), String(organizationId));
    expect(result[0]).toHaveProperty('monthlyRent', 14000);
  });
});
