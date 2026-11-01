import { env } from '../../config/env.js';
import { ResendProvider } from '../../core/integrations/messaging-providers.js';
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
let testProvider: SalesDeliveryProvider | undefined;
export function setSalesDeliveryTestProvider(provider?: SalesDeliveryProvider) {
  if (env.NODE_ENV !== 'test') throw new Error('TEST_PROVIDER_FORBIDDEN');
  testProvider = provider;
}
export function salesDeliveryProvider(channel: string): SalesDeliveryProvider | undefined {
  if (env.NODE_ENV === 'test') return testProvider;
  if (channel === 'EMAIL' && env.EMAIL_ENABLED && env.EMAIL_PROVIDER === 'RESEND' && env.RESEND_API_KEY && env.EMAIL_FROM) return new ResendSalesDelivery();
  return undefined;
}
