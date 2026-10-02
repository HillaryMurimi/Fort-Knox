import mongoose, { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { LaunchReadiness } from '../../database/models/LaunchReadiness.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { AppError } from '../../core/errors/AppError.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import { readinessCatalog, configurationStatus, readinessIssues } from './launch-readiness.catalog.js';
import { updateReadinessSchema, type UpdateReadinessInput } from './launch-readiness.schemas.js';

const readinessEnvironment = () => env.LAUNCH_READINESS_ENV ?? env.NODE_ENV;
export class LaunchReadinessService {
  static async list(auth: AuthenticatedUser) {
    AuthorizationService.assertPlatformAdmin(auth);
    const rows = await LaunchReadiness.find({ environment: readinessEnvironment(), key: { $in: readinessCatalog.map(item => item.key) } }).lean();
    const items = readinessCatalog.map(item => {
      const row = rows.find(value => value.key === item.key);
      const review = {
        revision: row?.revision ?? 0, onboarding: row?.onboarding ?? 'NOT_STARTED',
        staging: row?.staging ?? (item.needsStaging ? 'NOT_TESTED' : 'NOT_APPLICABLE'),
        responsibleOwner: row?.responsibleOwner ?? '', targetDate: row?.targetDate ?? null,
        nextAction: row?.nextAction ?? item.nextAction, blocker: row?.blocker ?? '', severity: row?.severity ?? 'NONE',
        verificationNote: row?.verificationNote ?? '', verifiedAt: row?.verifiedAt ?? null,
        modifiedBy: row?.modifiedBy ?? null, updatedAt: row?.updatedAt ?? null,
      };
      const configuration = configurationStatus(item.key);
      const issues = readinessIssues(review, configuration, item.needsStaging);
      return { ...item, ...review, configuration, issues, ready: issues.length === 0 };
    });
    return { environment: readinessEnvironment(), generatedAt: new Date().toISOString(), items,
      summary: { total: items.length, ready: items.filter(item => item.ready).length, blockers: items.filter(item => item.blocker).length, unassigned: items.filter(item => !item.responsibleOwner).length } };
  }

  static async update(auth: AuthenticatedUser, key: string, raw: UpdateReadinessInput) {
    AuthorizationService.assertPlatformAdmin(auth);
    const item = readinessCatalog.find(value => value.key === key);
    if (!item) throw new AppError(404, 'READINESS_ITEM_NOT_FOUND', 'Unknown readiness item');
    const input = updateReadinessSchema.parse(raw);
    if (item.needsStaging && input.staging === 'NOT_APPLICABLE') throw new AppError(400, 'STAGING_REQUIRED', 'This item requires staging verification');
    if (!item.needsStaging && input.staging !== 'NOT_APPLICABLE') throw new AppError(400, 'STAGING_NOT_APPLICABLE', 'Document approval does not use a staging check');
    let indexes;
    try { indexes = await LaunchReadiness.collection.indexes(); }
    catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 26) throw new AppError(503, 'READINESS_INDEX_REQUIRED', 'Initialize the launch readiness database index before saving reviews');
      throw error;
    }
    if (!indexes.some(index => index.unique && index.key.environment === 1 && index.key.key === 1 && Object.keys(index.key).length === 2 && !index.partialFilterExpression && !index.sparse)) throw new AppError(503, 'READINESS_INDEX_REQUIRED', 'Initialize the launch readiness database index before saving reviews');
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const current = await LaunchReadiness.findOne({ key, environment: readinessEnvironment() }).session(session);
        if ((current?.revision ?? 0) !== input.expectedRevision) throw new AppError(409, 'READINESS_CONFLICT', 'This item changed; refresh and review it again');
        const { expectedRevision, ...review } = input;
        const before = current ? { onboarding: current.onboarding, staging: current.staging, severity: current.severity, revision: current.revision } : null;
        const verifiedAt = input.staging === 'PASSED' ? new Date() : null;
        const values = { ...review, verifiedAt, revision: expectedRevision + 1, modifiedBy: auth.userId };
        const record = current ?? new LaunchReadiness({ key, environment: readinessEnvironment() });
        record.set(values);
        await record.save({ session });
        await AuditService.record({
          actorUserId: new Types.ObjectId(auth.userId), actorRole: 'SUPER_ADMIN',
          action: 'platform.readiness.updated', resourceType: 'LaunchReadiness', resourceId: record._id,
          before, after: { onboarding: input.onboarding, staging: input.staging, severity: input.severity, revision: record.revision },
          metadata: { key, environment: readinessEnvironment(), ownerAssigned: Boolean(input.responsibleOwner) },
        }, session);
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) throw new AppError(409, 'READINESS_CONFLICT', 'This item changed; refresh and review it again');
      throw error;
    } finally { await session.endSession(); }
    return this.list(auth);
  }
}
