import { env } from '../../config/env.js';
import { ResendProvider, TwilioSmsProvider, WhatsAppCloudProvider } from '../../core/integrations/messaging-providers.js';
import { salesSmsConfigured, salesTwilioCallbackUrl } from './sales-sms.policy.js';
import { salesWhatsAppConfigured } from './sales-whatsapp.provider.js';
import type { MessageInput, MessageResult } from '../../core/integrations/provider.types.js';
import { assertSwitchEnabled } from '../../modules/platform-control/platform-control.guard.js';
import { AppError } from '../../core/errors/AppError.js';
export interface SalesDeliveryProvider {
  readonly key: string;
  readonly idempotencyHours: number;
  readonly minimumIntervalMs: number;
  send(input: MessageInput): Promise<MessageResult>;
}
class ResendSalesDelivery implements SalesDeliveryProvider {
  readonly key = 'RESEND'; readonly idempotencyHours = 23;
  get minimumIntervalMs() { return Math.ceil(60000 / env.SALES_EMAIL_REQUESTS_PER_MINUTE); }
  async send(input: MessageInput) {
    await assertSwitchEnabled('SALES_OUTBOUND'); await assertSwitchEnabled('SALES_EMAIL');
    if (!input.idempotencyKey || !input.salesMessageId) throw new AppError(409, 'OUTREACH_IDEMPOTENCY_REQUIRED', 'Sales delivery requires a stable approved message identity');
    return new ResendProvider().send(input);
  }
}
export class TwilioSalesDelivery implements SalesDeliveryProvider {
  readonly key = 'TWILIO'; readonly idempotencyHours = 0;
  get minimumIntervalMs() { return Math.ceil(60000 / env.SALES_SMS_REQUESTS_PER_MINUTE); }
  async send(input: MessageInput) {
    await assertSwitchEnabled('SALES_OUTBOUND'); await assertSwitchEnabled('SALES_SMS');
    if (!salesSmsConfigured() || !input.salesMessageId || input.from !== env.SALES_SMS_FROM) throw new AppError(503, 'SALES_SMS_NOT_CONFIGURED', 'Sales SMS requires a dedicated reviewed two-way sender and signed callback route');
    return new TwilioSmsProvider().send({ ...input, statusCallback: salesTwilioCallbackUrl(input.salesMessageId), validityPeriodSeconds: 300 });
  }
}
const testProviders = new Map<string, SalesDeliveryProvider>();
export class MetaSalesDelivery implements SalesDeliveryProvider {
  readonly key = 'WHATSAPP_CLOUD'; readonly idempotencyHours = 0;
  get minimumIntervalMs() { return Math.ceil(60000 / env.SALES_WHATSAPP_REQUESTS_PER_MINUTE); }
  async send(input: MessageInput) {
    await assertSwitchEnabled('SALES_OUTBOUND'); await assertSwitchEnabled('SALES_WHATSAPP');
    if (!salesWhatsAppConfigured() || !input.salesMessageId || !input.whatsappTemplate) throw new AppError(503, 'WHATSAPP_NOT_CONFIGURED', 'Sales WhatsApp requires an approved template and authorized business configuration');
    return new WhatsAppCloudProvider().send(input);
  }
}
export function setSalesDeliveryTestProvider(provider?: SalesDeliveryProvider, channel = 'EMAIL') {
  if (env.NODE_ENV !== 'test') throw new Error('TEST_PROVIDER_FORBIDDEN');
  if (provider) testProviders.set(channel, provider); else testProviders.delete(channel);
}
export function salesDeliveryProvider(channel: string): SalesDeliveryProvider | undefined {
  if (env.NODE_ENV === 'test') return testProviders.get(channel);
  if (channel === 'EMAIL' && env.EMAIL_ENABLED && env.EMAIL_PROVIDER === 'RESEND' && env.RESEND_API_KEY && env.EMAIL_FROM) return new ResendSalesDelivery();
  if (channel === 'SMS' && env.SMS_ENABLED && salesSmsConfigured()) return new TwilioSalesDelivery();
  if (channel === 'WHATSAPP' && salesWhatsAppConfigured()) return new MetaSalesDelivery();
  return undefined;
}
