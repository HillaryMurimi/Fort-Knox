import { z } from 'zod';

export const switchKeySchema = z.object({
  key: z.string().trim().min(2).max(120).regex(/^[A-Z0-9_]+$/),
}).strict();

export const updateSwitchSchema = z.object({
  mode: z.enum(['ON', 'OFF', 'MAINTENANCE']),
  reason: z.string().trim().min(3).max(1000),
  confirm: z.literal(true),
}).strict();

export type UpdateSwitchInput = z.infer<typeof updateSwitchSchema>;