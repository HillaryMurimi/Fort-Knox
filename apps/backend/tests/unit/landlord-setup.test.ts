import { describe, expect, it } from 'vitest';
import { SecurityCamera } from '../../src/database/models/SecurityCamera.js';
import { createPropertySchema } from '../../src/modules/properties/property.schemas.js';
import { startOnboardingSchema } from '../../src/modules/onboarding/onboarding.schemas.js';
const id = '507f1f77bcf86cd799439011';
describe('landlord setup contracts', () => {
  it('does not claim a newly registered camera is online', () => {
    const camera = new SecurityCamera({ organizationId: id, propertyId: id, createdBy: id, updatedBy: id, name: 'Entrance', cameraCode: 'ENT-01', provider: 'GENERIC_CCTV', connectionType: 'HTTP' });
    expect(camera.validateSync()).toBeUndefined();
    expect(camera.status).toBe('OFFLINE');
  });
  it('accepts property form fields and rejects the old unsupported unit count', () => {
    const input = { name: 'Court', code: 'COURT', propertyType: 'APARTMENT', address: { addressLine1: '1 Main Road', city: 'Nairobi', country: 'Kenya' } };
    expect(createPropertySchema.safeParse(input).success).toBe(true);
    expect(createPropertySchema.safeParse({ ...input, totalUnits: 10 }).success).toBe(false);
    expect(createPropertySchema.safeParse({ ...input, address: { ...input.address, addressLine1: '' } }).success).toBe(false);
  });
  it('requires a valid assigned unit for pre-registration', () => {
    const input = { firstName: 'Test', lastName: 'Resident', phone: '+254700000000', unitId: id };
    expect(startOnboardingSchema.safeParse(input).success).toBe(true);
    expect(startOnboardingSchema.safeParse({ ...input, unitId: '' }).success).toBe(false);
  });
});
