import { describe, expect, it } from 'vitest';
import { propertySetupSchema } from '../../src/modules/properties/property-setup.schemas.js';
import { Unit } from '../../src/database/models/Unit.js';

const property = { name: 'Riverside', code: 'RIVER', propertyType: 'APARTMENT', address: { addressLine1: 'Riverside Drive', city: 'Nairobi', country: 'Kenya' } };
const unit = { name: 'A-G-01', code: 'A-G-01', unitType: 'STUDIO', monthlyRent: 14000 };
const setup = { property, structureMode: 'BUILDINGS', buildings: [{ name: 'Building A', code: 'A', floors: [{ name: 'Ground', code: 'G', level: 0, units: [unit] }] }] };

describe('property setup contract', () => {
  it('accepts a valid hierarchy with structured asking rent', () => {
    expect(propertySetupSchema.safeParse(setup).success).toBe(true);
    expect(propertySetupSchema.safeParse({ ...setup, buildings: [{ ...setup.buildings[0], floors: [{ ...setup.buildings[0].floors[0], units: [{ ...unit, unitType: 'OTHER', unitTypeLabel: 'Executive studio' }] }] }] }).success).toBe(true);
  });
  it('rejects duplicate unit codes across floors of the same building', () => {
    const secondFloor = { name: 'Floor 1', code: 'F1', level: 1, units: [{ ...unit, name: 'Other' }] };
    expect(propertySetupSchema.safeParse({ ...setup, buildings: [{ ...setup.buildings[0], floors: [...setup.buildings[0].floors, secondFloor] }] }).success).toBe(false);
  });
  it('rejects duplicate floors, negative rents, invalid custom types and oversized batches', () => {
    const building = setup.buildings[0];
    expect(propertySetupSchema.safeParse({ ...setup, buildings: [{ ...building, floors: [building.floors[0], { ...building.floors[0], code: 'F1' }] }] }).success).toBe(false);
    expect(propertySetupSchema.safeParse({ ...setup, buildings: [{ ...building, floors: [{ ...building.floors[0], units: [{ ...unit, monthlyRent: -1 }] }] }] }).success).toBe(false);
    expect(propertySetupSchema.safeParse({ ...setup, buildings: [{ ...building, floors: [{ ...building.floors[0], units: [{ ...unit, monthlyRent: 14000.001 }] }] }] }).success).toBe(false);
    expect(propertySetupSchema.safeParse({ ...setup, buildings: [{ ...building, floors: [{ ...building.floors[0], units: [{ ...unit, unitType: 'OTHER' }] }] }] }).success).toBe(false);
    const floors = Array.from({ length: 6 }, (_, index) => ({ name: `Floor ${index}`, code: `F${index}`, level: index, units: Array.from({ length: 100 }, (_, number) => ({ ...unit, code: `U${index}-${number}` })) }));
    expect(propertySetupSchema.safeParse({ ...setup, buildings: [{ ...building, floors }] }).success).toBe(false);
  });
  it('keeps standalone sites compatible with the existing hierarchy', () => {
    expect(propertySetupSchema.safeParse({ ...setup, structureMode: 'STANDALONE' }).success).toBe(true);
    expect(propertySetupSchema.safeParse({ ...setup, structureMode: 'STANDALONE', buildings: [setup.buildings[0], setup.buildings[0]] }).success).toBe(false);
  });
  it('stores expanded categories and custom labels on units', () => {
    const entity = new Unit({ organizationId: '507f1f77bcf86cd799439011', propertyId: '507f1f77bcf86cd799439011', buildingId: '507f1f77bcf86cd799439011', floorId: '507f1f77bcf86cd799439011', name: 'Penthouse', code: 'PH1', unitType: 'OTHER', unitTypeLabel: 'Penthouse', monthlyRent: 100000, createdBy: '507f1f77bcf86cd799439011', updatedBy: '507f1f77bcf86cd799439011' });
    expect(entity.validateSync()).toBeUndefined();
  });
});
