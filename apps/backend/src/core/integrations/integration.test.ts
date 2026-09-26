import {describe,expect,it} from 'vitest'; import crypto from 'node:crypto'; import {verifyHmacSignature} from './webhook.security.js'; import {withRetry} from './retry.js';
describe('external provider safety primitives',()=>{
 it('verifies HMAC signatures without accepting invalid signatures',()=>{const payload='hello';const secret='secret';const sig=crypto.createHmac('sha256',secret).update(payload).digest('hex');expect(verifyHmacSignature(payload,sig,secret)).toBe(true);expect(verifyHmacSignature(payload,'bad',secret)).toBe(false);});
 it('verifies Paystack SHA-512 signatures',()=>{const payload='{"event":"charge.success"}';const secret='sk_test_paystack';const sig=crypto.createHmac('sha512',secret).update(payload).digest('hex');expect(verifyHmacSignature(payload,sig,secret,'sha512')).toBe(true);expect(verifyHmacSignature(payload,'bad',secret,'sha512')).toBe(false);});
 it('retries transient provider failures with bounded attempts',async()=>{let attempts=0;const result=await withRetry(async()=>{attempts++;if(attempts<3)throw new Error('temporary');return 'ok';},{maxAttempts:3,baseDelayMs:1,maxDelayMs:2});expect(result).toBe('ok');expect(attempts).toBe(3);});
});
