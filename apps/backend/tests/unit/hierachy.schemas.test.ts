import { describe, expect, it } from 'vitest';
import { createPropertySchema } from '../../src/modules/properties/property.schemas.js';
import { createBuildingSchema } from '../../src/modules/buildings/building.schemas.js';
import { createFloorSchema } from '../../src/modules/floors/floor.schemas.js';
import { createUnitSchema } from '../../src/modules/units/unit.schemas.js';
import { PERMISSIONS } from '../../src/modules/permissions/permission.catalog.js';
import { SYSTEM_ROLES } from '../../src/modules/roles/role.catalog.js';

describe('hierarchy schemas', () => {
  it('rejects unknown property fields', () => {
    const result = createPropertySchema.safeParse({
      name: 'Block A', code: 'A', propertyType: 'APARTMENT',
      address: { addressLine1: '1 Main St', city: 'Nairobi', country: 'Kenya' },
      maliciousField: true
    });
    expect(result.success).toBe(false);
  });

  it('requires valid parent identifiers', () => {
    expect(createBuildingSchema.safeParse({ propertyId: 'bad', name: 'Block A', code: 'A' }).success).toBe(false);
    expect(createFloorSchema.safeParse({ buildingId: 'bad', name: 'Ground', level: 0, code: 'G' }).success).toBe(false);
    expect(createUnitSchema.safeParse({ floorId: 'bad', name: 'Unit 1', code: '101', unitType: 'BEDSITTER', monthlyRent: 10000 }).success).toBe(false);
  });

  it('rejects negative rent and invalid coordinates', () => {
    expect(createUnitSchema.safeParse({ floorId: '507f1f77bcf86cd799439011', name: 'Unit 1', code: '101', unitType: 'BEDSITTER', monthlyRent: -1 }).success).toBe(false);
    expect(createPropertySchema.safeParse({
      name: 'Block A', code: 'A', propertyType: 'APARTMENT',
      address: { addressLine1: '1 Main St', city: 'Nairobi', country: 'Kenya' },
      location: { type: 'Point', coordinates: [200, 0] }
    }).success).toBe(false);
  });
});


describe('hierarchy permission catalog', () => {
  it('contains floor CRUD permissions and assigns them only to operational roles that need them', () => {
    expect(PERMISSIONS).toEqual(expect.arrayContaining(['floor.view', 'floor.create', 'floor.update', 'floor.delete']));
    expect(SYSTEM_ROLES.LANDLORD.permissions).toContain('floor.create');
    expect(SYSTEM_ROLES.PROPERTY_MANAGER.permissions).toContain('floor.update');
    expect(SYSTEM_ROLES.CARETAKER.permissions).toContain('floor.view');
    expect(SYSTEM_ROLES.CARETAKER.permissions).not.toContain('floor.delete');
    expect(SYSTEM_ROLES.TENANT.permissions).not.toContain('floor.update');
  });
});
