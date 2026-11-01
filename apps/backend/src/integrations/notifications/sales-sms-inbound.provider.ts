import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/AppError.js';
import { boundedMailJson } from './sales-inbound.provider.js';
export const twilioMessageSid = z.string().regex(/^(?:SM|MM)[a-f\d]{32}$/i);
const record = z.object({ sid: twilioMessageSid, account_sid: z.string().regex(/^AC[a-f\d]{32}$/i), from: z.string().regex(/^\+[1-9]\d{7,14}$/), to: z.string().regex(/^\+[1-9]\d{7,14}$/), body: z.string().max(100000), direction: z.literal('inbound'), date_created: z.coerce.date() });
export interface ReceivedSalesSms { id: string; from: string; to: string; text: string; occurredAt: Date; truncated: boolean }
export interface SalesSmsInboundProvider { retrieve(id: string): Promise<ReceivedSalesSms> }
export class TwilioSalesInbound implements SalesSmsInboundProvider {
  async retrieve(raw: string) {
    const id = twilioMessageSid.parse(raw);
    if (!/^AC[a-f\d]{32}$/i.test(env.TWILIO_ACCOUNT_SID ?? '') || !env.TWILIO_AUTH_TOKEN) throw new AppError(503, 'SALES_SMS_INBOUND_NOT_CONFIGURED', 'Sales SMS receiving is unavailable');
    try {
      const response = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + env.TWILIO_ACCOUNT_SID + '/Messages/' + id + '.json', { headers: { authorization: 'Basic ' + Buffer.from(env.TWILIO_ACCOUNT_SID + ':' + env.TWILIO_AUTH_TOKEN).toString('base64') }, signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (!response.ok) throw new Error('Unavailable received SMS');
      const sms = record.parse(await boundedMailJson(response));
      if (sms.sid !== id || sms.account_sid !== env.TWILIO_ACCOUNT_SID) throw new Error('SMS identity mismatch');
      return { id, from: sms.from, to: sms.to, text: sms.body.slice(0, 10000), occurredAt: sms.date_created, truncated: sms.body.length > 10000 };
    } catch { throw new AppError(503, 'SALES_SMS_INBOUND_UNAVAILABLE', 'Sales SMS content is unavailable or invalid'); }
  }
}
let testProvider: SalesSmsInboundProvider | undefined;
export function setSalesSmsInboundTestProvider(provider?: SalesSmsInboundProvider) {
  if (env.NODE_ENV !== 'test') throw new Error('TEST_PROVIDER_FORBIDDEN'); testProvider = provider;
}
export function salesSmsInboundProvider() { return env.NODE_ENV === 'test' ? testProvider : env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN ? new TwilioSalesInbound() : undefined; }
