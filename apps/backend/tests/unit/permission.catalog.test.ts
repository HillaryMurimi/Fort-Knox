import { describe, expect, it } from 'vitest'; import { PERMISSIONS } from '../../src/modules/permissions/permission.catalog.js';
describe('permission catalog',()=>{it('uses stable dotted permission keys',()=>{for(const key of PERMISSIONS)expect(key).toMatch(/^[a-z-]+(?:\.[a-z-]+)+$/);});it('contains no duplicates',()=>expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length));});
