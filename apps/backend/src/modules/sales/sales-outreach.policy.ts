import { createHash } from 'node:crypto';
import { AppError } from '../../core/errors/AppError.js';
export const recipientHash = (channel: string, value: string) => createHash('sha256').update(channel + ':' + value.trim().toLowerCase()).digest('hex');
export const opaqueHash = (value: string) => createHash('sha256').update(value).digest('hex');
export function contactFor(channel: string, lead: { email?: string | null; phone?: string | null }) {
  const contact = channel === 'EMAIL' ? lead.email?.trim().toLowerCase() : lead.phone;
  if (!contact || (channel === 'EMAIL' ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) : !/^\+[1-9]\d{7,14}$/.test(contact)))
    throw new AppError(409, 'OUTREACH_CONTACT_REQUIRED', 'A valid reviewed contact is required for this channel');
  return contact;
}
// UTC storage with recipient-local 08:00-20:00 weekday sending windows. This is a scheduling rule, not a browser timer.
export function nextOutreachWindow(now: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
  const allowed = (date: Date) => {
    const parts = formatter.formatToParts(date), weekday = parts.find(p => p.type === 'weekday')?.value, hour = Number(parts.find(p => p.type === 'hour')?.value);
    return weekday !== 'Sat' && weekday !== 'Sun' && hour >= 8 && hour < 20;
  };
  if (allowed(now)) return now;
  let next = Math.ceil(now.getTime() / 900000) * 900000;
  for (let i = 0; i < 8 * 96; i++, next += 900000) { const date = new Date(next); if (allowed(date)) return date; }
  throw new AppError(409, 'OUTREACH_WINDOW_UNAVAILABLE', 'No valid sending window found');
}

export function requestsSalesOptOut(text: string) {
  const first = text.split(/\r?\n/).map(v => v.trim()).find(v => v && !v.startsWith('>')) ?? '';
  return /^(?:please\s+)?(?:stop(?:\s+sending(?:\s+me)?(?:\s+(?:emails|messages|sales updates))?)?|unsubscribe(?:\s+me)?|remove me(?: from (?:your |the )?(?:list|emails|messages))?|opt[- ]out|do not contact me again)[.!]?$/i.test(first);
}
