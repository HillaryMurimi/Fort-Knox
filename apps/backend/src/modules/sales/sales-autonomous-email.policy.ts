import { z } from 'zod';

const approvedPlaceholder = /{{\s*([^{}]+)\s*}}/g;
const safeTemplate = (value: string) => [...value.matchAll(approvedPlaceholder)].every(match => match[1]?.trim() === 'customer_name') && !/{{|}}/.test(value.replace(approvedPlaceholder, ''));

export const autonomousEmailTemplateSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]{2,39}$/),
  segment: z.enum(['New', 'Qualified', 'Nurture']),
  subject: z.string().trim().min(5).max(180).refine(value => !/[\r\n]/.test(value) && safeTemplate(value)),
  body: z.string().trim().min(20).max(5000).refine(safeTemplate),
}).strict();

export type AutonomousEmailTemplate = z.infer<typeof autonomousEmailTemplateSchema>;

export function renderAutonomousEmail(template: AutonomousEmailTemplate, customerName: string) {
  const name = Array.from(customerName, character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? ' ' : character).join('').replace(/\s+/g, ' ').trim().slice(0, 80);
  const render = (value: string) => value.replace(approvedPlaceholder, name);
  return { subject: render(template.subject), body: render(template.body) };
}
