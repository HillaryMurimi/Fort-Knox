import { describe, expect, it } from 'vitest';
import { currency } from './presentation';

describe('currency presentation', () => {
  it('keeps the transaction currency while changing locale', () => {
    expect(currency(18500, 'KES', 'en-KE')).toContain('18,500');
    expect(currency(18500, 'KES', 'en-US')).toContain('KES');
    expect(currency(18500, 'KES', 'en-US')).toContain('18,500');
  });

  it('uses currency-specific fraction digits and rejects invalid inputs', () => {
    expect(currency(100, 'JPY', 'en-US')).not.toContain('.00');
    expect(currency(Number.NaN)).toBe('?');
  });
});
