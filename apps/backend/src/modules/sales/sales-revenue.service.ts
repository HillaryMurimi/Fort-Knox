import { createHash } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/AppError.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import { SalesRevenueTarget } from '../../database/models/SalesRevenueTarget.js';
import { SalesCampaign } from '../../database/models/SalesCampaign.js';
import { AuditLog } from '../../database/models/AuditLog.js';
import { AuditService } from '../audit/audit.service.js';
import { assertFreshAdmin } from '../auth/admin-security.js';
import { assertSwitchEnabled } from '../platform-control/platform-control.guard.js';
import { businessQuery, resolveBusinessRange } from '../platform-control/platform-business.schemas.js';
import { salesTransaction } from './sales-agent.repository.js';
import { SalesRevenueRepository } from './sales-revenue.repository.js';
import { createRevenueTargetSchema, updateRevenueTargetSchema, revenueTargetPolicySchema, revenueTargetPageSchema, revenueQuerySchema, type RevenueTargetPolicy } from './sales-revenue.schemas.js';
import { targetPeriod, targetPerformance } from './sales-revenue.calculations.js';
import { growthReadiness } from './sales-growth.recommendations.js';
import { objectId } from './sales-success.schemas.js';

export async function assertRevenueIndexes() {
  if (env.NODE_ENV !== 'production') return;
  const indexes = await SalesRevenueTarget.collection.indexes().catch(() => []);
  if (!indexes.some(i => i.name === 'sales_revenue_target_command_unique' && i.unique && i.key.requestedBy === 1 && i.key.commandId === 1))
    throw new AppError(503, 'SALES_INDEXES_REQUIRED', 'Install revenue target command indexes');
}
async function access(auth: AuthenticatedUser) { AuthorizationService.assertPlatformAdmin(auth); await assertSwitchEnabled('SALES_ANALYTICS'); }
const limitations = [
  'Cash is gross verified Paystack subscription collections with signed contracts and integer invoice totals; refunds, fees, taxes and recognized revenue are not reconciled here.',
  'MRR is the current paid active subscription commercial snapshot, counted once per organization. ARR is MRR multiplied by 12, not collected cash or a forecast.',
  'Missing billing proof, signed contracts or commercial snapshots are excluded. Zero means no qualifying evidence; completeness against the provider is not certified.',
  'Campaign attribution uses the retained registration cohort. Unattributed cash remains visible; agent and team monetary attribution is unavailable.',
  'Operational counts are retained CRM records at query time, not historical stage transitions. Reply counts are correlated messages, not unique customers. Costs are configured estimates in micro-USD, not expenses.',
];
async function validateScope(policy: RevenueTargetPolicy) {
  if (policy.scope === 'CAMPAIGN' && !await SalesCampaign.exists({ _id: policy.scopeId })) throw new AppError(400, 'CAMPAIGN_NOT_FOUND', 'Select an existing campaign');
}
export class SalesRevenueService {
  static async overview(auth: AuthenticatedUser, raw: unknown) {
    await access(auth);
    const selection = revenueQuerySchema.parse(raw), now = new Date();
    const range = resolveBusinessRange(businessQuery.parse({ period: 'CUSTOM', from: selection.from, to: selection.to }), now);
    const [finance, operations] = await Promise.all([
      SalesRevenueRepository.financials(range.from, range.to, selection.currency, now, selection.campaignId),
      SalesRevenueRepository.operations(range.from, range.to),
    ]);
    await AuditService.record({ actorUserId: auth.userId, action: 'sales.revenue.viewed', resourceType: 'SalesRevenue', metadata: { ...selection } });
    return { asOf: now, range: { from: range.from, to: range.to, timeZone: 'Africa/Nairobi' }, currency: selection.currency,
      ...finance, currentARR: { amountMinor: String(BigInt(finance.currentMRR.amountMinor) * 12n), count: finance.currentMRR.count },
      operations, operationsScope: 'ALL_CRM_RECORDS', growthIntelligence: growthReadiness(operations), limitations,
      unavailable: ['New / expansion / contraction / churned MRR', 'Recognized revenue', 'Net collections after refunds and fees', 'Gross margin / net profit', 'CAC / LTV / retention rate', 'Monetary pipeline coverage', 'Agent / team revenue attribution'],
    };
  }
  static async list(auth: AuthenticatedUser, raw: unknown) {
    await access(auth); const { page } = revenueTargetPageSchema.parse(raw);
    const [items, total] = await Promise.all([SalesRevenueTarget.find().select('-commandHash -commandId').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 20).limit(20).lean(), SalesRevenueTarget.countDocuments()]);
    return { items, total, page };
  }
  static async view(auth: AuthenticatedUser, id: string) {
    await access(auth); objectId.parse(id);
    const target = await SalesRevenueTarget.findById(id).select('-commandHash -commandId').lean();
    if (!target) throw new AppError(404, 'TARGET_NOT_FOUND', 'Revenue target not found');
    const policy = revenueTargetPolicySchema.parse(target.policy), now = new Date(), period = targetPeriod(policy);
    let actualMinor: string | null = null, unavailableReason: string | null = null;
    if (['AGENT', 'TEAM'].includes(policy.scope)) unavailableReason = 'Auditable monetary attribution for agents and teams is not available.';
    else if (['NEW_MRR', 'RECOGNIZED_REVENUE'].includes(policy.metric)) unavailableReason = 'Historical movement or revenue recognition evidence is not available.';
    else if (now < period.from) unavailableReason = 'The target period has not started.';
    else if (policy.metric !== 'COLLECTED_CASH' && now >= period.to) unavailableReason = 'A historical recurring revenue snapshot is not available.';
    else {
      const finance = await SalesRevenueRepository.financials(period.from, new Date(Math.min(now.getTime(), period.to.getTime())), policy.currency, now, policy.scope === 'CAMPAIGN' ? policy.scopeId : undefined);
      actualMinor = policy.metric === 'COLLECTED_CASH' ? finance.cash.amountMinor : String(BigInt(finance.currentMRR.amountMinor) * (policy.metric === 'CURRENT_ARR' ? 12n : 1n));
    }
    const history = await AuditLog.find({ resourceType: 'SalesRevenueTarget', resourceId: target._id, action: { $in: ['sales.revenue.target.created', 'sales.revenue.target.updated'] } }).select('action actorUserId metadata createdAt').sort({ createdAt: -1, _id: -1 }).limit(20).lean();
    await AuditService.record({ actorUserId: auth.userId, action: 'sales.revenue.target.viewed', resourceType: 'SalesRevenueTarget', resourceId: target._id });
    return { target, period, asOf: now, ...targetPerformance(policy, actualMinor), unavailableReason, limitations, history, historyLimit: 20 };
  }
  static async create(auth: AuthenticatedUser, raw: unknown) {
    await access(auth); assertFreshAdmin(auth); await assertRevenueIndexes();
    const input = createRevenueTargetSchema.parse(raw); await validateScope(input.policy);
    const commandHash = createHash('sha256').update(JSON.stringify({ policy: input.policy, reason: input.reason })).digest('hex');
    const replay = async () => {
      const existing = await SalesRevenueTarget.findOne({ requestedBy: auth.userId, commandId: input.commandId });
      if (!existing) return null;
      if (existing.commandHash !== commandHash) throw new AppError(409, 'COMMAND_CONFLICT', 'Use a new command for changed target details');
      return { id: String(existing._id) };
    };
    const prior = await replay(); if (prior) return prior;
    try {
      return await salesTransaction(async session => {
        const [target] = await SalesRevenueTarget.create([{ requestedBy: auth.userId, commandId: input.commandId, commandHash, policy: input.policy }], { session });
        if (!target) throw new AppError(500, 'TARGET_WRITE_FAILED', 'Could not save target');
        await AuditService.record({ actorUserId: auth.userId, action: 'sales.revenue.target.created', resourceType: 'SalesRevenueTarget', resourceId: target._id, metadata: { after: input.policy, reason: input.reason, revision: 0 } }, session);
        return { id: String(target._id) };
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) { const existing = await replay(); if (existing) return existing; }
      throw error;
    }
  }
  static async update(auth: AuthenticatedUser, id: string, raw: unknown) {
    await access(auth); assertFreshAdmin(auth); objectId.parse(id);
    const input = updateRevenueTargetSchema.parse(raw); await validateScope(input.policy);
    return salesTransaction(async session => {
      const target = await SalesRevenueTarget.findOne({ _id: id, revision: input.revision }).session(session);
      if (!target) throw new AppError(409, 'TARGET_CHANGED', 'Reload this target before editing');
      const before = revenueTargetPolicySchema.parse(target.policy);
      target.policy = input.policy; target.revision += 1; await target.save({ session });
      await AuditService.record({ actorUserId: auth.userId, action: 'sales.revenue.target.updated', resourceType: 'SalesRevenueTarget', resourceId: target._id, metadata: { before, after: input.policy, reason: input.reason, revision: target.revision } }, session);
      return { id, revision: target.revision };
    });
  }
}
