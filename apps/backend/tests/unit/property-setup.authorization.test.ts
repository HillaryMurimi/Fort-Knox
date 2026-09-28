import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { PropertySetupService } from '../../src/modules/properties/property-setup.service.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';
import type { PropertySetupInput } from '../../src/modules/properties/property-setup.schemas.js';

const organizationId = new Types.ObjectId();
const userId = new Types.ObjectId();
const property: PropertySetupInput = {
  property: { name: 'Riverside', code: 'RIVER', propertyType: 'APARTMENT', address: { addressLine1: 'Riverside Drive', city: 'Nairobi', country: 'Kenya' } },
  structureMode: 'BUILDINGS', buildings: [{ name: 'A', code: 'A', floors: [{ name: 'Ground', code: 'G', level: 0, units: [{ name: 'A-G-01', code: 'A-G-01', unitType: 'STUDIO', monthlyRent: 14000 }] }] }]
};
const auth = (permissions: string[], scope: AuthenticatedUser['memberships'][number]['scope'] = { allProperties: true, propertyIds: [], buildingIds: [], unitIds: [] }): AuthenticatedUser => ({ userId, isPlatformAdmin: false, memberships: [{ organizationId, roleIds: [], roles: ['LANDLORD'], permissions, scope }] });

describe('property setup authorization', () => {
  it('rejects a tenant without creation permissions before writing', async () => {
    await expect(PropertySetupService.create(auth(['property.view', 'unit.view']), String(organizationId), property)).rejects.toMatchObject({ statusCode: 403 });
  });
  it('rejects a partial creation grant', async () => {
    await expect(PropertySetupService.create(auth(['property.create', 'building.create', 'floor.create']), String(organizationId), property)).rejects.toMatchObject({ statusCode: 403 });
  });
  it('rejects a manager scoped only to another property', async () => {
    await expect(PropertySetupService.create(auth(['property.create', 'building.create', 'floor.create', 'unit.create'], { allProperties: false, propertyIds: [new Types.ObjectId()], buildingIds: [], unitIds: [] }), String(organizationId), property)).rejects.toMatchObject({ statusCode: 403 });
  });
  it('rejects another organization even with all permissions', async () => {
    await expect(PropertySetupService.create(auth(['property.create', 'building.create', 'floor.create', 'unit.create']), String(new Types.ObjectId()), property)).rejects.toMatchObject({ statusCode: 403 });
  });
});
