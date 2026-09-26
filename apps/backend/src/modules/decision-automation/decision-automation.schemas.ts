import { z } from 'zod';
const oid=z.string().regex(/^[0-9a-fA-F]{24}$/,'Invalid ObjectId');
export const periodSchema=z.object({from:z.coerce.date().optional(),to:z.coerce.date().optional(),propertyId:oid.optional()}).strict();
export const actionQuerySchema=z.object({propertyId:oid.optional(),status:z.enum(['OPEN','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','DISMISSED']).optional(),priority:z.enum(['CRITICAL','HIGH','MEDIUM','LOW']).optional(),limit:z.coerce.number().int().min(1).max(200).default(50)}).strict();
export const tenantRiskQuerySchema=z.object({propertyId:oid.optional(),grade:z.enum(['LOW','MODERATE','HIGH','CRITICAL']).optional(),limit:z.coerce.number().int().min(1).max(200).default(100)}).strict();
export const vacancyQuerySchema=z.object({propertyId:oid.optional(),limit:z.coerce.number().int().min(1).max(200).default(100)}).strict();
export const policySchema=z.object({enabled:z.boolean().optional(),evaluationIntervalMinutes:z.number().int().min(5).max(10080).optional(),escalationAfterMinutes:z.number().int().min(15).max(43200).optional(),notifyPriority:z.enum(['CRITICAL','HIGH','MEDIUM','LOW']).optional(),forecastHorizonDays:z.number().int().min(7).max(365).optional(),maxNotificationsPerRun:z.number().int().min(1).max(100).optional()}).strict();
export const actionStatusSchema=z.object({status:z.enum(['ACKNOWLEDGED','IN_PROGRESS','RESOLVED','DISMISSED'])}).strict();
