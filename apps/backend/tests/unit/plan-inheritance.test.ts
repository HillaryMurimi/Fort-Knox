import { describe, expect, it } from 'vitest';
import { assertFortKnoxInheritsControl } from '../../src/modules/billing/plan-inheritance.js';

describe('Fort Knox plan inheritance', () => {
  it('accepts an exact superset of Control capabilities', () => {
    expect(() => assertFortKnoxInheritsControl({ features: ['finance', 'maintenance'] }, { features: ['finance', 'maintenance', 'security'] })).not.toThrow();
  });
  it('rejects missing Control capabilities or a missing Control catalog', () => {
    expect(() => assertFortKnoxInheritsControl({ features: ['finance', 'maintenance'] }, { features: ['finance', 'security'] })).toThrow('Fort Knox must include every Control capability');
    expect(() => assertFortKnoxInheritsControl(undefined, { features: ['security'] })).toThrow();
  });
});
