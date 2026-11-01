import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/AppError.js';
export interface ReceivedSalesEmail {
  id: string; to: string[]; from: string; subject: string; text: string; occurredAt: Date;
  domainAuthenticated: boolean; truncated: boolean;
}
export interface SalesInboundProvider { retrieve(id: string): Promise<ReceivedSalesEmail> }
const receivedSchema = z.object({
  id: z.uuid(), to: z.array(z.string().max(320)).max(50), received_for: z.array(z.string().max(320)).max(50).optional(),
  from: z.string().max(1000), subject: z.string().max(2000), created_at: z.iso.datetime({ offset: true }),
  text: z.string().max(1000000).nullable().optional(), html: z.string().max(1000000).nullable().optional(),
  authentication: z.object({ dmarc: z.string().max(40).optional() }).optional(),
});
export function normalizedMailbox(value: string) {
  const address = (value.match(/<([^<>]+)>\s*$/)?.[1] ?? value).trim().toLowerCase();
  return z.email().max(320).safeParse(address).success ? address : null;
}
export async function boundedMailJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new AppError(503, 'SALES_INBOUND_UNAVAILABLE', 'Incoming email content is unavailable');
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 1048576) { await reader.cancel(); throw new AppError(413, 'SALES_INBOUND_TOO_LARGE', 'Incoming content exceeded the safe retrieval limit'); }
      chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally { reader.releaseLock(); }
}
export class ResendSalesInbound implements SalesInboundProvider {
  async retrieve(raw: string): Promise<ReceivedSalesEmail> {
    const id = z.uuid().parse(raw);
    if (!env.RESEND_API_KEY) throw new AppError(503, 'SALES_INBOUND_NOT_CONFIGURED', 'Business email receiving is not configured');
    try {
      const response = await fetch('https://api.resend.com/emails/receiving/' + id, { headers: { authorization: 'Bearer ' + env.RESEND_API_KEY }, signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (!response.ok) throw new AppError(503, 'SALES_INBOUND_UNAVAILABLE', 'Incoming email content could not be retrieved');
      const data = receivedSchema.parse(await boundedMailJson(response));
      if (data.id !== id) throw new Error('Incoming email identity mismatch');
      const from = normalizedMailbox(data.from); if (!from) throw new Error('Invalid sender');
      const source = data.text ?? (data.html ?? '').slice(0, 20000).replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<(br|\/p|\/div)[^>]*>/gi, '\n').replace(/<[^>]*>/g, ' ');
      return { id, to: [...data.to, ...(data.received_for ?? [])].map(normalizedMailbox).filter((v): v is string => !!v), from, subject: data.subject.slice(0, 200), text: source.slice(0, 10000), occurredAt: new Date(data.created_at), domainAuthenticated: data.authentication?.dmarc === 'pass', truncated: source.length > 10000 || (!data.text && (data.html?.length ?? 0) > 20000) };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(503, 'SALES_INBOUND_UNAVAILABLE', 'Incoming email returned unavailable or invalid content');
    }
  }
}
let testProvider: SalesInboundProvider | undefined;
export function setSalesInboundTestProvider(provider?: SalesInboundProvider) {
  if (env.NODE_ENV !== 'test') throw new Error('TEST_PROVIDER_FORBIDDEN'); testProvider = provider;
}
export function salesInboundProvider(): SalesInboundProvider | undefined {
  if (env.NODE_ENV === 'test') return testProvider;
  return env.RESEND_API_KEY ? new ResendSalesInbound() : undefined;
}
