import { EntitlementService } from '../../core/billing/entitlement.service.js';
import { priceSnapshot, type CommercialSnapshot } from '../onboarding/contract-snapshot.js';
import { startPrepaidCheckout, reconcilePrepaidCheckouts } from './prepaid-billing.service.js';
import { SubscriptionPlan } from '../../database/models/SubscriptionPlan.js';
import { OrganizationSubscription } from '../../database/models/OrganizationSubscription.js';
import { SubscriptionInvoice } from '../../database/models/SubscriptionInvoice.js';
import { UsageRecord } from '../../database/models/UsageRecord.js';
import { BillingEvent } from '../../database/models/BillingEvent.js';
import { Organization } from '../../database/models/Organization.js';
import { Property } from '../../database/models/Property.js';
import { Unit } from '../../database/models/Unit.js';
import { User } from '../../database/models/User.js';
import { OrganizationMembership } from '../../database/models/OrganizationMembership.js';
import { Tenant } from '../../database/models/Tenant.js';
import { AppError } from '../../core/errors/AppError.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { PaystackBillingProvider, type BillingProviderKey } from '../../core/billing/billing-provider.js';
import { PaystackProvider } from '../../core/integrations/paystack.provider.js';
import { IntegrationService } from '../integrations/integration.service.js';
import { AuditService } from '../audit/audit.service.js';

function addInterval(date: Date, interval: 'MONTH' | 'QUARTER' | 'YEAR') { const d = new Date(date); if (interval === 'YEAR') d.setUTCFullYear(d.getUTCFullYear() + 1); else d.setUTCMonth(d.getUTCMonth() + (interval === 'QUARTER' ? 3 : 1)); return d; }
function invoiceNumber() { return `INV-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,8).toUpperCase()}`; }

export class BillingService {
  static startPrepaidCheckout = startPrepaidCheckout;
  static async listPlans(activeOnly = true) { return SubscriptionPlan.find(activeOnly ? { active: true } : {}).sort({ amount: 1 }).lean(); }
  static async createPlan(auth: NonNullable<Express.Request['auth']>, data: Record<string, unknown>) { AuthorizationService.assertPlatformAdmin(auth); return SubscriptionPlan.create(data); }
  static async updatePlan(auth: NonNullable<Express.Request['auth']>, planId: string, data: Record<string, unknown>) {
    AuthorizationService.assertPlatformAdmin(auth);
    const existing = await SubscriptionPlan.findById(planId);
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Subscription plan not found');
    const priceChanged = (data.amount !== undefined && data.amount !== existing.amount) || (data.currency !== undefined && data.currency !== existing.currency) || (data.billingInterval !== undefined && data.billingInterval !== existing.billingInterval);
    if (priceChanged && await OrganizationSubscription.exists({ planId, provider: 'PAYSTACK', status: { $in: ['PENDING', 'ACTIVE', 'PAST_DUE', 'PAUSED'] } })) throw new AppError(409, 'PLAN_PRICE_LOCKED', 'Create a new plan instead of changing the price of an in-use Paystack plan');
    return SubscriptionPlan.findByIdAndUpdate(planId, data, { new: true, runValidators: true });
  }

  static async getSubscription(auth: NonNullable<Express.Request['auth']>, organizationId: string) {
    AuthorizationService.assertCan(auth, 'billing.subscription.view', { organizationId });
    return OrganizationSubscription.findOne({ organizationId }).populate('planId').lean();
  }

  static async subscribe(auth: NonNullable<Express.Request['auth']>, organizationId: string, planKey: string, providerKey: BillingProviderKey, email?: string, prepaidMonths = 3) {
    AuthorizationService.assertCan(auth, 'billing.subscription.manage', { organizationId });
    if (providerKey === 'INTERNAL') AuthorizationService.assertPlatformAdmin(auth);
    const organization = await Organization.findById(organizationId).lean(); if (!organization) throw new AppError(404,'NOT_FOUND','Organization not found');
    if (organization.onboarding) {
      if (providerKey !== 'PAYSTACK') throw new AppError(409, 'PROVIDER_CONFIRMATION_REQUIRED', 'Onboarding requires verified prepaid payment');
      const { LandlordOnboardingService } = await import('../onboarding/landlord-onboarding.service.js');
      const state = await LandlordOnboardingService.status(auth, organizationId);
      const snapshot = state.contract?.snapshot as { planKey?: string; prepaidMonths?: number } | undefined;
      if (snapshot?.planKey !== planKey || snapshot.prepaidMonths !== prepaidMonths) throw new AppError(409, 'SIGNED_CONTRACT_REQUIRED', 'Review and sign the matching onboarding agreement first');
      await LandlordOnboardingService.checkout(auth, organizationId);
      return OrganizationSubscription.findOne({ organizationId }).populate('planId');
    }
    const plan = await SubscriptionPlan.findOne({ key: planKey, active: true }); if (!plan) throw new AppError(404,'PLAN_NOT_FOUND','Active subscription plan not found');
    const existing = await OrganizationSubscription.findOne({ organizationId });
    if (existing && ['PENDING','ACTIVE','TRIALING','PAST_DUE','PAUSED'].includes(existing.status)) throw new AppError(409,'SUBSCRIPTION_EXISTS','Organization already has an active or pending subscription');
    if (!Number.isInteger(prepaidMonths) || prepaidMonths < 3 || prepaidMonths > 24) throw new AppError(400, 'INVALID_PREPAID_PERIOD', 'The initial prepaid period must be between 3 and 24 months');
    const now = new Date(); const periodEnd = new Date(now); periodEnd.setUTCMonth(periodEnd.getUTCMonth() + prepaidMonths); const trialEnd = plan.trialDays > 0 ? new Date(now.getTime() + plan.trialDays * 86400000) : undefined;
    let remote: Awaited<ReturnType<PaystackBillingProvider['createSubscription']>> | undefined;
    let payerEmail: string | undefined;
    if (providerKey === 'PAYSTACK') {
      payerEmail = email ?? (await User.findById(auth.userId).select('email').lean())?.email ?? undefined;
      if (!payerEmail) throw new AppError(400, 'BILLING_EMAIL_REQUIRED', 'A billing email is required for Paystack checkout');
      if (plan.amount <= 0) throw new AppError(400, 'INVALID_PLAN_AMOUNT', 'Paystack plans must have a positive amount');
      const provider = new PaystackBillingProvider();
      const customer = await provider.createCustomer({ organizationId, name: organization.name, email: payerEmail });
      remote = await provider.createSubscription({ customerReference: customer.providerCustomerId, email: payerEmail, organizationId, planKey: plan.key, currency: plan.currency, amount: plan.amount, interval: plan.billingInterval, prepaidMonths });
    }
    const subscription = await OrganizationSubscription.findOneAndUpdate({ organizationId }, { $set: { planId: plan._id, status: providerKey === 'PAYSTACK' ? 'PENDING' : trialEnd ? 'TRIALING' : 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: periodEnd, trialEndsAt: providerKey === 'INTERNAL' ? trialEnd : undefined, provider: providerKey, providerCustomerId: remote?.providerCustomerId, providerCheckoutReference: remote?.checkoutReference, providerCheckoutUrl: remote?.checkoutUrl, providerPlanCode: remote?.providerPlanCode, billingEmail: payerEmail, checkoutReferences: [], metadata: { prepaidMonths }, cancelAtPeriodEnd: false, createdBy: auth.userId, updatedBy: auth.userId }, $unset: { providerSubscriptionId: 1, providerEmailToken: 1, pendingPlanId: 1, pendingPlanEffectiveAt: 1, cancelledAt: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await SubscriptionInvoice.create({ organizationId, subscriptionId: subscription._id, invoiceNumber: invoiceNumber(), periodStart: now, periodEnd, subtotal: plan.amount * prepaidMonths, tax: 0, total: plan.amount * prepaidMonths, amountPaid: 0, currency: plan.currency, status: providerKey === 'INTERNAL' && trialEnd ? 'DRAFT' : 'OPEN', dueDate: now, provider: providerKey, createdBy: auth.userId, updatedBy: auth.userId, lineItems: [{ description: `${plan.name} initial prepaid access`, quantity: prepaidMonths, unitAmount: plan.amount }] });
    return OrganizationSubscription.findById(subscription._id).populate('planId');
  }

  static async cancel(auth: NonNullable<Express.Request['auth']>, organizationId: string, atPeriodEnd: boolean) { AuthorizationService.assertCan(auth,'billing.subscription.manage',{organizationId}); const subscription = await OrganizationSubscription.findOne({organizationId}).select('+providerEmailToken'); if (!subscription) throw new AppError(404,'NOT_FOUND','Subscription not found'); if (subscription.provider === 'PAYSTACK') { if (!subscription.providerSubscriptionId || !subscription.providerEmailToken) throw new AppError(409,'SUBSCRIPTION_NOT_READY','Paystack subscription is not ready for cancellation'); await new PaystackBillingProvider().cancelSubscription(subscription.providerSubscriptionId, subscription.providerEmailToken); } subscription.cancelAtPeriodEnd = atPeriodEnd; subscription.updatedBy = auth.userId; if (!atPeriodEnd) { subscription.status='CANCELLED'; subscription.cancelledAt=new Date(); } await subscription.save(); return OrganizationSubscription.findById(subscription._id); }

  static async recoverCheckout(auth: NonNullable<Express.Request['auth']>, organizationId: string) {
    AuthorizationService.assertCan(auth, 'billing.subscription.manage', { organizationId });
    const subscription = await OrganizationSubscription.findOne({ organizationId, provider: 'PAYSTACK', status: 'PENDING' }).select('+billingEmail');
    if (!subscription || !subscription.providerCheckoutReference) throw new AppError(409, 'NO_PENDING_CHECKOUT', 'No pending Paystack checkout exists');
    const verified = await new PaystackProvider().query(subscription.providerCheckoutReference);
    if (verified.providerTransactionId !== subscription.providerCheckoutReference) throw new AppError(409, 'PROVIDER_REFERENCE_MISMATCH', 'Paystack returned a different checkout reference');
    if (verified.status === 'CONFIRMED') {
      await IntegrationService.processPaystack({ event: 'charge.success', data: { ...(verified.raw as Record<string, unknown>), status: 'success', reference: verified.providerTransactionId, amount: verified.amountMinorUnits, currency: verified.currency, paid_at: verified.paidAt?.toISOString() } });
      return OrganizationSubscription.findById(subscription._id).populate('planId');
    }
    if (verified.status === 'PENDING') return OrganizationSubscription.findById(subscription._id).populate('planId');
    const plan = await SubscriptionPlan.findById(subscription.planId);
    if (!plan || !subscription.providerPlanCode || !subscription.providerCustomerId || !subscription.billingEmail) throw new AppError(409, 'CHECKOUT_RECOVERY_UNAVAILABLE', 'Checkout recovery needs a configured Paystack plan and billing email');
    const lockedAt = new Date();
    const claimed = await OrganizationSubscription.findOneAndUpdate({ _id: subscription._id, providerCheckoutReference: verified.providerTransactionId, status: 'PENDING', $or: [{ checkoutRecoveryLockedAt: { $exists: false } }, { checkoutRecoveryLockedAt: { $lt: new Date(lockedAt.getTime() - 120_000) } }] }, { $set: { checkoutRecoveryLockedAt: lockedAt } });
    if (!claimed) throw new AppError(409, 'CHECKOUT_RECOVERY_IN_PROGRESS', 'Checkout recovery is already in progress');
    try {
      const configuredPrepaidMonths = (subscription.metadata as { prepaidMonths?: unknown } | undefined)?.prepaidMonths;
      const prepaidMonths = typeof configuredPrepaidMonths === 'number' ? configuredPrepaidMonths : 3;
      const commercial = (subscription.metadata as { commercialSnapshot?: { recurringMinor: number; totalMinor: number; currency: string; billingCycle: 'MONTH' | 'QUARTER' | 'YEAR'; planKey: string } } | undefined)?.commercialSnapshot;
      if (commercial) await (await import('../platform-control/platform-control.guard.js')).assertSwitchEnabled('PAYSTACK_PAYMENTS');
      const retry = await new PaystackBillingProvider().retryCheckout(subscription.providerPlanCode, { customerReference: subscription.providerCustomerId, email: subscription.billingEmail, organizationId, planKey: plan.key, currency: plan.currency, amount: plan.amount, interval: commercial?.billingCycle ?? plan.billingInterval, prepaidMonths, ...(commercial ? { initialAmount: commercial.totalMinor / 100, amount: commercial.recurringMinor / 100, currency: commercial.currency, planKey: commercial.planKey, callbackPath: '/onboarding' } : {}) });
      const updated = await OrganizationSubscription.findOneAndUpdate({ _id: subscription._id, providerCheckoutReference: verified.providerTransactionId, checkoutRecoveryLockedAt: lockedAt, status: 'PENDING' }, { $push: { checkoutReferences: verified.providerTransactionId }, $set: { providerCheckoutReference: retry.checkoutReference, providerCheckoutUrl: retry.checkoutUrl, updatedBy: auth.userId }, $unset: { checkoutRecoveryLockedAt: 1 } }, { new: true });
      if (!updated) throw new AppError(409, 'CHECKOUT_RECOVERY_CONFLICT', 'Checkout changed during recovery; contact support before making another payment');
      await AuditService.record({ organizationId: subscription.organizationId, actorUserId: auth.userId, action: 'BILLING_CHECKOUT_RETRIED', resourceType: 'OrganizationSubscription', resourceId: subscription._id, metadata: { previousReference: verified.providerTransactionId, newReference: retry.checkoutReference } });
      return OrganizationSubscription.findById(subscription._id).populate('planId');
    } catch (error) {
      await OrganizationSubscription.updateOne({ _id: subscription._id, checkoutRecoveryLockedAt: lockedAt }, { $unset: { checkoutRecoveryLockedAt: 1 } });
      throw error;
    }
  }

  static async listInvoices(auth: NonNullable<Express.Request['auth']>, organizationId: string, query: { status?: string; page: number; pageSize: number }) { AuthorizationService.assertCan(auth,'billing.invoice.view',{organizationId}); const filter: Record<string, unknown> = { organizationId }; if (query.status) filter.status=query.status; const [items,total]=await Promise.all([SubscriptionInvoice.find(filter).sort({dueDate:-1}).skip((query.page-1)*query.pageSize).limit(query.pageSize).lean(), SubscriptionInvoice.countDocuments(filter)]); return { items, pagination:{page:query.page,pageSize:query.pageSize,total,totalPages:Math.ceil(total/query.pageSize),hasNextPage:query.page*query.pageSize<total,hasPreviousPage:query.page>1} }; }

  static async recordUsage(auth: NonNullable<Express.Request['auth']>, organizationId: string, data: { metric: 'PROPERTIES'|'UNITS'|'USERS'|'TENANTS'|'STORAGE_BYTES'|'API_REQUESTS'; periodStart: Date; periodEnd: Date; quantity: number; source: 'SNAPSHOT'|'EVENT'|'MANUAL'|'SYSTEM'; sourceRef?: string }) { AuthorizationService.assertCan(auth,'billing.usage.manage',{organizationId}); return UsageRecord.findOneAndUpdate({organizationId,metric:data.metric,periodStart:data.periodStart,periodEnd:data.periodEnd}, {...data}, {upsert:true,new:true,setDefaultsOnInsert:true}); }

  static async usageSnapshot(auth: NonNullable<Express.Request['auth']>, organizationId: string, periodStart: Date, periodEnd: Date) { AuthorizationService.assertCan(auth,'billing.usage.view',{organizationId}); const [properties,units,users,tenants]=await Promise.all([Property.countDocuments({organizationId}),Unit.countDocuments({organizationId}),OrganizationMembership.countDocuments({organizationId,status:'ACTIVE'}),Tenant.countDocuments({organizationId})]); return { periodStart, periodEnd, metrics:{PROPERTIES:properties,UNITS:units,USERS:users,TENANTS:tenants} }; }

  static async entitlements(auth: NonNullable<Express.Request['auth']>, organizationId: string) { AuthorizationService.assertCan(auth,'billing.entitlement.view',{organizationId}); const sub=await OrganizationSubscription.findOne({organizationId}).populate('planId').lean(); if (!sub) return {status:'UNSUBSCRIBED',entitlements:null}; return {status:sub.status, plan:sub.planId}; }

  static async ingestEvent(data: { eventId:string; organizationId?:string; provider: BillingProviderKey; type:'SUBSCRIPTION_CREATED'|'SUBSCRIPTION_UPDATED'|'SUBSCRIPTION_CANCELLED'|'INVOICE_CREATED'|'INVOICE_PAID'|'INVOICE_FAILED'|'PAYMENT_FAILED'|'PAYMENT_REVERSED'; externalReference?:string; payload?:unknown }) { const existing=await BillingEvent.findOne({eventId:data.eventId}); if(existing) return existing; return BillingEvent.create({...data,status:'RECEIVED'}); }


  static async changePlan(auth: NonNullable<Express.Request['auth']>, organizationId: string, planKey: string, atPeriodEnd: boolean) {
    AuthorizationService.assertCan(auth, 'billing.subscription.manage', { organizationId });
    const subscription = await OrganizationSubscription.findOne({ organizationId });
    if (!subscription) throw new AppError(404, 'NOT_FOUND', 'Subscription not found');
    const plan = await SubscriptionPlan.findOne({ key: planKey, active: true });
    if (!plan) throw new AppError(404, 'PLAN_NOT_FOUND', 'Active subscription plan not found');
    if (subscription.provider === 'PAYSTACK') {
      if (!atPeriodEnd) throw new AppError(409, 'PLAN_CHANGE_AT_RENEWAL_ONLY', 'Paystack plan changes take effect at the next paid renewal');
      if (subscription.status !== 'ACTIVE' || subscription.cancelAtPeriodEnd || subscription.currentPeriodEnd <= new Date() || !subscription.providerSubscriptionId || !subscription.providerPlanCode) throw new AppError(409, 'SUBSCRIPTION_NOT_READY', 'An active renewing Paystack subscription is required');
      const shared = await OrganizationSubscription.exists({ provider: 'PAYSTACK', providerPlanCode: subscription.providerPlanCode, organizationId: { $ne: subscription.organizationId } });
      if (shared) throw new AppError(409, 'SHARED_PROVIDER_PLAN', 'Cannot change a Paystack plan shared with another organization');
      if (plan.amount <= 0) throw new AppError(400, 'INVALID_PLAN_AMOUNT', 'Paystack plans must have a positive amount');
      if (String(subscription.planId) === String(plan._id) && !subscription.pendingPlanId) return subscription.populate('planId');
      const metadata = subscription.metadata as { commercialSnapshot?: CommercialSnapshot };
      const commercial = metadata.commercialSnapshot ? { ...metadata.commercialSnapshot, ...priceSnapshot(plan, metadata.commercialSnapshot.unitCount, metadata.commercialSnapshot.prepaidMonths), planId: String(plan._id) } : undefined;
      await new PaystackBillingProvider().updatePlan(subscription.providerPlanCode, { planKey: plan.key, amount: commercial ? commercial.recurringMinor / 100 : plan.amount, currency: plan.currency, interval: plan.billingInterval });
      subscription.pendingPlanId = String(subscription.planId) === String(plan._id) ? undefined : plan._id;
      subscription.pendingPlanEffectiveAt = subscription.pendingPlanId ? subscription.currentPeriodEnd : undefined;
      if (commercial) subscription.set('metadata', { ...subscription.metadata, pendingCommercialSnapshot: subscription.pendingPlanId ? commercial : undefined });
      subscription.updatedBy = auth.userId;
      await subscription.save();
      await AuditService.record({ organizationId: subscription.organizationId, actorUserId: auth.userId, action: 'BILLING_PLAN_CHANGE_SCHEDULED', resourceType: 'OrganizationSubscription', resourceId: subscription._id, metadata: { fromPlanId: String(subscription.planId), toPlanId: String(plan._id), effectiveAt: subscription.currentPeriodEnd.toISOString() } });
      return subscription.populate('planId');
    }
    if (String(subscription.planId) === String(plan._id)) return subscription.populate('planId');
    if (atPeriodEnd) { subscription.pendingPlanId = plan._id; subscription.pendingPlanEffectiveAt = subscription.currentPeriodEnd; subscription.updatedBy = auth.userId; await subscription.save(); return subscription.populate('planId'); }
    const now = new Date(); subscription.planId = plan._id; subscription.currentPeriodStart = now; subscription.currentPeriodEnd = addInterval(now, plan.billingInterval); subscription.pendingPlanId = undefined; subscription.pendingPlanEffectiveAt = undefined; subscription.updatedBy = auth.userId; await subscription.save();
    return subscription.populate('planId');
  }

  static async markInvoicePaid(auth: NonNullable<Express.Request['auth']>, organizationId: string, invoiceId: string, amount: number) {
    AuthorizationService.assertCan(auth, 'billing.invoice.manage', { organizationId });
    AuthorizationService.assertPlatformAdmin(auth);
    const invoice = await SubscriptionInvoice.findOne({ _id: invoiceId, organizationId });
    if (!invoice) throw new AppError(404, 'NOT_FOUND', 'Subscription invoice not found');
    if (invoice.provider === 'PAYSTACK') throw new AppError(409, 'PROVIDER_CONFIRMATION_REQUIRED', 'Paystack invoices require a verified provider event');
    if (invoice.status === 'PAID') return invoice;
    if (amount < invoice.total) throw new AppError(400, 'PAYMENT_INCOMPLETE', 'Payment amount is less than the invoice total');
    invoice.amountPaid = invoice.total; invoice.status = 'PAID'; invoice.paidAt = new Date(); invoice.updatedBy = auth.userId; await invoice.save();
    await OrganizationSubscription.findOneAndUpdate({ organizationId, _id: invoice.subscriptionId }, { status: 'ACTIVE', gracePeriodEndsAt: undefined, updatedBy: auth.userId });
    return invoice;
  }

  static async reconcile() {
    const prepaid = await reconcilePrepaidCheckouts();
    const now = new Date(); const subscriptions = await OrganizationSubscription.find({ status: { $in: ['TRIALING','ACTIVE','PAST_DUE'] } }); let expired=0; let cancelled=0; let upgraded=0;
    for (const subscription of subscriptions) {
      if (subscription.status === 'TRIALING' && subscription.trialEndsAt && subscription.trialEndsAt <= now) { subscription.status='PAST_DUE'; subscription.gracePeriodEndsAt=new Date(now.getTime()+7*86_400_000); await subscription.save(); expired++; }
      if (subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd <= now) { subscription.status='CANCELLED'; subscription.cancelledAt=now; await subscription.save(); cancelled++; continue; }
      if (subscription.provider === 'PAYSTACK' && subscription.status === 'ACTIVE' && subscription.currentPeriodEnd <= now) { subscription.status='PAST_DUE'; await subscription.save(); expired++; continue; }
      if (subscription.provider !== 'PAYSTACK' && subscription.pendingPlanId && subscription.pendingPlanEffectiveAt && subscription.pendingPlanEffectiveAt <= now) { subscription.planId=subscription.pendingPlanId; subscription.pendingPlanId=undefined; subscription.pendingPlanEffectiveAt=undefined; subscription.currentPeriodStart=now; const plan=await SubscriptionPlan.findById(subscription.planId); if(plan) subscription.currentPeriodEnd=addInterval(now,plan.billingInterval); await subscription.save(); upgraded++; }
    }
    return { expired, cancelled, upgraded, prepaid };
  }

  static async assertFeature(organizationId: string, feature: string) { return EntitlementService.assertFeature(organizationId, feature); }
}
