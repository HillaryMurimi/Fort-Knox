import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env.js';
import { supportedSalesTemplate, renderSalesTemplate, MetaSalesWhatsAppProvider } from '../../src/integrations/notifications/sales-whatsapp.provider.js';
import { verifySalesWhatsAppSignature, verifySalesWhatsAppChallenge } from '../../src/integrations/notifications/sales-whatsapp-webhook.js';
import { requestsWhatsAppOptOut } from '../../src/modules/sales/sales-whatsapp-webhook.service.js';
import { WhatsAppCloudProvider } from '../../src/core/integrations/messaging-providers.js';
import { integrationConfig } from '../../src/core/integrations/config.js';
import { PlatformSwitch } from '../../src/database/models/PlatformSwitch.js';
const original = { SALES_WHATSAPP_APP_SECRET: env.SALES_WHATSAPP_APP_SECRET, SALES_WHATSAPP_VERIFY_TOKEN: env.SALES_WHATSAPP_VERIFY_TOKEN };
afterEach(() => { Object.assign(env, original); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const template = { id: '123456789', name: 'dapinni_intro', language: 'en_US', status: 'APPROVED', category: 'MARKETING', components: [{ type: 'BODY', text: 'Dapinni: Hello {{1}}. Reply STOP to unsubscribe.' }] };
describe('Governed WhatsApp source and callback boundaries', () => {
  it('renders only reviewed source text and controlled values', () => {
    const source = supportedSalesTemplate(template)!;
    expect(renderSalesTemplate(source, ['CUSTOMER_NAME'], 'Jane Owner').text).toBe('Dapinni: Hello Jane Owner. Reply STOP to unsubscribe.');
    expect(() => renderSalesTemplate(source, [], 'Jane')).toThrow('placeholder');
    expect(() => renderSalesTemplate(source, ['CUSTOMER_NAME'], 'https://untrusted.test')).toThrow('customer label');
  });
  it.each([{ status: 'PAUSED' }, { category: 'UTILITY' }, { components: [{ type: 'BODY', text: 'Dapinni: {{2}} STOP' }] }, { components: [{ type: 'BODY', text: 'Dapinni: {{name}} STOP' }] }, { components: [{ type: 'BODY', text: 'Unbranded message STOP' }] }, { components: [{ type: 'HEADER', format: 'IMAGE' }, ...template.components] }])('rejects unsupported or unapproved templates', override => expect(supportedSalesTemplate({ ...template, ...override })).toBeNull());
  it('hashes source text so edits invalidate approval', () => {
    expect(supportedSalesTemplate(template)?.hash).not.toBe(supportedSalesTemplate({ ...template, components: [{ type: 'BODY', text: 'Dapinni: Changed {{1}} STOP' }] })?.hash);
  });
  it('verifies the exact raw body and rejects missing, modified and malformed signatures', () => {
    env.SALES_WHATSAPP_APP_SECRET = 'controlled-webhook-test-secret';
    const body = Buffer.from('{"message":"test"}'), signature = 'sha256=' + createHmac('sha256', env.SALES_WHATSAPP_APP_SECRET).update(body).digest('hex');
    expect(() => verifySalesWhatsAppSignature(body, signature)).not.toThrow();
    expect(() => verifySalesWhatsAppSignature(Buffer.from('{"message":"changed"}'), signature)).toThrow('signature');
    expect(() => verifySalesWhatsAppSignature(body, undefined)).toThrow('signature');
    expect(() => verifySalesWhatsAppSignature(body, 'sha256=invalid')).toThrow('signature');
  });
  it('requires the configured verification secret and bounded numeric challenge', () => {
    env.SALES_WHATSAPP_VERIFY_TOKEN = 'controlled-verification-token-for-tests';
    const query = { 'hub.mode': 'subscribe', 'hub.verify_token': env.SALES_WHATSAPP_VERIFY_TOKEN, 'hub.challenge': '123456' };
    expect(verifySalesWhatsAppChallenge(query)).toBe('123456');
    expect(() => verifySalesWhatsAppChallenge({ ...query, 'hub.verify_token': 'wrong' })).toThrow('verification');
    expect(() => verifySalesWhatsAppChallenge({ ...query, 'hub.challenge': '<script>' })).toThrow();
  });
  it('treats explicit stop as denial but does not confuse meeting cancellation with opt-out', () => {
    expect(requestsWhatsAppOptOut('STOP')).toBe(true); expect(requestsWhatsAppOptOut('unsubscribe')).toBe(true);
    expect(requestsWhatsAppOptOut('cancel')).toBe(false); expect(requestsWhatsAppOptOut('START')).toBe(false);
  });
  it('never follows provider pagination URLs and bounds catalogue pages', async () => {
    const prior = { WHATSAPP_PHONE_NUMBER_ID: env.WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN: env.WHATSAPP_ACCESS_TOKEN, SALES_WHATSAPP_BUSINESS_ACCOUNT_ID: env.SALES_WHATSAPP_BUSINESS_ACCOUNT_ID };
    Object.assign(env, { WHATSAPP_PHONE_NUMBER_ID: '123456789', WHATSAPP_ACCESS_TOKEN: 'controlled-token', SALES_WHATSAPP_BUSINESS_ACCOUNT_ID: '987654321', SALES_WHATSAPP_APP_SECRET: 'controlled-secret', SALES_WHATSAPP_VERIFY_TOKEN: 'controlled-verify' });
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [template], paging: { next: 'https://untrusted.test/private', cursors: { after: 'opaque-next-cursor' } } }), { status: 200 })); vi.stubGlobal('fetch', fetcher);
    try {
      const result = await new MetaSalesWhatsAppProvider().templates(); expect(result.truncated).toBe(true); expect(fetcher).toHaveBeenCalledTimes(3);
      for (const [url, options] of fetcher.mock.calls as unknown as [URL, RequestInit][]) { expect(url.origin).toBe('https://graph.facebook.com'); expect(url.pathname).toContain('/987654321/message_templates'); expect(options.redirect).toBe('error'); expect(url.searchParams.has('appsecret_proof')).toBe(true); }
    } finally { Object.assign(env, prior); }
  });
  it('uses the existing transport to send only the approved template payload and requires acceptance evidence', async () => {
    const previous = { ...integrationConfig.whatsapp };
    Object.assign(integrationConfig.whatsapp, { phoneNumberId: '123456789', accessToken: 'controlled-transport-token' });
    vi.spyOn(PlatformSwitch, 'findOne').mockReturnValue({ lean: async () => ({ enabled: true, mode: 'ON' }) } as never);
    const transport = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: 'wamid.controlled-test' }] }), { status: 200 })).mockResolvedValueOnce(new Response('{}', { status: 200 })); vi.stubGlobal('fetch', transport);
    const input = { to: '+254700002003', body: 'This arbitrary body must not be sent.', salesMessageId: 'a'.repeat(24), whatsappTemplate: { name: 'dapinni_intro', language: 'en_US', values: ['Jane Owner'] } };
    try {
      expect(await new WhatsAppCloudProvider().send(input)).toMatchObject({ providerMessageId: 'wamid.controlled-test', status: 'SENT' });
      const [url, options] = transport.mock.calls[0] as [string, RequestInit]; expect(url).toBe('https://graph.facebook.com/' + env.FACEBOOK_GRAPH_VERSION + '/123456789/messages'); expect(options.redirect).toBe('error');
      const body = JSON.parse(String(options.body)); expect(body.type).toBe('template'); expect(body.text).toBeUndefined(); expect(body.to).toBe('254700002003'); expect(body.biz_opaque_callback_data).toBe('a'.repeat(24));
      expect(body.template.components[0].parameters).toEqual([{ type: 'text', text: 'Jane Owner' }]);
      await expect(new WhatsAppCloudProvider().send(input)).rejects.toThrow();
    } finally { Object.assign(integrationConfig.whatsapp, previous); }
  });
});
