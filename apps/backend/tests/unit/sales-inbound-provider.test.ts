import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { env } from '../../src/config/env.js';
import { ResendSalesInbound, salesInboundProvider, setSalesInboundTestProvider } from '../../src/integrations/notifications/sales-inbound.provider.js';
const original = env.RESEND_API_KEY;
afterEach(() => { vi.unstubAllGlobals(); env.RESEND_API_KEY = original; setSalesInboundTestProvider(); });
describe('bounded sales receiving adapter', () => {
  it('retrieves only a fixed authenticated provider endpoint and retains domain authentication separately', async () => {
    env.RESEND_API_KEY = 'controlled-adapter-test-key'; const id = randomUUID();
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id, to: ['sales-alias@example.test'], from: 'Owner <OWNER@example.test>', subject: 'Reply', text: 'Requested details', created_at: '2026-11-01T00:00:00Z', authentication: { dmarc: 'pass' } })));
    vi.stubGlobal('fetch', fetch);
    const result = await new ResendSalesInbound().retrieve(id);
    expect(result).toMatchObject({ id, from: 'owner@example.test', text: 'Requested details', domainAuthenticated: true, truncated: false });
    expect(fetch).toHaveBeenCalledWith('https://api.resend.com/emails/receiving/' + id, expect.objectContaining({ redirect: 'error', headers: { authorization: 'Bearer controlled-adapter-test-key' } }));
  });
  it('bounds content and does not fetch attachments or raw message URLs', async () => {
    env.RESEND_API_KEY = 'controlled-adapter-test-key'; const id = randomUUID();
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id, to: [], from: 'owner@example.test', subject: 'x'.repeat(500), text: 'x'.repeat(20000), created_at: '2026-11-01T00:00:00Z', attachments: [{ url: 'http://127.0.0.1/private' }], raw: { download_url: 'http://127.0.0.1/secret' } })));
    vi.stubGlobal('fetch', fetch); const result = await new ResendSalesInbound().retrieve(id);
    expect(result.subject).toHaveLength(200); expect(result.text).toHaveLength(10000); expect(result.truncated).toBe(true); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects a mismatched returned identity and safely hides provider error bodies', async () => {
    env.RESEND_API_KEY = 'controlled-adapter-test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('provider credential diagnostic', { status: 401 })));
    await expect(new ResendSalesInbound().retrieve(randomUUID())).rejects.toMatchObject({ code: 'SALES_INBOUND_UNAVAILABLE', message: 'Incoming email content could not be retrieved' });
  });
  it('never uses live credentials as a test fallback and rejects arbitrary request identifiers', async () => {
    env.RESEND_API_KEY = 'controlled-adapter-test-key'; expect(salesInboundProvider()).toBeUndefined();
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(new ResendSalesInbound().retrieve('https://attacker.example/path')).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
  });
});
