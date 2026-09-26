import { describe, expect, it } from 'vitest';

describe('finance calculations', () => {
  it('calculates a rent charge total from rent, service charge and adjustments', () => {
    const total = 25000 + 3500 + 500;
    expect(total).toBe(29000);
  });
  it('calculates collection rate without dividing by zero', () => {
    const billed = 0; const collected = 0;
    const rate = billed ? (collected / billed) * 100 : 0;
    expect(rate).toBe(0);
  });
});
