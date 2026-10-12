import { z } from "zod";

export const acquisitionPlanKey = z.enum(["CONTROL", "FORT_KNOX"]);
export const acquisitionContextSchema = z
  .object({
    selectedPlanKey: acquisitionPlanKey.optional(),
    unitCount: z.number().int().min(0).max(100000).optional(),
    prepaidMonths: z.number().int().min(3).max(24).optional(),
    journeyToken: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .optional(),
    source: z.enum(["WEBSITE", "PUBLIC_DEMO", "OUTREACH"]).default("WEBSITE"),
    recoveryEmailOptIn: z.boolean().default(false),
  })
  .strict();
export type AcquisitionContext = z.infer<typeof acquisitionContextSchema>;
export const publicAcquisitionEventSchema = z
  .object({
    journeyToken: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .optional(),
    event: z.enum([
      "landing_viewed",
      "demo_started",
      "demo_completed",
      "plan_selected",
      "signup_started",
    ]),
    planKey: acquisitionPlanKey.optional(),
    source: z.enum(["WEBSITE", "PUBLIC_DEMO", "OUTREACH"]).default("WEBSITE"),
  })
  .strict();
export const publicPlanQuoteSchema = z
  .object({
    units: z.coerce.number().int().min(0).max(100000).default(5),
    months: z.coerce.number().int().min(3).max(24).default(3),
  })
  .strict();
