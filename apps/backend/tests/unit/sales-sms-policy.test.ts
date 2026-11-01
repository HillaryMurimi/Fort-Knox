import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env.js';
import { salesSmsSize, salesSmsBody, salesSmsConfigured, salesTwilioCallbackUrl, requestsSmsOptOut } from '../../src/integrations/notifications/sales-sms.policy.js';
import { verifySalesTwilioWebhook } from '../../src/integrations/notifications/sales-twilio-webhook.js';
import { TwilioSalesInbound, salesSmsInboundProvider, setSalesSmsInboundTestProvider } from '../../src/integrations/notifications/sales-sms-inbound.provider.js';
import { TwilioSalesDelivery, salesDeliveryProvider } from '../../src/integrations/notifications/sales-delivery.provider.js';
import { integrationConfig } from '../../src/core/integrations/config.js';
import { PlatformSwitch } from '../../src/database/models/PlatformSwitch.js';
const original = { PUBLIC_API_URL: env.PUBLIC_API_URL, SALES_SMS_FROM: env.SALES_SMS_FROM, SMS_FROM: env.SMS_FROM, TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN, SALES_SMS_MAX_SEGMENTS: env.SALES_SMS_MAX_SEGMENTS, SMS_ENABLED: env.SMS_ENABLED };
const core = { ...integrationConfig.twilio, sender: integrationConfig.sms.from };
afterEach(() => { Object.assign(env, original); vi.restoreAllMocks(); vi.unstubAllGlobals(); setSalesSmsInboundTestProvider(); integrationConfig.twilio.accountSid = core.accountSid; integrationConfig.twilio.authToken = core.authToken; integrationConfig.sms.from = core.sender; });
const configure = () => Object.assign(env, { PUBLIC_API_URL: 'https://api.example.test', SALES_SMS_FROM: '+254700001001', SMS_FROM: '+254700001002', TWILIO_ACCOUNT_SID: 'AC' + 'a'.repeat(32), TWILIO_AUTH_TOKEN: 'controlled-signature-test-token', SALES_SMS_MAX_SEGMENTS: 2, SMS_ENABLED: true });
describe('Sales SMS encoding and signed callback boundaries', () => {
  it.each([['a'.repeat(160), 'GSM7', 1], ['a'.repeat(161), 'GSM7', 2], ['^'.repeat(80), 'GSM7', 1], ['^'.repeat(81), 'GSM7', 2], ['漢'.repeat(70), 'UCS2', 1], ['漢'.repeat(71), 'UCS2', 2], ['😀'.repeat(36), 'UCS2', 2]])('counts encoded segments without truncating content', (text, encoding, segments) => { expect(salesSmsSize(String(text))).toMatchObject({ encoding, segments }); });
  it('includes brand and opt-out text within the limit and rejects excess rather than truncating', () => {
    configure(); expect(salesSmsBody('Requested briefing')).toMatchObject({ text: 'Dapinni: Requested briefing\nReply STOP to opt out.', segments: 1 });
    expect(() => salesSmsBody('a'.repeat(306))).toThrow('segment ceiling');
    expect(() => salesSmsBody('Invalid \uD800 text')).toThrow('well-formed Unicode');
  });
  it('requires a dedicated two-way sales sender and constructs a fixed public URL', () => {
    configure(); expect(salesSmsConfigured()).toBe(true);
    expect(salesTwilioCallbackUrl('b'.repeat(24))).toBe('https://api.example.test/api/v1/sales/outreach/webhooks/twilio?messageId=' + 'b'.repeat(24));
    env.SALES_SMS_FROM = env.SMS_FROM; expect(salesSmsConfigured()).toBe(false);
  });
  it('validates every form field using an independently signed test vector and the configured URL', () => {
    configure(); const reference = 'b'.repeat(24), params = { AccountSid: env.TWILIO_ACCOUNT_SID!, MessageSid: 'SM' + 'c'.repeat(32), MessageStatus: 'delivered', FutureField: 'must also be signed' };
    const sign = (url: string) => createHmac('sha1', env.TWILIO_AUTH_TOKEN!).update(url + Object.keys(params).sort().map(k => k + params[k as keyof typeof params]).join('')).digest('base64');
    const signature = sign(salesTwilioCallbackUrl(reference)); expect(verifySalesTwilioWebhook(params, signature, reference)).toEqual(params);
    expect(() => verifySalesTwilioWebhook({ ...params, FutureField: 'altered' }, signature, reference)).toThrow('signature');
    expect(() => verifySalesTwilioWebhook(params, signature, 'd'.repeat(24))).toThrow('signature');
    expect(() => verifySalesTwilioWebhook(params, sign('https://untrusted.example.test/callback'), reference)).toThrow('signature');
    expect(() => verifySalesTwilioWebhook(params, undefined, reference)).toThrow('signature');
  });
  it.each(['STOP', 'STOPALL', 'END', 'QUIT', 'CANCEL', 'REVOKE', 'OPTOUT', 'unsubscribe'])('honors native SMS stop words', word => expect(requestsSmsOptOut(word)).toBe(true));
  it('does not interpret general conversation or provider START as fresh consent', () => { expect(requestsSmsOptOut('Please stop by tomorrow')).toBe(false); expect(requestsSmsOptOut('START', 'START')).toBe(false); });
  it('retrieves only a fixed SMS record, bounds text and does not fetch attachments', async () => {
    configure(); const id = 'SM' + 'c'.repeat(32), transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sid: id, account_sid: env.TWILIO_ACCOUNT_SID, from: '+254700001003', to: env.SALES_SMS_FROM, direction: 'inbound', body: 'x'.repeat(11000), date_created: 'Sun, 01 Nov 2026 08:00:00 +0000', media_url: 'http://127.0.0.1/private' })));
    vi.stubGlobal('fetch', transport); const result = await new TwilioSalesInbound().retrieve(id);
    expect(result.text).toHaveLength(10000); expect(result.truncated).toBe(true); expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[0]).toBe('https://api.twilio.com/2010-04-01/Accounts/' + env.TWILIO_ACCOUNT_SID + '/Messages/' + id + '.json');
    expect(salesSmsInboundProvider()).toBeUndefined();
  });
  it('reuses the existing Twilio provider with a dedicated sender, callback and bounded queue validity', async () => {
    configure(); integrationConfig.twilio.accountSid = env.TWILIO_ACCOUNT_SID; integrationConfig.twilio.authToken = env.TWILIO_AUTH_TOKEN; integrationConfig.sms.from = env.SMS_FROM;
    vi.spyOn(PlatformSwitch, 'findOne').mockReturnValue({ lean: async () => ({ enabled: true, mode: 'ON' }) } as never);
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sid: 'SM' + 'd'.repeat(32), status: 'queued' }), { status: 201 })); vi.stubGlobal('fetch', transport);
    const provider = new TwilioSalesDelivery(), result = await provider.send({ from: env.SALES_SMS_FROM, to: '+254700001003', body: 'Dapinni: Requested briefing. Reply STOP to opt out.', salesMessageId: 'b'.repeat(24), idempotencyKey: 'internal-message-reference' });
    expect(provider.idempotencyHours).toBe(0); expect(result.status).toBe('SENT');
    const request = transport.mock.calls[0]?.[1] as RequestInit, body = request.body as URLSearchParams;
    expect(request.redirect).toBe('error'); expect(body.get('From')).toBe(env.SALES_SMS_FROM); expect(body.get('StatusCallback')).toBe(salesTwilioCallbackUrl('b'.repeat(24))); expect(body.get('ValidityPeriod')).toBe('300');
    expect(request.headers).not.toHaveProperty('Idempotency-Key'); expect(salesDeliveryProvider('SMS')).toBeUndefined();
  });
});
