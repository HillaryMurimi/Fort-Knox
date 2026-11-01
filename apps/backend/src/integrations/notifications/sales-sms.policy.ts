import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/AppError.js';
import { requestsSalesOptOut } from '../../modules/sales/sales-outreach.policy.js';
// GSM extension-table characters consume two septets; Unicode uses UTF-16 code units.
const basic = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const extended = '^{}\\[~]|€\f';
export function salesSmsSize(text: string) {
  let septets = 0, gsm = true;
  for (const char of text) { if (basic.includes(char)) septets += 1; else if (extended.includes(char)) septets += 2; else { gsm = false; break; } }
  const units = gsm ? septets : text.length, single = gsm ? 160 : 70, multipart = gsm ? 153 : 67;
  return { encoding: gsm ? 'GSM7' as const : 'UCS2' as const, units, segments: units <= single ? 1 : Math.ceil(units / multipart) };
}
export function salesSmsBody(body: string) {
  if (/[\uD800-\uDFFF]/u.test(body)) throw new AppError(400, 'SALES_SMS_INVALID_TEXT', 'SMS text must contain well-formed Unicode so the reviewed text matches transport encoding');
  const text = 'Dapinni: ' + body.trim() + '\nReply STOP to opt out.', size = salesSmsSize(text);
  if (size.segments > env.SALES_SMS_MAX_SEGMENTS) throw new AppError(400, 'SALES_SMS_TOO_LONG', 'The complete branded message exceeds the configured SMS segment ceiling');
  return { text, ...size };
}
export function salesTwilioCallbackUrl(messageId?: string) {
  if (!env.PUBLIC_API_URL) throw new AppError(503, 'SALES_SMS_CALLBACK_NOT_CONFIGURED', 'Configure the public HTTPS API origin for signed sales SMS callbacks');
  const url = new URL(env.PUBLIC_API_URL);
  if (url.username || url.password) throw new AppError(503, 'SALES_SMS_CALLBACK_NOT_CONFIGURED', 'The public callback origin must not contain credentials');
  if (env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new AppError(503, 'SALES_SMS_CALLBACK_NOT_CONFIGURED', 'The public callback requires HTTPS');
  url.pathname = env.API_PREFIX.replace(/\/$/, '') + '/sales/outreach/webhooks/twilio'; url.search = ''; url.hash = '';
  if (messageId) {
    if (!/^[a-f\d]{24}$/i.test(messageId)) throw new AppError(400, 'SALES_SMS_REFERENCE_INVALID', 'Invalid internal SMS reference');
    url.searchParams.set('messageId', messageId);
  }
  return url.toString();
}
export function salesSmsConfigured() {
  if (!(env.SALES_SMS_FROM && env.SALES_SMS_FROM !== env.SMS_FROM && /^AC[a-f\d]{32}$/i.test(env.TWILIO_ACCOUNT_SID ?? '') && env.TWILIO_AUTH_TOKEN && env.PUBLIC_API_URL)) return false;
  try { const url = new URL(env.PUBLIC_API_URL); return !url.username && !url.password && ['http:', 'https:'].includes(url.protocol) && (env.NODE_ENV !== 'production' || url.protocol === 'https:'); } catch { return false; }
}
export function requestsSmsOptOut(text: string, providerType?: string) {
  return providerType === 'STOP' || /^(STOPALL|END|QUIT|CANCEL|REVOKE|OPTOUT)$/i.test(text.trim()) || requestsSalesOptOut(text);
}
