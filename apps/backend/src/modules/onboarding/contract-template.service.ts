import { assertContractIndexes } from './contract-indexes.js';
import mongoose from 'mongoose';
import { ContractTemplate } from '../../database/models/ContractTemplate.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { AppError } from '../../core/errors/AppError.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import { AuditService } from '../audit/audit.service.js';
import { createTemplateSchema } from './landlord-onboarding.schemas.js';
import { contractVariables, hash, interpolate } from './contract-snapshot.js';

export class ContractTemplateService {
  static async list(auth: AuthenticatedUser) { AuthorizationService.assertPlatformAdmin(auth); return ContractTemplate.find().sort({ templateId: 1, version: -1 }).lean(); }
  static async create(auth: AuthenticatedUser, raw: unknown) {
    AuthorizationService.assertPlatformAdmin(auth);
    const input = createTemplateSchema.parse(raw);
    if(contractVariables.some(key=>!input.variables.includes(key))) throw new AppError(400,'COMMERCIAL_TERMS_REQUIRED','The template must include all authoritative organization and commercial variables');
    interpolate(input.body, input.variables, Object.fromEntries(contractVariables.map(key => [key, key])));
    await assertContractIndexes();
    const session = await mongoose.startSession();
    try { return await session.withTransaction(async () => {
      const latest = await ContractTemplate.findOne({ templateId: input.templateId }).sort({ version: -1 }).session(session);
      if (latest && input.version <= latest.version) throw new AppError(409, 'TEMPLATE_VERSION_CONFLICT', 'Use a new, increasing version number');
      const [template] = await ContractTemplate.create([{ ...input, status: 'DRAFT', sha256: hash(JSON.stringify(input)), createdBy: auth.userId }], { session });
      await AuditService.record({ actorUserId: auth.userId, actorRole: 'SUPER_ADMIN', action: 'contract.template.created', resourceType: 'ContractTemplate', resourceId: template!._id, metadata: { templateId: input.templateId, version: input.version, sha256: template!.sha256 } }, session);
      return template;
    }); } finally { await session.endSession(); }
  }
  static async status(auth: AuthenticatedUser, id: string, status: 'ACTIVE' | 'RETIRED') {
    AuthorizationService.assertPlatformAdmin(auth); AuditService.assertObjectId(id, 'templateVersionId');
    await assertContractIndexes();
    const session = await mongoose.startSession();
    try { return await session.withTransaction(async () => {
      const template = await ContractTemplate.findById(id).session(session);
      if (!template) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template version not found');
      if (template.status === status) return template;
      if (template.status === 'RETIRED') throw new AppError(409, 'TEMPLATE_RETIRED', 'A retired version cannot be reactivated');
      if (status === 'ACTIVE') {
        if (template.effectiveAt > new Date()) throw new AppError(409, 'TEMPLATE_NOT_EFFECTIVE', 'The effective date must be reached before publishing');
        const active = await ContractTemplate.find({ status: 'ACTIVE', plans: { $in: template.plans } }).session(session);
        if (active.some(row => row.templateId !== template.templateId)) throw new AppError(409, 'TEMPLATE_APPLICABILITY_CONFLICT', 'Retire overlapping active templates before publishing');
        for (const row of active) { row.status = 'RETIRED'; await row.save({ session }); }
      }
      template.status = status; await template.save({ session });
      await AuditService.record({ actorUserId: auth.userId, actorRole: 'SUPER_ADMIN', action: 'contract.template.status.changed', resourceType: 'ContractTemplate', resourceId: template._id, metadata: { templateId: template.templateId, version: template.version, status } }, session);
      return template;
    }); } finally { await session.endSession(); }
  }
}
