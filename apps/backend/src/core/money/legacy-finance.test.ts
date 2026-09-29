import { describe, expect, it } from 'vitest';
import { addMinorUnits, legacyMajorUnits, legacyMinorUnits } from './legacy-finance.js';

describe('legacy finance minor-unit boundary', () => {
  it('uses exact KES cents for addition and subtraction', () => {
    const total = addMinorUnits(legacyMinorUnits(0.1, 'KES'), legacyMinorUnits(0.2, 'KES'));
    expect(total).toBe(30);
    expect(legacyMajorUnits(total, 'KES')).toBe(0.3);
    expect(legacyMajorUnits(total - legacyMinorUnits(0.1, 'KES'), 'KES')).toBe(0.2);
  });

  it('rejects excess precision and unsafe totals', () => {
    expect(() => legacyMinorUnits(1.001, 'KES')).toThrow('Amount is not representable');
    expect(() => addMinorUnits(Number.MAX_SAFE_INTEGER, 1)).toThrow('outside the safe integer range');
    expect(() => legacyMajorUnits(0.5, 'KES')).toThrow('outside the safe integer range');
  });
});
