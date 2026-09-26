import { z } from 'zod';

export const domainSchema = z.enum(['ARREARS', 'VACANCY', 'REVENUE']);
export const learnSchema = z.object({
  domain: domainSchema.optional(),
  asOf: z.coerce.date().optional(),
  horizonDays: z.number().int().min(7).max(365).default(30),
  minSamples: z.number().int().min(30).max(100000).default(50),
}).strict();
export const modelQuerySchema = z.object({ domain: domainSchema.optional(), status: z.enum(['CANDIDATE','VALIDATED','PROMOTED','RETIRED']).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();
export const predictionSchema=z.object({domain:domainSchema,features:z.record(z.string(),z.number().finite())}).strict();
export const promoteSchema = z.object({ modelId: z.string().regex(/^[0-9a-fA-F]{24}$/) }).strict();
export type PredictionInput=z.infer<typeof predictionSchema>;
export type LearnInput = z.infer<typeof learnSchema>;
