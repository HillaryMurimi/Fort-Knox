import { z } from 'zod';
export const calendarTimeZone = z.string().min(3).max(80).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, 'Use a valid IANA timezone');
export const salesCalendarConnection = z.object({
  representativeId: z.string().regex(/^[a-f\d]{24}$/i).transform(value => value.toLowerCase()),
  provider: z.enum(['GOOGLE', 'MICROSOFT']),
  calendarId: z.string().min(1).max(512),
  accountEmail: z.email().max(240).transform(value => value.toLowerCase()),
  timezone: calendarTimeZone,
  clientId: z.string().min(1).max(512), clientSecret: z.string().min(1).max(4096), refreshToken: z.string().min(1).max(8192),
  tenantId: z.uuid().optional(),
}).strict().refine(value => value.provider !== 'MICROSOFT' || !!value.tenantId, 'Microsoft requires the authorized tenant ID');
export type SalesCalendarConnection = z.infer<typeof salesCalendarConnection>;
export const salesCalendarConnections = z.string().max(200000).default('[]').transform((raw, ctx) => {
  try {
    const result = z.array(salesCalendarConnection).max(20).refine(items => new Set(items.map(item => item.representativeId.toLowerCase())).size === items.length, 'One calendar connection per representative').safeParse(JSON.parse(raw));
    if (result.success) return result.data;
  } catch { /* Never include credential-bearing input in validation output. */ }
  ctx.addIssue({ code: 'custom', message: 'Use a valid bounded calendar connection array with unique representatives' });
  return z.NEVER;
});
