import { describe, expect, it, vi, afterEach } from 'vitest';
import { Types } from 'mongoose';
import { intelligenceModuleRegistry } from '../../src/modules/platform-control/intelligence-module.registry.js';
import { platformSwitchCatalog, PlatformControlService } from '../../src/modules/platform-control/platform-control.service.js';
import { PlatformSwitch } from '../../src/database/models/PlatformSwitch.js';
import { switchCoverage } from '../../src/modules/platform-control/platform-monitoring.types.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

afterEach(() => vi.restoreAllMocks());

const admin: AuthenticatedUser = { userId: new Types.ObjectId(), isPlatformAdmin: true, memberships: [] };
const change = { mode: 'ON' as const, reason: 'Attempted activation', confirm: true as const };

describe('intelligence foundation release gates', () => {
  it('registers nine unique, dependency-ordered modules in the persistent switch catalog', () => {
    expect(intelligenceModuleRegistry).toHaveLength(9);
    const keys = intelligenceModuleRegistry.map(module => module.key);
    expect(new Set(keys).size).toBe(9);
    for (const module of intelligenceModuleRegistry) {
      expect(module.entitlement).toMatch(/^intelligence\.[a-z-]+$/);
      expect(module.plans).toContain('FORT_KNOX');
      expect(platformSwitchCatalog).toContainEqual([module.key, 'FEATURE', module.name, module.description]);
      expect(switchCoverage[module.key]).toMatchObject({ coverage: 'NOT_ENFORCED', dependencies: [...module.dependencies] });
      for (const dependency of module.dependencies) {
        expect(keys.indexOf(dependency)).toBeGreaterThanOrEqual(0);
        expect(keys.indexOf(dependency)).toBeLessThan(keys.indexOf(module.key));
      }
    }
  });

  it('persists new module switches OFF without overwriting existing operator state', async () => {
    const upsert = vi.spyOn(PlatformSwitch, 'updateOne').mockResolvedValue({} as never);
    await PlatformControlService.ensureCatalog();
    for (const module of intelligenceModuleRegistry) {
      expect(upsert).toHaveBeenCalledWith({ key: module.key }, {
        $setOnInsert: expect.objectContaining({ key: module.key, enabled: false, mode: 'OFF' }),
      }, { upsert: true });
    }
  });

  it.each(intelligenceModuleRegistry)('refuses activation of $key before database access', async module => {
    const ensure = vi.spyOn(PlatformControlService, 'ensureCatalog');
    await expect(PlatformControlService.update(admin, module.key, change)).rejects.toMatchObject({ code: 'INTELLIGENCE_MODULE_NOT_READY' });
    expect(ensure).not.toHaveBeenCalled();
  });

  it('checks platform administrator identity before module readiness', async () => {
    await expect(PlatformControlService.update({ ...admin, isPlatformAdmin: false }, intelligenceModuleRegistry[0].key, change)).rejects.toMatchObject({ code: 'PLATFORM_ADMIN_REQUIRED' });
  });
});
