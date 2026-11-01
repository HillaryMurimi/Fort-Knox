import { AppError } from '../../core/errors/AppError.js';
import { z } from 'zod';
export function redactSalesMeeting<T extends { calendar?: { contentExpiresAt?: Date | null; contentRedactedAt?: Date | null; evidence?: string | null; attendee?: string | null } | null }>(meeting: T): T {
  if (meeting.calendar?.contentExpiresAt && meeting.calendar.contentExpiresAt <= new Date()) return { ...meeting, calendar: { ...meeting.calendar, evidence: undefined, attendee: undefined, contentRedactedAt: meeting.calendar.contentRedactedAt ?? meeting.calendar.contentExpiresAt } };
  return meeting;
}
export function validateCalendarProposal(text: string, window: { startsAt: string; endsAt: string }, busy: { startsAt: Date | string; endsAt: Date | string }[]) {
  const values = text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})/g) ?? [];
  if (!values.length || values.length % 2 || values.length > 10) throw new AppError(400, 'CALENDAR_PROPOSAL_INVALID', 'Calendar proposals require one to five explicit ISO start/end pairs');
  if (values.some(value => !z.iso.datetime({ offset: true }).safeParse(value).success)) throw new AppError(400, 'CALENDAR_PROPOSAL_INVALID', 'Calendar proposals must use valid ISO dates');
  for (let n = 0; n < values.length; n += 2) {
    const start = Date.parse(values[n]!), end = Date.parse(values[n + 1]!);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= Date.now() || end <= start || end - start > 86400000 || start < Date.parse(window.startsAt) || end > Date.parse(window.endsAt) || busy.some(period => new Date(period.startsAt).getTime() < end && new Date(period.endsAt).getTime() > start)) throw new AppError(400, 'CALENDAR_PROPOSAL_UNAVAILABLE', 'Proposed slots must be future intervals inside actual checked availability');
  }
}
