import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { AuthorizationService } from '../../src/core/authorization/authorization.service.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

const org = new Types.ObjectId();
const propertyA = new Types.ObjectId();
const propertyB = new Types.ObjectId();
const buildingA = new Types.ObjectId();
const unitA = new Types.ObjectId();
const user = new Types.ObjectId();

const auth = (overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  userId: user,
  isPlatformAdmin: false,
  memberships: [{ organizationId: org, roleIds: [], roles: ['CARETAKER'], permissions: ['maintenance.view'], scope: { allProperties: false, propertyIds: [propertyA], buildingIds: [buildingA], unitIds: [unitA] } }],
  ...overrides
});

describe('AuthorizationService', () => {
  it('allows a permitted action within the scoped property', () => {
    expect(AuthorizationService.can(auth(), 'maintenance.view', { organizationId: org, propertyId: propertyA })).toBe(true);
  });
  it('denies access to another property in the same organization', () => {
    expect(AuthorizationService.can(auth(), 'maintenance.view', { organizationId: org, propertyId: propertyB })).toBe(false);
  });
  it('denies a permission that the role does not have', () => {
    expect(AuthorizationService.can(auth(), 'financial.view', { organizationId: org, propertyId: propertyA })).toBe(false);
  });
  it('allows platform administrators to bypass tenant organization scope', () => {
    expect(AuthorizationService.can(auth({ isPlatformAdmin: true }), 'financial.view', { organizationId: new Types.ObjectId(), propertyId: propertyB })).toBe(true);
  });
  it('allows a building-scoped user to access resources in that building', () => {
    expect(AuthorizationService.can(auth(), 'maintenance.view', { organizationId: org, buildingId: buildingA })).toBe(true);
  });
  it('enforces tenant self-ownership when ownerUserId is supplied', () => {
    const tenantAuth = auth({ memberships: [{ ...auth().memberships[0], roles: ['TENANT'], scope: { allProperties: true, propertyIds: [], buildingIds: [], unitIds: [] } }] });
    expect(AuthorizationService.can(tenantAuth, 'maintenance.view', { organizationId: org, ownerUserId: user })).toBe(true);
    expect(AuthorizationService.can(tenantAuth, 'maintenance.view', { organizationId: org, ownerUserId: new Types.ObjectId() })).toBe(false);
  });
});
