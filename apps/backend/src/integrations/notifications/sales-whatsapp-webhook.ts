import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/AppError.js';
import { z } from 'zod';

export function verifySalesWhatsAppSignature(body: Buffer | undefined, signature: string | undefined) {
  if (!env.SALES_WHATSAPP_APP_SECRET) throw new AppError(503, 'WHATSAPP_WEBHOOK_NOT_CONFIGURED', 'WhatsApp callback verification is unavailable');
  if (!body || body.length > 1048576 || !signature || !/^sha256=[a-f\d]{64}$/.test(signature)) throw new AppError(401, 'WHATSAPP_SIGNATURE_INVALID', 'Invalid callback signature');
  const expected = createHmac('sha256', env.SALES_WHATSAPP_APP_SECRET).update(body).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))) throw new AppError(401, 'WHATSAPP_SIGNATURE_INVALID', 'Invalid callback signature');
}
export function verifySalesWhatsAppChallenge(raw: unknown) {
  const query = z.object({ 'hub.mode': z.literal('subscribe'), 'hub.verify_token': z.string().max(256), 'hub.challenge': z.string().regex(/^\d{1,100}$/) }).strict().parse(raw);
  const token = env.SALES_WHATSAPP_VERIFY_TOKEN;
  if (!token) throw new AppError(503, 'WHATSAPP_WEBHOOK_NOT_CONFIGURED', 'WhatsApp callback verification is unavailable');
  const expected = Buffer.from(token), supplied = Buffer.from(query['hub.verify_token']);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new AppError(401, 'WHATSAPP_CHALLENGE_INVALID', 'Invalid verification request');
  return query['hub.challenge'];
}
