import { z } from "zod";
export const objectId = z.string().regex(/^[a-f\d]{24}$/i);
export const salesPermissions = [
  "sales.leads.read",
  "sales.leads.create",
  "sales.leads.update",
  "sales.meetings.read",
  "sales.meetings.create",
  "sales.meetings.update",
  "sales.notes.read",
  "sales.notes.create",
  "sales.onboarding.read",
  "sales.agents.read",
] as const;
export const listCustomersSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    search: z.string().trim().max(120).default(""),
    stage: z.string().trim().max(80).optional(),
  })
  .strict();
export const customerSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    email: z.string().trim().toLowerCase().email().max(240).optional(),
    phone: z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/)
      .optional(),
    properties: z.number().int().min(1).max(100000),
    units: z.string().trim().min(1).max(40),
    challenge: z.string().trim().min(5).max(5000),
    source: z.string().trim().min(1).max(120),
    contacts: z
      .array(
        z
          .object({
            name: z.string().trim().min(2).max(160),
            email: z.string().trim().toLowerCase().email().optional(),
            phone: z
              .string()
              .regex(/^\+[1-9]\d{7,14}$/)
              .optional(),
            title: z.string().trim().max(120).optional(),
          })
          .strict(),
      )
      .max(20)
      .default([]),
  })
  .strict();
export const updateCustomerSchema = z
  .object({
    revision: z.number().int().min(0),
    leadStatus: z
      .enum(["New", "Qualified", "Disqualified", "Nurture"])
      .optional(),
    nextAction: z.string().trim().max(500).optional(),
    nextActionDate: z.iso.datetime({ offset: true }).optional(),
    consent: z.enum(["UNKNOWN", "OPTED_IN", "OPTED_OUT"]).optional(),
  })
  .strict();
export const meetingSchema = z
  .object({
    representativeId: objectId,
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    type: z.enum(["DEMO", "CALL", "ONBOARDING", "REVIEW"]),
    description: z.string().trim().max(20000).default(""),
  })
  .strict()
  .refine(
    (v) =>
      Date.parse(v.endsAt) > Date.parse(v.startsAt) &&
      Date.parse(v.endsAt) - Date.parse(v.startsAt) <= 86400000,
    { message: "Meeting must end after its start and last at most 24 hours" },
  );
export const meetingOutcomeSchema = z
  .object({
    revision: z.number().int().min(0),
    status: z.enum([
      "COMPLETED",
      "CANCELLED",
      "RESCHEDULED",
      "NO_SHOW",
      "NOT_HELD",
    ]),
    outcome: z.string().trim().min(2).max(5000),
    notes: z.string().trim().max(20000).optional(),
  })
  .strict();
export const noteSchema = z
  .object({ text: z.string().trim().min(1).max(20000) })
  .strict();
export const assignmentSchema = z
  .object({ userId: objectId, revision: z.number().int().min(0) })
  .strict();
export const linkCustomerSchema = z
  .object({ organizationId: objectId, revision: z.number().int().min(0) })
  .strict();
