import { describe, expect, it } from 'vitest';
import { SYSTEM_ROLES } from '../../src/modules/roles/role.catalog.js';
import { PERMISSIONS } from '../../src/modules/permissions/permission.catalog.js';

describe('RBAC catalog', () => {
  it('defines every required application role', () => {
    expect(Object.keys(SYSTEM_ROLES).sort()).toEqual(['CARETAKER','CONTRACTOR','LANDLORD','PROPERTY_MANAGER','SUPER_ADMIN','TENANT']);
  });
  it('contains no role permission outside the permission catalog', () => {
    const allowed = new Set(PERMISSIONS);
    for (const role of Object.values(SYSTEM_ROLES)) for (const permission of role.permissions) expect(allowed.has(permission as never)).toBe(true);
  });
  it('gives super admin platform management access', () => {
    expect(SYSTEM_ROLES.SUPER_ADMIN.permissions).toContain('admin.manage');
  });
  it('does not give caretakers portfolio-wide financial access by default', () => {
    expect(SYSTEM_ROLES.CARETAKER.permissions).not.toContain('financial.manage');
    expect(SYSTEM_ROLES.CARETAKER.permissions).not.toContain('financial.view');
  });
  it('does not give tenants role-management access', () => {
    expect(SYSTEM_ROLES.TENANT.permissions).not.toContain('role.assign');
    expect(SYSTEM_ROLES.TENANT.permissions).not.toContain('organization.members.manage');
  });
});
