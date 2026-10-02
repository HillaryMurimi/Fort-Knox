import { z } from 'zod';
import { safeText } from './launch-readiness.schemas.js';
export const monitoringAreas = ['launch', 'switches', 'system', 'onboarding', 'queues', 'notifications', 'security'] as const;
export const monitoringQuery = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  area: z.enum(monitoringAreas).optional(),
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']).optional(),
  scope: z.string().regex(/^(?:PLATFORM|[a-f\d]{24})$/i).optional(),
}).strict();
export const alertReviewSchema = z.object({
  expectedRevision: z.number().int().nonnegative(), owner: safeText(120),
  action: z.enum(['ASSIGN', 'ACKNOWLEDGE', 'RESOLVE', 'REOPEN']), note: safeText(500).min(3),
}).strict().refine(value => value.action === 'ASSIGN' || !!value.owner, { message: 'Assign an owner before changing status', path: ['owner'] });
export const maintenanceWindowSchema = z.object({
  area: z.enum(monitoringAreas), scope: z.string().regex(/^(?:PLATFORM|[a-f\d]{24})$/i),
  startsAt: z.iso.datetime(), endsAt: z.iso.datetime(), reason: safeText(500).min(3), owner: safeText(120).min(1),
}).strict().refine(value => Date.parse(value.endsAt) > Date.parse(value.startsAt) && Date.parse(value.endsAt) - Date.parse(value.startsAt) <= 7 * 86400_000, { message: 'Window must end after it starts and last at most seven days', path: ['endsAt'] });
export function suppressed(area: string, scope: string, windows: Array<{ area: string; scope: string; startsAt: Date; endsAt: Date }>, now = new Date()) {
  return windows.some(window => window.area === area && (window.scope === 'PLATFORM' || window.scope === scope) && window.startsAt <= now && window.endsAt > now);
}
export function alertStatus(current: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED', action: 'ASSIGN' | 'ACKNOWLEDGE' | 'RESOLVE' | 'REOPEN') {
  if (action === 'ASSIGN') return current;
  if (action === 'REOPEN') return current === 'RESOLVED' ? 'OPEN' : null;
  if (action === 'ACKNOWLEDGE') return current === 'OPEN' ? 'ACKNOWLEDGED' : null;
  return current !== 'RESOLVED' ? 'RESOLVED' : null;
}
