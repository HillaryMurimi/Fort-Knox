
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../config/env.js';
import { integrationConfig } from './config.js';
import { PlatformSwitch } from '../../database/models/PlatformSwitch.js';
import { getEmailProvider, ResendProvider, SendGridProvider, TwilioSmsProvider } from './messaging-providers.js';

const original = { provider: env.EMAIL_PROVIDER, sms: env.SMS_ENABLED, from: integrationConfig.email.from, name: integrationConfig.email.name,
  resend: integrationConfig.resend.apiKey, sendgrid: integrationConfig.sendgrid.apiKey };
beforeEach(() => {
  integrationConfig.email.from = 'security@example.test'; integrationConfig.email.name = 'Dapinni';
  integrationConfig.resend.apiKey = randomBytes(24).toString('hex');
  integrationConfig.sendgrid.apiKey = randomBytes(24).toString('hex');
  vi.spyOn(PlatformSwitch, 'findOne').mockReturnValue({ lean: async () => ({ enabled: true, mode: 'ON' }) } as never);
});
afterEach(() => {
  env.EMAIL_PROVIDER = original.provider; env.SMS_ENABLED = original.sms;
  integrationConfig.email.from = original.from; integrationConfig.email.name = original.name;
  integrationConfig.resend.apiKey = original.resend; integrationConfig.sendgrid.apiKey = original.sendgrid;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
describe('transactional messaging provider contracts', () => {
  it('selects Resend through the existing email provider factory', () => { env.EMAIL_PROVIDER = 'RESEND'; expect(getEmailProvider()).toBeInstanceOf(ResendProvider); });
  it('selects the existing SendGrid provider when configured', () => { env.EMAIL_PROVIDER = 'SENDGRID'; expect(getEmailProvider()).toBeInstanceOf(SendGridProvider); });
  it('sends branded text/HTML to Resend and reports acceptance separately from receipt', async () => {
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'receipt-reference' }), { status: 200 })); vi.stubGlobal('fetch', transport);
    const result = await new ResendProvider().send({ to: 'recipient@example.test', subject: 'Verification', body: 'Private verification text', html: '<p>Private verification text</p>' });
    expect(result).toEqual({ provider: 'RESEND', providerMessageId: 'receipt-reference', status: 'SENT' });
    expect(transport.mock.calls[0]?.[0]).toBe('https://api.resend.com/emails');
    const input = transport.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(input.body))).toEqual({ from: 'Dapinni <security@example.test>', to: ['recipient@example.test'], subject: 'Verification', text: 'Private verification text', html: '<p>Private verification text</p>' });
    expect(result.status).not.toBe('DELIVERED'); expect('raw' in result).toBe(false);
  });
  it('maps provider rejection to a safe status error without copying provider payloads', async () => {
    const privateMarker = randomBytes(24).toString('hex');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: privateMarker }), { status: 401 })));
    await expect(new ResendProvider().send({ to: 'recipient@example.test', body: 'Private message' })).rejects.toThrow(/^RESEND_401$/);
  });
  it('rejects a successful HTTP response without provider evidence', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    await expect(new ResendProvider().send({ to: 'recipient@example.test', body: 'Private message' })).rejects.toThrow('RESEND_RESPONSE_INVALID');
  });
  it('makes no SMS network request when the runtime SMS service is disabled', async () => {
    env.SMS_ENABLED = false; const transport = vi.fn(); vi.stubGlobal('fetch', transport);
    await expect(new TwilioSmsProvider().send({ to: '+254700008099', body: 'Private message' })).rejects.toMatchObject({ code: 'SERVICE_DISABLED' });
    expect(transport).not.toHaveBeenCalled();
  });
});
