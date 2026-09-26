import { OrganizationSubscription } from '../../database/models/OrganizationSubscription.js';
import { SubscriptionPlan } from '../../database/models/SubscriptionPlan.js';
import { Property } from '../../database/models/Property.js';
import { Unit } from '../../database/models/Unit.js';
import { Tenant } from '../../database/models/Tenant.js';
import { OrganizationMembership } from '../../database/models/OrganizationMembership.js';
import { AppError } from '../errors/AppError.js';

export type LimitMetric = 'PROPERTIES' | 'UNITS' | 'USERS' | 'TENANTS';

export class EntitlementService {
  static async getPlan(organizationId: string) {
    const subscription = await OrganizationSubscription.findOne({ organizationId }).populate('planId').lean();
    if (!subscription || !['ACTIVE', 'TRIALING'].includes(subscription.status)) throw new AppError(402, 'SUBSCRIPTION_REQUIRED', 'An active subscription is required');
    return subscription.planId as unknown as { _id: unknown; key: string; entitlements: { maxProperties: number; maxUnits: number; maxUsers: number; maxTenants: number; features: string[] } };
  }

  static async assertFeature(organizationId: string, feature: string) {
    const plan = await this.getPlan(organizationId);
    if (!plan.entitlements.features.includes(feature)) throw new AppError(403, 'FEATURE_NOT_ENTITLED', `Subscription does not include feature: ${feature}`);
  }

  static async count(organizationId: string, metric: LimitMetric) {
    if (metric === 'PROPERTIES') return Property.countDocuments({ organizationId, status: { $ne: 'ARCHIVED' } });
    if (metric === 'UNITS') return Unit.countDocuments({ organizationId, status: { $ne: 'INACTIVE' } });
    if (metric === 'TENANTS') return Tenant.countDocuments({ organizationId, status: { $ne: 'INACTIVE' } });
    return OrganizationMembership.countDocuments({ organizationId, status: 'ACTIVE' });
  }

  static async assertCapacity(organizationId: string, metric: LimitMetric, additional = 1) {
    const plan = await this.getPlan(organizationId);
    const limits: Record<LimitMetric, number> = {
      PROPERTIES: plan.entitlements.maxProperties,
      UNITS: plan.entitlements.maxUnits,
      USERS: plan.entitlements.maxUsers,
      TENANTS: plan.entitlements.maxTenants
    };
    const limit = limits[metric];
    if (limit === -1) return;
    const current = await this.count(organizationId, metric);
    if (current + additional > limit) throw new AppError(403, 'PLAN_LIMIT_REACHED', `${metric.toLowerCase()} limit reached for ${plan.key} plan`, { metric, limit, current, requested: additional });
  }
}
