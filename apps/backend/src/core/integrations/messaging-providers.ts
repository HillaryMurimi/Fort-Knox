import { PRODUCT_NAME } from '../../config/brand.js';
import { env } from '../../config/env.js';
import { assertSwitchEnabled } from '../../modules/platform-control/platform-control.guard.js';
import { integrationConfig } from './config.js';
import { requestJson } from './http.js';
import type { EmailProvider, SmsProvider, WhatsAppProvider, MessageInput, MessageResult, ProviderKey } from './provider.types.js';

const timeout = () => AbortSignal.timeout(10_000);
export class SendGridProvider implements EmailProvider {
  readonly key: ProviderKey = 'SENDGRID';
  async send(input: MessageInput): Promise<MessageResult> { await assertSwitchEnabled('EMAIL_NOTIFICATIONS'); return this.sendProbe(input); }
  // Only the audited provider-test/operator service uses probes; they grant no authentication session.
  async sendProbe(input: MessageInput): Promise<MessageResult> {
    if (!env.EMAIL_ENABLED || !integrationConfig.sendgrid.apiKey || !integrationConfig.email.from) throw new Error('SENDGRID_NOT_CONFIGURED');
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST', signal: timeout(), headers: { authorization: 'Bearer ' + integrationConfig.sendgrid.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ personalizations: [{ to: [{ email: input.to }] }],
        from: { email: input.from ?? integrationConfig.email.from, name: integrationConfig.email.name },
        subject: input.subject ?? PRODUCT_NAME + ' notification',
        content: [{ type: 'text/plain', value: input.body }, ...(input.html ? [{ type: 'text/html', value: input.html }] : [])] })
    });
    if (!response.ok) throw new Error('SENDGRID_' + response.status);
    return { provider: this.key, providerMessageId: response.headers.get('x-message-id') ?? '', status: 'SENT' };
  }
}
export class ResendProvider implements EmailProvider {
  readonly key: ProviderKey = 'RESEND';
  async send(input: MessageInput): Promise<MessageResult> { await assertSwitchEnabled('EMAIL_NOTIFICATIONS'); return this.sendProbe(input); }
  async sendProbe(input: MessageInput): Promise<MessageResult> {
    if (!env.EMAIL_ENABLED || !integrationConfig.resend.apiKey || !integrationConfig.email.from) throw new Error('RESEND_NOT_CONFIGURED');
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', signal: timeout(), redirect: 'error',
      headers: { authorization: 'Bearer ' + integrationConfig.resend.apiKey, 'content-type': 'application/json', ...(input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : {}) },
      body: JSON.stringify({ from: integrationConfig.email.name + ' <' + (input.from ?? integrationConfig.email.from) + '>',
        to: [input.to], subject: input.subject ?? PRODUCT_NAME + ' notification', text: input.body, ...(input.html ? { html: input.html } : {}),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}), ...(input.salesMessageId ? { tags: [{ name: 'sales_message_id', value: input.salesMessageId }] } : {}),
        ...(input.listUnsubscribeUrl ? { headers: { 'List-Unsubscribe': '<' + input.listUnsubscribeUrl + '>' } } : {}) }) });
    if (!response.ok) throw new Error('RESEND_' + response.status);
    const result = await response.json() as { id?: string };
    if (!result.id) throw new Error('RESEND_RESPONSE_INVALID');
    return { provider: this.key, providerMessageId: result.id, status: 'SENT' };
  }
}
export class TwilioSmsProvider implements SmsProvider {
  readonly key: ProviderKey = 'TWILIO';
  async send(input: MessageInput): Promise<MessageResult> { await assertSwitchEnabled('SMS_NOTIFICATIONS'); return this.sendProbe(input); }
  async sendProbe(input: MessageInput): Promise<MessageResult> {
    const config = integrationConfig.twilio;
    const sender = input.from ?? integrationConfig.sms.from;
    // An explicit readiness test can run before enabling SMS authentication.
    if (!config.accountSid || !config.authToken || !sender) throw new Error('TWILIO_NOT_CONFIGURED');
    const auth = Buffer.from(config.accountSid + ':' + config.authToken).toString('base64');
    const response = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + config.accountSid + '/Messages.json', {
      method: 'POST', signal: timeout(), redirect: 'error', headers: { authorization: 'Basic ' + auth, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: input.to, From: sender, Body: input.body, ...(input.statusCallback ? { StatusCallback: input.statusCallback } : {}), ...(input.validityPeriodSeconds ? { ValidityPeriod: String(input.validityPeriodSeconds) } : {}) }) });
    if (!response.ok) throw new Error('TWILIO_' + response.status);
    const result = await response.json() as { sid?: string };
    if (!result.sid) throw new Error('TWILIO_RESPONSE_INVALID');
    return { provider: this.key, providerMessageId: result.sid, status: 'SENT' };
  }
}
export class WhatsAppCloudProvider implements WhatsAppProvider {
  readonly key: ProviderKey = 'WHATSAPP_CLOUD';
  async send(input: MessageInput): Promise<MessageResult> {
    await assertSwitchEnabled('WHATSAPP_NOTIFICATIONS');
    const config = integrationConfig.whatsapp;
    if (!config.phoneNumberId || !config.accessToken) throw new Error('WHATSAPP_NOT_CONFIGURED');
    const response = await requestJson<{ messages?: Array<{ id: string }> }>('https://graph.facebook.com/v20.0/' + config.phoneNumberId + '/messages', {
      method: 'POST', headers: { authorization: 'Bearer ' + config.accessToken },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: input.to, type: 'text', text: { body: input.body } }) });
    return { provider: this.key, providerMessageId: response.messages?.[0]?.id ?? '', status: 'SENT' };
  }
}
export function getEmailProvider() { return env.EMAIL_PROVIDER === 'RESEND' ? new ResendProvider() : new SendGridProvider(); }
export function getSmsProvider() { return new TwilioSmsProvider(); }
export function getWhatsAppProvider() { return new WhatsAppCloudProvider(); }
