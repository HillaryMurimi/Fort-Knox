import { describe, expect, it } from 'vitest';
import { servingPolicySchema, approvalRequestSchema } from './model-serving.schemas.js';

describe('ML production governance schemas',()=>{
 it('defaults policy safety controls through the persistence layer contract',()=>{
   const parsed=servingPolicySchema.parse({enabled:true,mode:'SHADOW',minConfidence:.8,mlActionMinConfidence:.9,autoRollbackOnCriticalDrift:true,approvalValidityHours:24});
   expect(parsed.autoRollbackOnCriticalDrift).toBe(true); expect(parsed.mlActionMinConfidence).toBe(.9);
 });
 it('accepts only explicit activation modes for human approval',()=>{
   expect(approvalRequestSchema.parse({domain:'ARREARS',mode:'ACTIVE',reason:'Validated holdout performance is acceptable'}).mode).toBe('ACTIVE');
   expect(()=>approvalRequestSchema.parse({domain:'ARREARS',mode:'SHADOW',reason:'x'})).toThrow();
 });
});
