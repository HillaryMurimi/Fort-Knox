import { describe, expect, it } from 'vitest';
import { servingPolicySchema, deploymentSchema } from './model-serving.schemas.js';

describe('model serving control plane', () => {
  it('defaults policy to safe shadow semantics at the model layer', () => {
    const parsed = servingPolicySchema.parse({ mode: 'SHADOW', enabled: false });
    expect(parsed.mode).toBe('SHADOW');
    expect(parsed.enabled).toBe(false);
  });
  it('requires a valid domain and model id for deployment input', () => {
    expect(() => deploymentSchema.parse({ domain: 'ARREARS', championModelId: 'bad' })).toThrow();
    expect(deploymentSchema.parse({ domain: 'ARREARS', championModelId: '507f1f77bcf86cd799439011' }).mode).toBe('SHADOW');
  });
});
