import { z } from 'zod';

export const configureLandlordSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  legalIdentifier: z.string().trim().min(2).max(100),
  billingEmail: z.email().max(200),
  unitCount: z.number().int().min(0).max(100000),
}).strict();
export const generateContractSchema = z.object({
  planKey: z.enum(['CONTROL', 'FORT_KNOX']),
  prepaidMonths: z.number().int().min(3).max(24).default(3),
  expectedRevision: z.number().int().nonnegative(),
}).strict();
export const signContractSchema = z.object({
  contractId: z.string().regex(/^[a-f\d]{24}$/i),
  documentHash: z.string().regex(/^[a-f\d]{64}$/),
  signatoryName: z.string().trim().min(2).max(200),
  authorityConfirmed: z.literal(true), termsAccepted: z.literal(true),
}).strict();
export const replaceContractSchema = generateContractSchema.extend({ reason: z.string().trim().min(10).max(1000), details: configureLandlordSchema.optional() });
export const createTemplateSchema = z.object({
  templateId: z.string().regex(/^[A-Z0-9_-]{2,80}$/), name: z.string().trim().min(2).max(200),
  version: z.number().int().positive(), effectiveAt: z.coerce.date(),
  plans: z.array(z.enum(['CONTROL', 'FORT_KNOX'])).min(1).max(2),
  variables: z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/)).min(1).max(40),
  body: z.string().trim().min(100).max(50000),
}).strict();
export const templateStatusSchema = z.object({ status: z.enum(['ACTIVE', 'RETIRED']) }).strict();
