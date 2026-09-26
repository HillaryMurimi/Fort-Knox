import { describe, expect, it } from 'vitest';
import { learnSchema, modelQuerySchema, predictionSchema } from './predictive-learning.schemas.js';

describe('predictive learning schemas', () => {
  it('defaults bounded learning controls', () => {
    expect(learnSchema.parse({}).horizonDays).toBe(30);
    expect(learnSchema.parse({}).minSamples).toBe(50);
  });
  it('requires finite numeric prediction features', () => {
    expect(predictionSchema.parse({ domain: 'ARREARS', features: { outstandingRatio: 0.4 } }).domain).toBe('ARREARS');
    expect(() => predictionSchema.parse({ domain: 'ARREARS', features: { x: Infinity } })).toThrow();
  });
  it('bounds model listing', () => {
    expect(modelQuerySchema.parse({}).limit).toBe(50);
    expect(() => modelQuerySchema.parse({ limit: 0 })).toThrow();
  });
});
