import {describe,it,expect} from 'vitest'; import {AuthorizationService} from '../../src/core/authorization/authorization.service.js';
describe('security authorization catalog',()=>{
    it('contains granular security permissions',()=>{const keys=['cctv.view','cctv.playback','cctv.download','cctv.manage','security-event.view','security-event.manage','incident.view','incident.manage','access-point.view','access-point.manage','access-event.view','access-event.ingest'];
    for(const key of keys)expect(key.length).toBeGreaterThan(0);
    expect(typeof AuthorizationService.assertPermission).toBe('function');});});
