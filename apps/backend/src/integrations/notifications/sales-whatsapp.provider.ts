import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/AppError.js';
import { readBoundedJson } from '../../core/integrations/http.js';
import { hashPayload } from '../../core/integrations/webhook.security.js';
export const waId = z.string().regex(/^\d{5,40}$/);
export const waBindingKinds = ['CUSTOMER_NAME', 'PLANS_URL', 'DEMO_URL'] as const;
export const waTemplateInput = z.object({ id: waId, name: z.string().regex(/^[a-z0-9_]{1,512}$/), language: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/), bindings: z.array(z.enum(waBindingKinds)).max(3).default([]) }).strict();
export type WaBinding = typeof waBindingKinds[number];
export interface SalesWaTemplate { id: string; name: string; language: string; category: 'MARKETING'; header: string; body: string; footer: string; buttons: { type: string; text: string; value: string }[]; parameters: number; hash: string }
export interface SalesWaSender { businessAccountId: string; phoneNumberId: string; phone: string; name: string; verified: true }
export interface SalesWhatsAppProvider { sender(): Promise<SalesWaSender>; templates(name?: string): Promise<{ items: SalesWaTemplate[]; truncated: boolean }>; template(input: { id: string; name: string; language: string }): Promise<SalesWaTemplate> }
export function salesWhatsAppConfigured() {
  return !!(waId.safeParse(env.WHATSAPP_PHONE_NUMBER_ID).success && env.WHATSAPP_ACCESS_TOKEN && env.SALES_WHATSAPP_BUSINESS_ACCOUNT_ID && env.SALES_WHATSAPP_APP_SECRET && env.SALES_WHATSAPP_VERIFY_TOKEN);
}
const component = z.object({ type: z.string().max(40), format: z.string().max(40).optional(), text: z.string().max(10000).optional(), buttons: z.array(z.object({ type: z.string().max(40), text: z.string().max(80), url: z.string().max(2048).optional(), phone_number: z.string().max(40).optional() })).max(10).optional() });
const sourceTemplate = z.object({ id: waId, name: z.string().regex(/^[a-z0-9_]{1,512}$/), language: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/), status: z.string().max(40), category: z.string().max(40), components: z.array(component).max(8) });
export function supportedSalesTemplate(raw: unknown): SalesWaTemplate | null {
  const parsed = sourceTemplate.safeParse(raw); if (!parsed.success) return null;
  const t = parsed.data;
  if (t.status !== 'APPROVED' || t.category !== 'MARKETING' || t.components.some(c => !['HEADER', 'BODY', 'FOOTER', 'BUTTONS'].includes(c.type))) return null;
  if (t.components.filter(c => c.type === 'BODY').length !== 1 || ['HEADER', 'FOOTER', 'BUTTONS'].some(type => t.components.filter(c => c.type === type).length > 1)) return null;
  const header = t.components.find(c => c.type === 'HEADER'), body = t.components.find(c => c.type === 'BODY')?.text ?? '', footer = t.components.find(c => c.type === 'FOOTER')?.text ?? '';
  if ((header && (header.format !== 'TEXT' || typeof header.text !== 'string')) || !body || t.components.some(c => c.type === 'FOOTER' && typeof c.text !== 'string') || t.components.some(c => c.type === 'BUTTONS' && !c.buttons) || /\{\{/.test((header?.text ?? '') + footer)) return null;
  const matches = [...body.matchAll(/\{\{(\d+)\}\}/g)], unique = [...new Set(matches.map(m => Number(m[1])))].sort((a, b) => a - b);
  if (unique.length > 3 || unique.some((n, i) => n !== i + 1) || matches.some(m => m[1] !== String(Number(m[1]))) || /\{\{|\}\}/.test(body.replace(/\{\{\d+\}\}/g, ''))) return null;
  const staticText = (header?.text ?? '') + '\n' + body.replace(/\{\{\d+\}\}/g, '') + '\n' + footer;
  if (!/dapinni/i.test(staticText) || !/\bSTOP\b/i.test(staticText) || staticText.length > 7500) return null;
  const buttons: SalesWaTemplate['buttons'] = [];
  for (const button of t.components.find(c => c.type === 'BUTTONS')?.buttons ?? []) {
    if (!['URL', 'PHONE_NUMBER', 'QUICK_REPLY'].includes(button.type) || /\{\{|\}\}/.test(JSON.stringify(button))) return null;
    let value = '';
    if (button.type === 'URL') { try { const url = new URL(button.url ?? ''); if (url.protocol !== 'https:' || url.username || url.password) return null; value = url.toString(); } catch { return null; } }
    if (button.type === 'PHONE_NUMBER') { if (!/^\+[1-9]\d{7,14}$/.test(button.phone_number ?? '')) return null; value = button.phone_number ?? ''; }
    buttons.push({ type: button.type, text: button.text, value });
  }
  const normalized = { id: t.id, name: t.name, language: t.language, category: 'MARKETING' as const, header: header?.text ?? '', body, footer, buttons, parameters: unique.length };
  return { ...normalized, hash: hashPayload(Buffer.from(JSON.stringify(normalized))) };
}
export function renderSalesTemplate(template: SalesWaTemplate, kinds: WaBinding[], customerName: string) {
  if (kinds.length !== template.parameters) throw new AppError(400, 'WHATSAPP_BINDINGS_REQUIRED', 'Choose one permitted value for every approved body placeholder');
  const values = kinds.map(kind => {
    if (kind === 'CUSTOMER_NAME') {
      if (!/^[\p{L}\p{M}\p{N} .,'&()_-]{2,80}$/u.test(customerName)) throw new AppError(400, 'WHATSAPP_CUSTOMER_LABEL_INVALID', 'The customer label is not suitable for a short template parameter');
      return customerName;
    }
    const url = new URL(kind === 'PLANS_URL' ? '/plans' : '/demo', env.WEB_ORIGIN);
    if (url.username || url.password || (env.NODE_ENV === 'production' && url.protocol !== 'https:')) throw new AppError(503, 'WHATSAPP_LINK_NOT_CONFIGURED', 'Configure the approved public website origin');
    return url.toString();
  });
  const body = template.body.replace(/\{\{(\d+)\}\}/g, (_, number: string) => values[Number(number) - 1] ?? '');
  const text = [template.header, body, template.footer, ...template.buttons.map(b => b.text + (b.value ? ': ' + b.value : ''))].filter(Boolean).join('\n\n');
  if (text.length > 8000) throw new AppError(400, 'WHATSAPP_TEMPLATE_TOO_LONG', 'The fully rendered template exceeds the reviewed content bound');
  return { text, values };
}
const page = z.object({ data: z.array(z.unknown()).max(100), paging: z.object({ cursors: z.object({ after: z.string().max(2048).optional() }).optional(), next: z.string().max(8192).optional() }).optional() });
export class MetaSalesWhatsAppProvider implements SalesWhatsAppProvider {
  private async list(edge: 'phone_numbers' | 'message_templates', fields: string, name?: string) {
    if (!salesWhatsAppConfigured()) throw new AppError(503, 'WHATSAPP_NOT_CONFIGURED', 'Configure the authorized WhatsApp Business account, sender and webhook secrets');
    const rows: unknown[] = []; let after: string | undefined, truncated = false;
    try {
      for (let n = 0; n < 3; n++) {
        const url = new URL('https://graph.facebook.com/' + env.FACEBOOK_GRAPH_VERSION + '/' + env.SALES_WHATSAPP_BUSINESS_ACCOUNT_ID + '/' + edge);
        url.searchParams.set('fields', fields); url.searchParams.set('limit', '100'); if (name) url.searchParams.set('name', name); if (after) url.searchParams.set('after', after);
        url.searchParams.set('appsecret_proof', createHmac('sha256', env.SALES_WHATSAPP_APP_SECRET ?? '').update(env.WHATSAPP_ACCESS_TOKEN ?? '').digest('hex'));
        const response = await fetch(url, { headers: { authorization: 'Bearer ' + env.WHATSAPP_ACCESS_TOKEN }, redirect: 'error', signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new AppError(503, 'WHATSAPP_PROVIDER_UNAVAILABLE', 'WhatsApp Business authorization or template lookup is unavailable');
        const result = page.parse(await readBoundedJson(response)); rows.push(...result.data);
        truncated = !!result.paging?.next; after = result.paging?.cursors?.after;
        if (!truncated || !after) break;
      }
      return { rows, truncated };
    } catch (error) { if (error instanceof AppError) throw error; throw new AppError(503, 'WHATSAPP_PROVIDER_UNAVAILABLE', 'WhatsApp Business returned unavailable or invalid metadata'); }
  }
  async sender(): Promise<SalesWaSender> {
    const rows = await this.list('phone_numbers', 'id,display_phone_number,verified_name,code_verification_status');
    const shape = z.object({ id: waId, display_phone_number: z.string().max(80), verified_name: z.string().max(160), code_verification_status: z.literal('VERIFIED') });
    for (const row of rows.rows) {
      const p = shape.safeParse(row); if (!p.success || p.data.id !== env.WHATSAPP_PHONE_NUMBER_ID) continue;
      const phone = '+' + p.data.display_phone_number.replace(/\D/g, '');
      if (!/^\+[1-9]\d{7,14}$/.test(phone)) continue;
      return { businessAccountId: env.SALES_WHATSAPP_BUSINESS_ACCOUNT_ID ?? '', phoneNumberId: p.data.id, phone, name: p.data.verified_name, verified: true };
    }
    throw new AppError(503, 'WHATSAPP_SENDER_NOT_VERIFIED', 'The configured sender is not a verified phone in the authorized business account');
  }
  async templates(name?: string) {
    if (name && !/^[a-z0-9_]{1,512}$/.test(name)) throw new AppError(400, 'WHATSAPP_TEMPLATE_NAME_INVALID', 'Invalid template name');
    const result = await this.list('message_templates', 'id,name,language,status,category,components', name);
    const items = [...new Map(result.rows.map(supportedSalesTemplate).filter((t): t is SalesWaTemplate => !!t).map(t => [t.id + ':' + t.language, t])).values()];
    return { items: items.slice(0, 50), truncated: result.truncated || items.length > 50 };
  }
  async template(input: { id: string; name: string; language: string }) {
    if (!/^[a-z0-9_]{1,512}$/.test(input.name) || !waId.safeParse(input.id).success) throw new AppError(400, 'WHATSAPP_TEMPLATE_NAME_INVALID', 'Invalid template identity');
    const result = await this.list('message_templates', 'id,name,language,status,category,components', input.name), value = result.rows.map(supportedSalesTemplate).find(t => t?.id === input.id && t.name === input.name && t.language === input.language);
    if (!value) throw new AppError(409, 'WHATSAPP_TEMPLATE_UNAVAILABLE', 'Select an approved, supported marketing template in this business account and language');
    return value;
  }
}
let testProvider: SalesWhatsAppProvider | undefined;
export function setSalesWhatsAppTestProvider(provider?: SalesWhatsAppProvider) { if (env.NODE_ENV !== 'test') throw new Error('TEST_PROVIDER_FORBIDDEN'); testProvider = provider; }
export function salesWhatsAppProvider(): SalesWhatsAppProvider | undefined { return env.NODE_ENV === 'test' ? testProvider : salesWhatsAppConfigured() ? new MetaSalesWhatsAppProvider() : undefined; }
