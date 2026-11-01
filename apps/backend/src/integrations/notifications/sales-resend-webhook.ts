import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../../core/errors/AppError.js';
export interface ResendSignatureHeaders { id?: string; timestamp?: string; signature?: string }
export function verifySalesResendWebhook(body: Buffer, headers: ResendSignatureHeaders, secret: string | undefined, now = Date.now()) {
  if (!secret) throw new AppError(503, 'SALES_WEBHOOK_NOT_CONFIGURED', 'Sales webhook verification is not configured');
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  if (!secret.startsWith('whsec_') || key.length < 24) throw new AppError(503, 'SALES_WEBHOOK_NOT_CONFIGURED', 'Sales webhook verification is not configured');
  const { id, timestamp, signature } = headers;
  if (!body.length || body.length > 262144 || !id || !/^[\w-]{8,160}$/.test(id) || !timestamp || !/^\d{10,12}$/.test(timestamp) || !signature || signature.length > 4096 || Math.abs(now / 1000 - Number(timestamp)) > 300)
    throw new AppError(401, 'WEBHOOK_SIGNATURE_INVALID', 'Webhook signature or timestamp is invalid');
  const expected = createHmac('sha256', key).update(id + '.' + timestamp + '.').update(body).digest();
  const valid = signature.split(/\s+/).some(value => {
    if (!/^v1,[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
    const provided = Buffer.from(value.slice(3), 'base64');
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  });
  if (!valid) throw new AppError(401, 'WEBHOOK_SIGNATURE_INVALID', 'Webhook signature or timestamp is invalid');
  return id;
}
