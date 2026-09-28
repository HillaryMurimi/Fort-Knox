import { describe, expect, it } from 'vitest';
import { addMoney, moneyFromMajorUnits } from './money.js';

describe('money', () => {
  it('converts different ISO currency scales to exact minor units', () => {
    expect(moneyFromMajorUnits(1200.5, 'kes')).toEqual({ minorUnits: 120050, currency: 'KES' });
    expect(moneyFromMajorUnits(1200, 'JPY')).toEqual({ minorUnits: 1200, currency: 'JPY' });
    expect(moneyFromMajorUnits(1.234, 'KWD')).toEqual({ minorUnits: 1234, currency: 'KWD' });
  });

  it('rejects precision loss and unsafe amounts', () => {
    expect(() => moneyFromMajorUnits(1.001, 'KES')).toThrow('INVALID_MONEY_AMOUNT');
    expect(() => moneyFromMajorUnits(Number.MAX_SAFE_INTEGER, 'KES')).toThrow('INVALID_MONEY_AMOUNT');
    expect(() => moneyFromMajorUnits(1, 'NOPE')).toThrow('INVALID_CURRENCY');
  });

  it('only adds safe values in the same currency', () => {
    expect(addMoney(moneyFromMajorUnits(1.25, 'KES'), moneyFromMajorUnits(2, 'KES'))).toEqual({ minorUnits: 325, currency: 'KES' });
    expect(() => addMoney(moneyFromMajorUnits(1, 'KES'), moneyFromMajorUnits(1, 'USD'))).toThrow('CURRENCY_MISMATCH');
  });
});
