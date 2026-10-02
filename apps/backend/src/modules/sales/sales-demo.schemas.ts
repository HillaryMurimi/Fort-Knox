import { z } from "zod";
export const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const text = z.string().trim().max(500);
const story = z.enum([
  "RENT",
  "MAINTENANCE",
  "EXPENSES",
  "PORTFOLIO",
  "STAFF",
  "VACANCY",
  "EXECUTIVE",
  "SECURITY",
  "FULL",
]);
export const demoProfileSchema = z
  .object({
    companyName: text.min(2).max(160),
    contactName: text.max(160).optional(),
    properties: z.number().int().min(1).max(20).optional(),
    units: z.number().int().min(10).max(2000).optional(),
    propertyType: text.max(80).optional(),
    use: z.enum(["RESIDENTIAL", "COMMERCIAL", "MIXED_USE"]).optional(),
    executiveApartments: z.boolean().optional(),
    monthlyRentRollMinor: z
      .number()
      .int()
      .min(100000)
      .max(100000000000)
      .optional(),
    occupancy: z.number().min(10).max(100).optional(),
    managementMethod: text.optional(),
    existingSoftware: text.optional(),
    spreadsheetUsage: text.optional(),
    whatsAppDependency: text.optional(),
    paymentProcess: text.optional(),
    maintenanceProcess: text.optional(),
    staffStructure: text.optional(),
    securityInfrastructure: text.optional(),
    financialProblem: text.optional(),
    operationalProblem: text.optional(),
    managementFrustration: text.optional(),
    securityConcern: text.optional(),
    primaryPain: story.default("RENT"),
    objective: text.optional(),
    plan: z.enum(["CONTROL", "FORT_KNOX"]).default("CONTROL"),
    template: z
      .enum([
        "CONTROL_40",
        "CONTROL_150",
        "CONTROL_PORTFOLIO",
        "EXECUTIVE",
        "FORT_SECURITY",
        "FORT_PORTFOLIO",
      ])
      .default("CONTROL_150"),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.primaryPain === "SECURITY" && v.plan !== "FORT_KNOX")
      ctx.addIssue({
        code: "custom",
        path: ["plan"],
        message:
          "Security demonstration requires Fort Knox. Control includes every operational story.",
      });
    if ((v.properties ?? 1) > (v.units ?? 40))
      ctx.addIssue({
        code: "custom",
        path: ["properties"],
        message: "Properties cannot exceed units",
      });
  });
export const prepareDemoSchema = z
  .object({ profile: demoProfileSchema, leadId: objectId.optional() })
  .strict();
export const commandSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    commandId: z
      .string()
      .min(16)
      .max(100)
      .regex(/^[a-zA-Z0-9_-]+$/),
    kind: z.enum([
      "REVEAL_ARREARS",
      "OPEN_TENANCY",
      "SIMULATE_PAYMENT",
      "RENT_DUE",
      "ADVANCE_OVERDUE",
      "FOLLOW_UP",
      "REPORT_LEAK",
      "TRIAGE",
      "ASSIGN",
      "QUOTE",
      "APPROVE_MAINTENANCE",
      "START_WORK",
      "COMPLETE_REPAIR",
      "VERIFY_REPAIR",
      "CLOSE_REPAIR",
      "REVEAL_VACANCY",
      "VACANCY_ACTION",
      "ESCALATE_TASK",
      "COMPLETE_TASK",
      "SIMULATE_SECURITY",
      "INVESTIGATE_INCIDENT",
      "ESCALATE_INCIDENT",
      "RESOLVE_INCIDENT",
      "READ_EVIDENCE",
      "COMPLETE_DEMO",
      "OFFER_PILOT",
      "RESET",
    ]),
    resourceId: z
      .string()
      .regex(/^demo-[a-zA-Z0-9-]+$/)
      .max(100)
      .optional(),
    amountMinor: z.number().int().min(1).max(100000000000).optional(),
  })
  .strict();
export const paginationSchema = z
  .object({ page: z.coerce.number().int().min(1).max(10000).default(1) })
  .strict();
export const startPilotSchema = z
  .object({
    ownerEmail: z.string().trim().email().max(240),
    name: text.min(2).max(160),
    durationDays: z.number().int().min(1).max(60).optional(),
  })
  .strict();
export const pilotOrganizationParams = z
  .object({ organizationId: objectId })
  .strict();

export const pilotInsightSchema = z
  .object({ kind: z.enum(["RENT", "VACANCY"]), resourceId: objectId })
  .strict();
