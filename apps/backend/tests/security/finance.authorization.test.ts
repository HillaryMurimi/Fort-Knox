import { describe, expect, it } from 'vitest';
import { AuthorizationService } from '../../src/core/authorization/authorization.service.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

const user = (propertyId: string): AuthenticatedUser => ({
  userId: '507f1f77bcf86cd799439011',
  email: 'manager@example.com',
  isPlatformAdmin: false,
  memberships: [{ organizationId: '507f1f77bcf86cd799439012', roles: ['PROPERTY_MANAGER'], permissions: ['rent.view', 'financial.report.view'], scope: { allProperties: false, propertyIds: [propertyId], buildingIds: [], unitIds: [] } }]
});

describe('finance authorization', () => {
  it('allows finance access inside the assigned property', () => {
    expect(AuthorizationService.can(user('507f1f77bcf86cd799439013'), 'rent.view', { organizationId: '507f1f77bcf86cd799439012', propertyId: '507f1f77bcf86cd799439013' })).toBe(true);
  });
  it('denies finance access outside the assigned property', () => {
    expect(AuthorizationService.can(user('507f1f77bcf86cd799439013'), 'financial.report.view', { organizationId: '507f1f77bcf86cd799439012', propertyId: '507f1f77bcf86cd799439014' })).toBe(false);
  });
  it('denies a permission the membership does not possess', () => {
    expect(AuthorizationService.can(user('507f1f77bcf86cd799439013'), 'payment.reverse', { organizationId: '507f1f77bcf86cd799439012', propertyId: '507f1f77bcf86cd799439013' })).toBe(false);
  });
});
