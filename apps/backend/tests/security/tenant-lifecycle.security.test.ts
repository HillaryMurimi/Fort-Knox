import { describe, expect, it } from 'vitest';
import { AuthorizationService } from '../../src/core/authorization/authorization.service.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';
const org = '507f1f77bcf86cd799439011'; const property = '507f1f77bcf86cd799439012'; const building = '507f1f77bcf86cd799439013'; const unit = '507f1f77bcf86cd799439014'; const tenantUser = '507f1f77bcf86cd799439015'; const otherUser = '507f1f77bcf86cd799439016';
const auth = (roles: string[], permissions: string[], scope: Partial<AuthenticatedUser['memberships'][number]['scope']> = {}): AuthenticatedUser => ({ userId: tenantUser, isPlatformAdmin: false, memberships: [{ organizationId: org, roleIds: [], roles, permissions, scope: { allProperties: false, propertyIds: [], buildingIds: [], unitIds: [], ...scope } }] });
describe('tenant lifecycle authorization', () => {
  it('allows a tenant to access their own tenant-owned lifecycle resource', () => { const a = auth(['TENANT'], ['tenant.view']); expect(AuthorizationService.can(a, 'tenant.view', { organizationId: org, ownerUserId: tenantUser })).toBe(true); });
  it('denies a tenant access to another tenant-owned resource', () => { const a = auth(['TENANT'], ['tenant.view']); expect(AuthorizationService.can(a, 'tenant.view', { organizationId: org, ownerUserId: otherUser })).toBe(false); });
  it('allows a property manager only inside assigned property scope', () => { const a = auth(['PROPERTY_MANAGER'], ['tenancy.view'], { propertyIds: [property] }); expect(AuthorizationService.can(a, 'tenancy.view', { organizationId: org, propertyId: property, buildingId: building, unitId: unit })).toBe(true); expect(AuthorizationService.can(a, 'tenancy.view', { organizationId: org, propertyId: otherUser, buildingId: building, unitId: unit })).toBe(false); });
  it('does not grant access across organizations even when identifiers are scoped', () => { const a = auth(['PROPERTY_MANAGER'], ['tenancy.view'], { propertyIds: [property] }); expect(AuthorizationService.can(a, 'tenancy.view', { organizationId: otherUser, propertyId: property, unitId: unit })).toBe(false); });
});
