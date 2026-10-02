import { z } from "zod";

const text = z.string(),
  number = z.number().finite();
const metric = z.object({
  key: text,
  label: text,
  value: z.union([text, number, z.null()]),
  source: text,
  window: text,
});
export const monitoringOverviewShape = z.object({
  environment: text,
  generatedAt: text,
  areas: z.array(
    z.object({
      key: text,
      title: text,
      status: text,
      metrics: z.array(metric),
      notes: z.array(text),
      conditions: z.array(
        z.object({ scope: text, title: text, value: number }),
      ),
      truncated: z.boolean(),
    }),
  ),
  switches: z
    .array(
      z.object({
        key: text,
        name: text,
        mode: text,
        reason: text,
        coverage: text,
        boundaries: text,
        limitation: text,
        modifiedAt: text.nullable(),
        modifiedBy: text.nullable(),
        disabledAttempts: number.nullable(),
        dependencies: z.array(z.object({ key: text, mode: text })),
      }),
    )
    .nullable(),
  collector: z
    .object({
      status: text,
      lastSuccessAt: text.nullable(),
      lastErrorAt: text.nullable(),
    })
    .nullable(),
});
export const platformSwitchesShape = z.array(
  z.object({
    key: text,
    name: text,
    mode: text,
    description: text,
    environment: text,
    reason: text,
  }),
);
export const launchReadinessShape = z.object({
  environment: text,
  generatedAt: text,
  summary: z.object({
    total: number,
    ready: number,
    blockers: number,
    unassigned: number,
  }),
  items: z.array(
    z.object({
      key: text,
      name: text,
      group: text,
      ready: z.boolean(),
      optional: z.boolean(),
      needsStaging: z.boolean(),
      revision: number,
      onboarding: text,
      staging: text,
      configuration: text,
      severity: text,
      responsibleOwner: text,
      nextAction: text,
      blocker: text,
      verificationNote: text,
      issues: z.array(text),
      targetDate: text.nullable(),
      updatedAt: text.nullable(),
      verifiedAt: text.nullable(),
      modifiedBy: text.nullable(),
    }),
  ),
});
export const platformResponseError =
  "Platform response is incomplete or incompatible. Refresh this view; if this continues, update and restart the backend and frontend.";
