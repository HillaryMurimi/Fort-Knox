import { describe, expect, it } from 'vitest'; import { SYSTEM_ROLES } from '../../src/modules/roles/role.catalog.js';
const has=(r:string,p:string)=>SYSTEM_ROLES[r as keyof typeof SYSTEM_ROLES].permissions.includes(p);
describe('role policy matrix',()=>{
 it('landlord controls organization membership and roles',()=>{expect(has('LANDLORD','organization.members.manage')).toBe(true);expect(has('LANDLORD','role.assign')).toBe(true);});
 it('property manager cannot administer the platform',()=>{expect(has('PROPERTY_MANAGER','admin.manage')).toBe(false);expect(has('PROPERTY_MANAGER','financial.manage')).toBe(false);});
 it('caretaker cannot manage financials or roles',()=>{expect(has('CARETAKER','financial.view')).toBe(false);expect(has('CARETAKER','role.assign')).toBe(false);});
 it('contractor cannot view portfolio financials or CCTV playback',()=>{expect(has('CONTRACTOR','financial.view')).toBe(false);expect(has('CONTRACTOR','cctv.playback')).toBe(false);});
 it('tenant is limited to tenant-facing operations',()=>{expect(has('TENANT','financial.manage')).toBe(false);expect(has('TENANT','cctv.download')).toBe(false);});
});
