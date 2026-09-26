import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { AuthorizationService } from '../../src/core/authorization/authorization.service.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

const org = new Types.ObjectId();
const otherOrg = new Types.ObjectId();
const property = new Types.ObjectId();
const otherProperty = new Types.ObjectId();
const tenant = new Types.ObjectId();

function user(role: string, permissions: string[], scope = { allProperties: false, propertyIds: [property], buildingIds: [], unitIds: [] }): AuthenticatedUser {
  return { userId: tenant, isPlatformAdmin: false, memberships: [{ organizationId: org, roleIds: [], roles: [role], permissions, scope }] };
}

describe('security invariants', () => {
  it('prevents cross-organization access', () => expect(AuthorizationService.can(user('LANDLORD',['financial.view']), 'financial.view', { organizationId: otherOrg, propertyId: property })).toBe(false));
  it('prevents cross-property caretaker access', () => expect(AuthorizationService.can(user('CARETAKER',['maintenance.view']), 'maintenance.view', { organizationId: org, propertyId: otherProperty })).toBe(false));
  it('prevents tenant access to another tenant resource', () => expect(AuthorizationService.can(user('TENANT',['maintenance.view'], {allProperties:true,propertyIds:[],buildingIds:[],unitIds:[]}), 'maintenance.view', { organizationId: org, propertyId: property, ownerUserId: new Types.ObjectId() })).toBe(false));
  it('does not allow a frontend-supplied role to override missing permission', () => expect(AuthorizationService.can(user('TENANT',[]), 'financial.manage', { organizationId: org, propertyId: property })).toBe(false));
  it('allows only explicit platform admin bypass', () => { const a=user('TENANT',[]); a.isPlatformAdmin=true; expect(AuthorizationService.can(a,'admin.manage',{organizationId:otherOrg,propertyId:otherProperty})).toBe(true); });
});
