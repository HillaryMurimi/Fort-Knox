import { describe, expect, it } from 'vitest';
import { actionQuerySchema, policySchema, tenantRiskQuerySchema, vacancyQuerySchema } from './decision-automation.schemas.js';

describe('decision automation schemas', () => {
  it('accepts bounded automation policy values', () => {
    expect(policySchema.parse({ enabled: true, evaluationIntervalMinutes: 60, escalationAfterMinutes: 120, notifyPriority: 'HIGH', forecastHorizonDays: 30 })).toMatchObject({ evaluationIntervalMinutes: 60 });
  });
  it('rejects an unsafe evaluation interval', () => {
    expect(() => policySchema.parse({ evaluationIntervalMinutes: 1 })).toThrow();
  });
  it('defaults action and forecast limits', () => {
    expect(actionQuerySchema.parse({}).limit).toBe(50);
    expect(tenantRiskQuerySchema.parse({}).limit).toBe(100);
    expect(vacancyQuerySchema.parse({}).limit).toBe(100);
  });
});
