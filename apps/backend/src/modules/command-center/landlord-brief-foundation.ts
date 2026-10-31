import { z } from 'zod';
import { AppError } from '../../core/errors/AppError.js';

const DAY_MS = 86_400_000;
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const instant = z.iso.datetime();
const briefPeriod = z.enum(['YESTERDAY', 'TODAY', 'MONTH_TO_DATE', 'PREVIOUS_MONTH', 'ROLLING_7_DAYS', 'ROLLING_30_DAYS']);

export const briefWindowSchema = z.object({
  period: briefPeriod,
  timeZone: z.string().trim().min(1).max(100),
  asOf: instant,
}).strict();

function localDate(formatter: Intl.DateTimeFormat, at: number): string {
  const parts = formatter.formatToParts(new Date(at));
  const value = (name: string) => parts.find(part => part.type === name)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function dateShift(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function startOfLocalDate(date: string, formatter: Intl.DateTimeFormat): Date {
  const midnightUtc = Date.parse(`${date}T00:00:00.000Z`);
  let low = midnightUtc - 2 * DAY_MS;
  let high = midnightUtc + 2 * DAY_MS;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (localDate(formatter, middle) < date) low = middle + 1;
    else high = middle;
  }
  if (localDate(formatter, low) !== date) throw new AppError(400, 'BRIEF_LOCAL_DATE_UNAVAILABLE', 'The requested local reporting date does not exist');
  return new Date(low);
}

export function resolveBriefWindow(raw: z.input<typeof briefWindowSchema>) {
  const input = briefWindowSchema.parse(raw);
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US-u-ca-gregory', {
      timeZone: input.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    });
  } catch {
    throw new AppError(400, 'INVALID_BRIEF_TIME_ZONE', 'Use a valid IANA reporting time zone');
  }
  const asOf = new Date(input.asOf);
  const today = localDate(formatter, asOf.getTime());
  const monthStart = `${today.slice(0, 7)}-01`;
  const previousMonthStart = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);
  let fromDate: string;
  let to: Date;
  switch (input.period) {
    case 'YESTERDAY': fromDate = dateShift(today, -1); to = startOfLocalDate(today, formatter); break;
    case 'TODAY': fromDate = today; to = asOf; break;
    case 'MONTH_TO_DATE': fromDate = monthStart; to = asOf; break;
    case 'PREVIOUS_MONTH': fromDate = previousMonthStart; to = startOfLocalDate(monthStart, formatter); break;
    case 'ROLLING_7_DAYS': fromDate = dateShift(today, -6); to = asOf; break;
    case 'ROLLING_30_DAYS': fromDate = dateShift(today, -29); to = asOf; break;
  }
  const from = startOfLocalDate(fromDate, formatter);
  if (from.getTime() >= to.getTime()) throw new AppError(400, 'EMPTY_BRIEF_PERIOD', 'Reporting period has not begun in the selected time zone');
  return { period: input.period, timeZone: input.timeZone, asOf: input.asOf,
    from: from.toISOString(), to: to.toISOString(), endExclusive: true as const };
}

const actionDefinitions = {
  MAINTENANCE_EMERGENCY: { sourceType: 'MaintenanceRequest', priority: 'CRITICAL', permission: 'maintenance.view',
    title: 'Review emergency maintenance', explanation: 'An emergency maintenance request requires human review.',
    nextStep: 'Open the maintenance request and follow its authorized triage workflow.', approvalRequired: false },
  PAYMENT_VERIFICATION_PENDING: { sourceType: 'Payment', priority: 'HIGH', permission: 'payment.view',
    title: 'Review a payment awaiting verification', explanation: 'A payment record is awaiting verification; it is not a verified collection.',
    nextStep: 'Review its evidence in the existing payment workflow.', approvalRequired: true },
  EXPENSE_APPROVAL_PENDING: { sourceType: 'Expense', priority: 'HIGH', permission: 'expense.approve',
    title: 'Review an expense approval', explanation: 'An expense has been submitted for an authorized approval decision.',
    nextStep: 'Review the expense, evidence and approval policy before deciding.', approvalRequired: true },
  ASSET_SERVICE_OVERDUE: { sourceType: 'InventoryItem', priority: 'MODERATE', permission: 'inventory.view',
    title: 'Review overdue asset servicing', explanation: 'An asset service due date has passed; service completion is not inferred.',
    nextStep: 'Inspect the asset record and schedule an authorized service.', approvalRequired: false },
  LEASE_EXPIRY_REVIEW: { sourceType: 'Tenancy', priority: 'MODERATE', permission: 'tenancy.view',
    title: 'Review an approaching lease expiration', explanation: 'A recorded lease end date warrants renewal or move-out review.',
    nextStep: 'Open the tenancy and follow the authorized lifecycle workflow.', approvalRequired: false },
} as const;

const kind = z.enum(Object.keys(actionDefinitions) as [keyof typeof actionDefinitions, ...(keyof typeof actionDefinitions)[]]);
export const actionDigestSchema = briefWindowSchema.extend({
  organizationId: objectId,
  authorizedPropertyIds: z.array(objectId).max(5_000),
  sourceItems: z.array(z.object({
    organizationId: objectId, propertyId: objectId, sourceId: objectId,
    kind, observedAt: instant,
  }).strict()).max(500),
}).strict();

type ActionKind = keyof typeof actionDefinitions;
const priorityRank = { CRITICAL: 0, HIGH: 1, MODERATE: 2 } as const;

export function composeLandlordActionDigest(raw: z.input<typeof actionDigestSchema>) {
  const input = actionDigestSchema.parse(raw);
  const window = resolveBriefWindow({ period: input.period, timeZone: input.timeZone, asOf: input.asOf });
  const allowed = new Set(input.authorizedPropertyIds.map(value => value.toLowerCase()));
  const unique = new Map<string, (typeof input.sourceItems)[number]>();
  const fromMs = Date.parse(window.from), toMs = Date.parse(window.to);
  for (const item of input.sourceItems) {
    if (item.organizationId.toLowerCase() !== input.organizationId.toLowerCase() || !allowed.has(item.propertyId.toLowerCase())) {
      throw new AppError(403, 'BRIEF_SOURCE_OUT_OF_SCOPE', 'Brief source is outside the authorized organization and properties');
    }
    const definition = actionDefinitions[item.kind as ActionKind];
    if (!definition) throw new AppError(400, 'INVALID_BRIEF_SOURCE', 'Unsupported brief source');
    const key = `${item.propertyId.toLowerCase()}:${item.kind}:${item.sourceId.toLowerCase()}`;
    const observedAtMs = Date.parse(item.observedAt);
    if (observedAtMs >= fromMs && observedAtMs < toMs) {
      const previous = unique.get(key);
      if (!previous || observedAtMs > Date.parse(previous.observedAt)) unique.set(key, item);
    }
  }
  const all = [...unique.values()].map(item => {
    const definition = actionDefinitions[item.kind as ActionKind];
    return {
      id: `${input.organizationId.toLowerCase()}:${item.propertyId.toLowerCase()}:${item.kind}:${item.sourceId.toLowerCase()}`,
      organizationId: input.organizationId, propertyId: item.propertyId,
      source: { type: definition.sourceType, id: item.sourceId, observedAt: item.observedAt },
      priority: definition.priority, title: definition.title, explanation: definition.explanation,
      nextStep: definition.nextStep, requiredPermission: definition.permission,
      approvalRequired: definition.approvalRequired, status: 'RECOMMENDED_NOT_EXECUTED' as const,
    };
  }).sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || Date.parse(a.source.observedAt) - Date.parse(b.source.observedAt) || a.id.localeCompare(b.id));
  return {
    kind: 'OPERATIONAL_ACTION_DIGEST_PREVIEW' as const,
    window, organizationId: input.organizationId,
    items: all.slice(0, 20), totalItems: all.length, truncated: all.length > 20,
    coverage: { financialTotals: 'UNAVAILABLE', occupancyTotals: 'UNAVAILABLE', maintenanceTotals: 'UNAVAILABLE',
      anomalyFindings: 'UNAVAILABLE', forecasts: 'UNAVAILABLE' } as const,
    limitations: [
      'Only explicitly supplied source records are represented; absence of an item does not mean no work exists.',
      'No collection, NOI, occupancy, anomaly or forecast total is inferred.',
      'Recommendations do not execute workflows, grant permissions or record approvals.',
    ],
  };
}
