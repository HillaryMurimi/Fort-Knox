import { z } from 'zod';
import { calendarTimeZone } from '../../config/sales-calendar.config.js';
import { objectId } from './sales-success.schemas.js';
const dates = { startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }) };
export const calendarAvailabilitySchema = z.object({ representativeId: objectId, ...dates }).strict().refine(value => Date.parse(value.endsAt) > Date.parse(value.startsAt) && Date.parse(value.endsAt) - Date.parse(value.startsAt) <= 7 * 86400000, 'Choose at most seven days');
export const calendarCommandSchema = z.object({ revision: z.number().int().min(0), commandId: z.uuid(), originApprovalId: objectId.optional(), action: z.enum(['CREATE', 'RESCHEDULE', 'CANCEL', 'SYNC']), startsAt: dates.startsAt.optional(), endsAt: dates.endsAt.optional(), timezone: calendarTimeZone.optional(), evidence: z.string().trim().min(20).max(2000) }).strict();
