import { Types, type PipelineStage } from 'mongoose';
import { SubscriptionInvoice } from '../../database/models/SubscriptionInvoice.js';
import { SalesLead } from '../../database/models/SalesLead.js';
import { SalesMessage } from '../../database/models/SalesCommunication.js';
import { SalesAgentRun, SalesAgentApproval } from '../../database/models/SalesAgent.js';
import { SalesMeeting } from '../../database/models/SalesMeeting.js';
import { PropertyOnboardingRequest } from '../../database/models/PropertyOnboardingRequest.js';
import { invoicePipeline, organizationPipeline } from '../platform-control/platform-business.repository.js';
import { businessQuery } from '../platform-control/platform-business.schemas.js';

const query = businessQuery.parse({ dataset: 'LIVE', plan: 'ALL' });
const integerMinor = (path: string) => ({ $cond: [{ $isNumber: path }, { $and: [{ $gte: [path, 0] }, { $lte: [path, Number.MAX_SAFE_INTEGER] }, { $eq: [{ $mod: [path, 1] }, 0] }] }, false] });
type Total = { amountMinor: string; count: number };
type Counts = { _id: string | null; count: number };
type Finance = { cash: Total[]; currentMRR: Total[]; dailyCash: Array<{ day: string; amountMinor: string; count: number }>; campaigns: Array<{ campaignId: string | null; amountMinor: string; count: number }> };
const totalStages: NonNullable<PipelineStage.Facet['$facet']>[string] = [{ $group: { _id: null, amount: { $sum: { $toDecimal: '$totalMinor' } }, count: { $sum: 1 } } }, { $project: { _id: 0, amountMinor: { $toString: '$amount' }, count: 1 } }];

export const SalesRevenueRepository = {
  async financials(from: Date, to: Date, currency: string, now: Date, campaignId?: string) {
    // Reuse platform billing proof and LIVE-dataset scoping. Legacy floating totals never enter this projection.
    const pipeline: PipelineStage[] = [
      { $match: { provider: 'PAYSTACK', currency, status: 'PAID', paidAt: { $type: 'date', $lte: now }, $expr: integerMinor('$totalMinor') } },
      ...invoicePipeline(query, now),
      { $match: { verified: true, provider: 'PAYSTACK', currency, $expr: integerMinor('$totalMinor') } },
      // Renewals use the protected top-level link. Mutable metadata and today's
      // catalog are never promoted into historical contract or price evidence.
      { $lookup: { from: 'organizationcontracts', let: { contract: { $ifNull: ['$contractId', { $cond: [{ $eq: [{ $type: '$commercialSnapshot' }, 'object'] }, '$originContractId', null] }] }, org: '$organizationId' }, pipeline: [{ $match: { status: 'SIGNED', $expr: { $and: [{ $eq: ['$_id', '$$contract'] }, { $eq: ['$organizationId', '$$org'] }] } } }, { $project: { _id: 1 } }], as: 'signedContract' } },
      { $match: { 'signedContract.0': { $exists: true } } },
      { $lookup: { from: 'salesattributions', let: { org: '$organizationId' }, pipeline: [{ $match: { milestone: 'REGISTERED', status: 'ATTRIBUTED', $expr: { $eq: ['$organizationId', '$$org'] } } }, { $project: { referralCampaignId: 1 } }, { $limit: 1 }], as: 'attribution' } },
      { $set: { campaignId: { $ifNull: [{ $arrayElemAt: ['$attribution.referralCampaignId', 0] }, null] } } },
      ...(campaignId ? [{ $match: { campaignId: new Types.ObjectId(campaignId) } }] : []),
      { $facet: {
        cash: [{ $match: { paidAt: { $gte: from, $lt: to } } }, ...totalStages],
        dailyCash: [{ $match: { paidAt: { $gte: from, $lt: to } } }, { $group: { _id: { $dateToString: { date: '$paidAt', format: '%Y-%m-%d', timezone: 'Africa/Nairobi' } }, amount: { $sum: { $toDecimal: '$totalMinor' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }, { $project: { _id: 0, day: '$_id', amountMinor: { $toString: '$amount' }, count: 1 } }],
        campaigns: [{ $match: { paidAt: { $gte: from, $lt: to } } }, { $group: { _id: '$campaignId', amount: { $sum: { $toDecimal: '$totalMinor' } }, count: { $sum: 1 } } }, { $sort: { amount: -1, _id: 1 } }, { $limit: 20 }, { $project: { _id: 0, campaignId: { $toString: '$_id' }, amountMinor: { $toString: '$amount' }, count: 1 } }],
        currentMRR: [
          { $group: { _id: '$organizationId', paidSubscriptionIds: { $addToSet: '$subscriptionId' } } },
          { $lookup: { from: 'organizations', let: { org: '$_id' }, pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$org'] } } }, ...organizationPipeline(query, now)] as NonNullable<PipelineStage.Lookup['$lookup']['pipeline']>, as: 'current' } },
          { $unwind: '$current' },
          { $match: { 'current.active': true, 'current.currency': currency, $expr: { $and: [integerMinor('$current.monthlyMinor'), { $in: ['$current.subscription._id', '$paidSubscriptionIds'] }] } } },
          { $group: { _id: null, amount: { $sum: { $toDecimal: '$current.monthlyMinor' } }, count: { $sum: 1 } } },
          { $project: { _id: 0, amountMinor: { $toString: '$amount' }, count: 1 } },
        ],
      } },
    ];
    const [result] = await SubscriptionInvoice.aggregate<Finance>(pipeline).option({ maxTimeMS: 15000 }).exec();
    return { cash: result?.cash[0] ?? { amountMinor: '0', count: 0 }, currentMRR: result?.currentMRR[0] ?? { amountMinor: '0', count: 0 }, dailyCash: result?.dailyCash ?? [], campaigns: result?.campaigns ?? [] };
  },
  async operations(from: Date, to: Date) {
    const window = { $gte: from, $lt: to };
    const [pipeline, qualification, meetings, messages, agents, approvals, assistance] = await Promise.all([
      SalesLead.aggregate<Counts>([{ $match: { mergedInto: { $exists: false }, createdAt: window } }, { $group: { _id: '$stage', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 30 }]).option({ maxTimeMS: 10000 }),
      SalesLead.aggregate<Counts>([{ $match: { mergedInto: { $exists: false }, createdAt: window } }, { $group: { _id: '$leadStatus', count: { $sum: 1 } } }]).option({ maxTimeMS: 10000 }),
      SalesMeeting.aggregate<Counts>([{ $match: { startsAt: window } }, { $group: { _id: '$status', count: { $sum: 1 } } }]).option({ maxTimeMS: 10000 }),
      SalesMessage.aggregate<{ channel: string; accepted: number; delivered: number; replied: number; estimatedCostMicroUsd: string }>([{ $match: { providerAcceptedAt: window } }, { $group: { _id: '$channel', accepted: { $sum: 1 }, delivered: { $sum: { $cond: [{ $eq: ['$deliveryStatus', 'DELIVERED'] }, 1, 0] } }, replied: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$lastReplyAt', null] }, null] }, 1, 0] } }, cost: { $sum: { $toDecimal: { $ifNull: ['$estimatedCostMicroUsd', 0] } } } } }, { $project: { _id: 0, channel: '$_id', accepted: 1, delivered: 1, replied: 1, estimatedCostMicroUsd: { $toString: '$cost' } } }]).option({ maxTimeMS: 10000 }),
      SalesAgentRun.aggregate<{ agent: string; status: string; count: number; estimatedCostMicroUsd: string; unknownCostRuns: number }>([{ $match: { createdAt: window } }, { $group: { _id: { agent: '$agent', status: '$status' }, count: { $sum: 1 }, unknownCostRuns: { $sum: { $cond: [{ $eq: ['$costBasis', 'CONFIGURED_RATE_ESTIMATE'] }, 0, 1] } }, cost: { $sum: { $cond: [{ $eq: ['$costBasis', 'CONFIGURED_RATE_ESTIMATE'] }, { $toDecimal: '$costMicroUsd' }, 0] } } } }, { $project: { _id: 0, agent: '$_id.agent', status: '$_id.status', count: 1, unknownCostRuns: 1, estimatedCostMicroUsd: { $toString: '$cost' } } }]).option({ maxTimeMS: 10000 }),
      SalesAgentApproval.aggregate<Counts>([{ $match: { createdAt: window } }, { $group: { _id: '$status', count: { $sum: 1 } } }]).option({ maxTimeMS: 10000 }),
      PropertyOnboardingRequest.aggregate<Counts>([{ $match: { createdAt: window } }, { $group: { _id: '$status', count: { $sum: 1 } } }]).option({ maxTimeMS: 10000 }),
    ]);
    return { pipeline, qualification, meetings, messages, agents, approvals, assistance };
  },
  async customerEngagement(leadId: Types.ObjectId) {
    const [messages] = await SalesMessage.aggregate<{ accepted: number; delivered: number; replied: number }>([{ $match: { leadId, providerAcceptedAt: { $exists: true } } }, { $group: { _id: null, accepted: { $sum: 1 }, delivered: { $sum: { $cond: [{ $eq: ['$deliveryStatus', 'DELIVERED'] }, 1, 0] } }, replied: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$lastReplyAt', null] }, null] }, 1, 0] } } } }, { $project: { _id: 0 } }]).option({ maxTimeMS: 10000 });
    return { source: 'Persisted provider acceptance/delivery and correlated replies', window: 'All retained records for this canonical customer; merged history may be incomplete', messages: messages ?? { accepted: 0, delivered: 0, replied: 0 }, prediction: false };
  },
};
