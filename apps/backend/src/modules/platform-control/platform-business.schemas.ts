import { z } from "zod";
import { AppError } from "../../core/errors/AppError.js";

export const DEMO_DATASET = "PLATFORM_BI_V1";
export const businessQuery = z
  .object({
    period: z
      .enum([
        "TODAY",
        "PREVIOUS_DAY",
        "LAST_7_DAYS",
        "LAST_30_DAYS",
        "CURRENT_MONTH",
        "PREVIOUS_MONTH",
        "CUSTOM",
      ])
      .default("TODAY"),
    timeZone: z
      .string()
      .default("Africa/Nairobi")
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, "Use a valid IANA timezone"),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    plan: z
      .enum(["ALL", "CONTROL", "FORT_KNOX", "OTHER", "UNASSIGNED"])
      .default("ALL"),
    dataset: z.enum(["LIVE", "DEMO"]).default("LIVE"),
  })
  .strict();
export const drillQuery = businessQuery.extend({
  kind: z
    .enum([
      "ORGANIZATIONS",
      "ACTIVE",
      "ONBOARDING",
      "SIGNATURE",
      "PAYMENT",
      "ATTENTION",
      "OVERDUE",
      "INVOICES",
      "OUTSTANDING",
      "VERIFIED_PAYMENTS",
      "UNVERIFIED_PAYMENTS",
      "BILLING_EVENTS",
      "CAMERAS",
      "INCIDENTS",
      "MOVEMENTS",
    ])
    .default("ORGANIZATIONS"),
  organizationId: z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/)
    .optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export const briefRequest = businessQuery.extend({
  idempotencyKey: z
    .string()
    .min(8)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/),
});
export type BusinessQuery = z.infer<typeof businessQuery>;
export interface BusinessRange {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  timeZone: string;
  period: string;
}
function calendarDate(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
function shiftDay(day: string, amount: number) {
  const value = new Date(day + "T00:00:00Z");
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
export function midnight(day: string, timeZone: string) {
  const base = Date.parse(day + "T00:00:00Z");
  if (
    !Number.isFinite(base) ||
    new Date(base).toISOString().slice(0, 10) !== day
  )
    throw new AppError(400, "INVALID_DATE_RANGE", "Use valid calendar dates");
  let epoch = base;
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(epoch));
    const p = Object.fromEntries(parts.map((item) => [item.type, item.value]));
    const represented = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
      Number(p.second),
    );
    const next = base - (represented - epoch);
    if (next === epoch) break;
    epoch = next;
  }
  return new Date(epoch);
}
export function resolveBusinessRange(
  query: BusinessQuery,
  now = new Date(),
): BusinessRange {
  const today = calendarDate(now, query.timeZone),
    month = today.slice(0, 7) + "-01";
  let first = today,
    end: Date = now;
  switch (query.period) {
    case "PREVIOUS_DAY":
      first = shiftDay(today, -1);
      end = midnight(today, query.timeZone);
      break;
    case "LAST_7_DAYS":
      first = shiftDay(today, -6);
      break;
    case "LAST_30_DAYS":
      first = shiftDay(today, -29);
      break;
    case "CURRENT_MONTH":
      first = month;
      break;
    case "PREVIOUS_MONTH":
      first = shiftDay(month, -1).slice(0, 7) + "-01";
      end = midnight(month, query.timeZone);
      break;
    case "CUSTOM":
      if (!query.from || !query.to)
        throw new AppError(
          400,
          "INVALID_DATE_RANGE",
          "Custom ranges require from and to dates",
        );
      first = query.from;
      midnight(query.to, query.timeZone);
      end = new Date(
        Math.min(
          now.getTime(),
          midnight(shiftDay(query.to, 1), query.timeZone).getTime(),
        ),
      );
      break;
  }
  const from = midnight(first, query.timeZone),
    duration = end.getTime() - from.getTime();
  if (duration <= 0 || duration > 366 * 86400000)
    throw new AppError(
      400,
      "INVALID_DATE_RANGE",
      "Select a past or current range of at most 366 days",
    );
  return {
    from,
    to: end,
    previousFrom: new Date(from.getTime() - duration),
    previousTo: from,
    timeZone: query.timeZone,
    period: query.period,
  };
}
