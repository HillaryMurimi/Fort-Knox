import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { AuthorizationService } from '../../src/core/authorization/authorization.service.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

const oid = () => new Types.ObjectId();
const auth = (role: string, permissions: string[], scope: Partial<AuthenticatedUser['memberships'][number]['scope']> = {}): AuthenticatedUser => {
  const organizationId = oid();
  return {
    userId: oid(), isPlatformAdmin: false,
    memberships: [{
      organizationId, roleIds: [oid()], roles: [role], permissions,
      scope: { allProperties: scope.allProperties ?? false, propertyIds: scope.propertyIds ?? [], buildingIds: scope.buildingIds ?? [], unitIds: scope.unitIds ?? [] }
    }]
  };
};

describe('property hierarchy RBAC', () => {
  it('allows a property manager inside the assigned property only', () => {
    const organizationId = oid();
    const propertyA = oid();
    const propertyB = oid();
    const user: AuthenticatedUser = {
      userId: oid(), isPlatformAdmin: false,
      memberships: [{ organizationId, roleIds: [oid()], roles: ['PROPERTY_MANAGER'], permissions: ['property.view', 'building.view', 'floor.view', 'unit.view'], scope: { allProperties: false, propertyIds: [propertyA], buildingIds: [], unitIds: [] } }]
    };
    expect(AuthorizationService.can(user, 'building.view', { organizationId, propertyId: propertyA, buildingId: oid() })).toBe(true);
    expect(AuthorizationService.can(user, 'building.view', { organizationId, propertyId: propertyB, buildingId: oid() })).toBe(false);
  });

  it('allows a caretaker at a scoped building but not a sibling building', () => {
    const organizationId = oid();
    const propertyId = oid();
    const buildingA = oid();
    const buildingB = oid();
    const user = auth('CARETAKER', ['building.view', 'floor.view', 'unit.view'], { buildingIds: [buildingA] });
    const membership = user.memberships[0]!;
    membership.organizationId = organizationId;
    expect(AuthorizationService.can(user, 'floor.view', { organizationId, propertyId, buildingId: buildingA })).toBe(true);
    expect(AuthorizationService.can(user, 'floor.view', { organizationId, propertyId, buildingId: buildingB })).toBe(false);
  });

  it('allows a tenant only through the explicitly assigned unit scope', () => {
    const organizationId = oid();
    const propertyId = oid();
    const buildingId = oid();
    const unitA = oid();
    const unitB = oid();
    const user = auth('TENANT', ['unit.view'], { unitIds: [unitA] });
    user.memberships[0]!.organizationId = organizationId;
    expect(AuthorizationService.can(user, 'unit.view', { organizationId, propertyId, buildingId, unitId: unitA, ownerUserId: user.userId })).toBe(true);
    expect(AuthorizationService.can(user, 'unit.view', { organizationId, propertyId, buildingId, unitId: unitB, ownerUserId: user.userId })).toBe(false);
  });

  it('never allows a scoped role to cross organizations', () => {
    const organizationA = oid();
    const organizationB = oid();
    const propertyId = oid();
    const user = auth('PROPERTY_MANAGER', ['property.view'], { propertyIds: [propertyId] });
    expect(AuthorizationService.can(user, 'property.view', { organizationId: organizationA, propertyId })).toBe(false);
    expect(AuthorizationService.can(user, 'property.view', { organizationId: organizationB, propertyId })).toBe(false);
  });
});
