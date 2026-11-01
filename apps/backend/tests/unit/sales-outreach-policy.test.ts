import { describe, it, expect } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';
import { nextOutreachWindow, requestsSalesOptOut } from '../../src/modules/sales/sales-outreach.policy.js';
import { verifySalesResendWebhook } from '../../src/integrations/notifications/sales-resend-webhook.js';
import { boundedMailJson, normalizedMailbox } from '../../src/integrations/notifications/sales-inbound.provider.js';
import { createNotificationSchema } from '../../src/modules/notifications/notification.schemas.js';
import { Notification } from '../../src/database/models/Notification.js';
describe('Sales delivery windows and authenticated provider inputs', () => {
  it('reserves sales notifications while preserving required recipients for normal notifications', async () => {
    const normal = { recipientUserId: 'a'.repeat(24), channel: 'EMAIL', type: 'NORMAL', title: 'Account update', body: 'Normal operation' };
    expect(createNotificationSchema.safeParse(normal).success).toBe(true);
    expect(createNotificationSchema.safeParse({ ...normal, type: 'SALES_OUTREACH' }).success).toBe(false);
    expect(createNotificationSchema.safeParse({ ...normal, dedupeKey: 'sales-outreach:forged' }).success).toBe(false);
    await expect(new Notification({ channel: 'EMAIL', type: 'NORMAL', title: 'Account update', body: 'Normal operation' }).validate()).rejects.toThrow('recipientUserId');
    await expect(new Notification({ channel: 'EMAIL', type: 'SALES_OUTREACH', title: 'Sales', body: 'Sales' }).validate()).rejects.toThrow('salesMessageId');
  });
  it.each([
    ['2026-11-02T05:00:00Z', 'Africa/Nairobi', '2026-11-02T05:00:00.000Z'],
    ['2026-11-02T17:00:00Z', 'Africa/Nairobi', '2026-11-03T05:00:00.000Z'],
    ['2026-11-06T17:00:00Z', 'Africa/Nairobi', '2026-11-09T05:00:00.000Z'],
    ['2026-10-31T00:00:00Z', 'America/New_York', '2026-11-02T13:00:00.000Z'],
    ['2026-01-03T00:00:00Z', 'Asia/Kathmandu', '2026-01-05T02:15:00.000Z'],
  ])('schedules %s in %s using recipient-local weekday windows', (start, zone, expected) => { expect(nextOutreachWindow(new Date(start), zone).toISOString()).toBe(expected); });
  it('verifies exact raw bytes, signature rotation and bounded timestamps', () => {
    const key = randomBytes(32), secret = 'whsec_' + key.toString('base64'), now = Date.parse('2026-11-02T06:00:00Z'), id = 'msg_controlled_event_001';
    const body = Buffer.from('{"type":"email.sent","data":{"id":"controlled"}}');
    const signature = (timestamp: string, payload = body) => 'v1,' + createHmac('sha256', key).update(id + '.' + timestamp + '.').update(payload).digest('base64');
    const timestamp = String(now / 1000), headers = { id, timestamp, signature: 'v1,invalid ' + signature(timestamp) };
    expect(verifySalesResendWebhook(body, headers, secret, now)).toBe(id);
    expect(() => verifySalesResendWebhook(Buffer.concat([body, Buffer.from(' ')]), headers, secret, now)).toThrow();
    expect(() => verifySalesResendWebhook(body, { ...headers, id: 'msg_changed_event_001' }, secret, now)).toThrow();
    const old = String(now / 1000 - 301); expect(() => verifySalesResendWebhook(body, { id, timestamp: old, signature: signature(old) }, secret, now)).toThrow();
    expect(() => verifySalesResendWebhook(body, headers, undefined, now)).toThrow();
  });
  it('normalizes mailbox references and bounds provider content without fetching attachments', async () => {
    expect(normalizedMailbox('Public Business <OWNER@Example.com>')).toBe('owner@example.com');
    expect(normalizedMailbox('not an address')).toBeNull();
    expect(await boundedMailJson(new Response('{"text":"actual received content"}'))).toEqual({ text: 'actual received content' });
    await expect(boundedMailJson(new Response('x'.repeat(1048577)))).rejects.toMatchObject({ code: 'SALES_INBOUND_TOO_LARGE' });
  });
  it.each(['STOP', 'Please unsubscribe me', 'REMOVE ME FROM YOUR LIST.', 'Do not contact me again'])('recognizes explicit stop request %s', value => expect(requestsSalesOptOut(value)).toBe(true));
  it.each(['Please stop by the property tomorrow', 'Please send pricing.\n> unsubscribe me', 'To stop sales updates: https://example.com', 'Do not change my subscription'])('does not mistake ordinary or quoted content for opt-out: %s', value => expect(requestsSalesOptOut(value)).toBe(false));
});
