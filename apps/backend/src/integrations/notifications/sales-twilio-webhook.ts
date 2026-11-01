import twilio from 'twilio';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/AppError.js';
import { salesTwilioCallbackUrl } from './sales-sms.policy.js';
export function verifySalesTwilioWebhook(raw: unknown, signature: string | undefined, messageId?: string) {
  if (!env.TWILIO_AUTH_TOKEN || !env.TWILIO_ACCOUNT_SID) throw new AppError(503, 'SALES_SMS_WEBHOOK_NOT_CONFIGURED', 'Twilio callback verification is unavailable');
  const parsed = z.record(z.string().max(80), z.string().max(10000)).safeParse(raw);
  if (!parsed.success || Object.keys(parsed.data).length > 100 || JSON.stringify(parsed.data).length > 100000) throw new AppError(400, 'WEBHOOK_PAYLOAD_INVALID', 'Invalid bounded SMS callback form');
  const params = parsed.data;
  // Validate every submitted field with the maintained SDK; never derive the URL from proxy headers.
  if (!signature || signature.length > 256 || params.AccountSid !== env.TWILIO_ACCOUNT_SID || !twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, salesTwilioCallbackUrl(messageId), params))
    throw new AppError(401, 'WEBHOOK_SIGNATURE_INVALID', 'Twilio callback signature, account or published URL is invalid');
  return params;
}
