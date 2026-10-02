import { z } from 'zod';
const sensitive = /(?:sk_(?:live|test)_|SG\.[\w-]+\.|AKIA[0-9A-Z]{16}|-----BEGIN|mongodb(?:\+srv)?:\/\/|bearer\s+\S+|(?:password|secret|token|api[_ -]?key|passkey)\s*[:=]\s*\S+)/i;
export const safeText = (max: number) => z.string().trim().max(max).refine(value => !sensitive.test(value), 'Do not paste credentials or connection strings');
export const updateReadinessSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  onboarding: z.enum(['NOT_STARTED', 'AWAITING_DOCUMENTS', 'SUBMITTED', 'APPROVED']),
  staging: z.enum(['NOT_TESTED', 'PASSED', 'FAILED', 'NOT_APPLICABLE']),
  responsibleOwner: safeText(120),
  targetDate: z.iso.date().nullable(),
  nextAction: safeText(300),
  blocker: safeText(500),
  severity: z.enum(['NONE', 'LOW', 'HIGH', 'CRITICAL']),
  verificationNote: safeText(500),
}).strict().superRefine((input, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
  if ((input.onboarding === 'APPROVED' || input.staging === 'PASSED') && !input.responsibleOwner) issue('responsibleOwner', 'Assign a responsible owner before approval or verification');
  if (input.staging === 'PASSED' && input.verificationNote.length < 10) issue('verificationNote', 'Describe the staging checks performed (at least 10 characters)');
  if (Boolean(input.blocker) !== (input.severity !== 'NONE')) issue('severity', 'A blocker requires a severity; clearing it requires NONE');
});
export type UpdateReadinessInput = z.infer<typeof updateReadinessSchema>;
