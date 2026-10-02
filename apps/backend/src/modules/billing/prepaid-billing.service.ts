import mongoose, { Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { Organization } from '../../database/models/Organization.js';
import { OrganizationContract } from '../../database/models/OrganizationContract.js';
import { OrganizationSubscription } from '../../database/models/OrganizationSubscription.js';
import { SubscriptionInvoice } from '../../database/models/SubscriptionInvoice.js';
import { BillingEvent } from '../../database/models/BillingEvent.js';
import { PaystackBillingProvider } from '../../core/billing/billing-provider.js';
import { PaystackProvider } from '../../core/integrations/paystack.provider.js';
import { AppError } from '../../core/errors/AppError.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import { assertSwitchEnabled } from '../platform-control/platform-control.guard.js';
import { AuditService } from '../audit/audit.service.js';
import { retainArtifact } from '../documents/generated-document.service.js';
import { hash, addMonths, type CommercialSnapshot } from '../onboarding/contract-snapshot.js';

export async function startPrepaidCheckout(auth: AuthenticatedUser, organizationId: string) {
  const organization = await Organization.findById(organizationId);
  const contract = await OrganizationContract.findOne({ _id: organization?.onboarding?.contractId, organizationId, status: 'SIGNED' });
  if (!contract) throw new AppError(409, 'SIGNED_CONTRACT_REQUIRED', 'Sign the current organization agreement before payment');
  const subscription = await OrganizationSubscription.findOne({ organizationId }).select('+billingEmail');
  const invoice = await SubscriptionInvoice.findOne({ _id: organization?.onboarding?.invoiceId, organizationId, contractId: contract._id });
  if (!subscription || !invoice || invoice.status === 'VOID') throw new AppError(409, 'ONBOARDING_INVOICE_REQUIRED', 'A valid activation invoice is required');
  if (invoice.status === 'PAID') return subscription;
  if (subscription.providerCheckoutReference) {
    if (!subscription.providerCheckoutUrl) throw new AppError(409, 'CHECKOUT_RECONCILIATION_REQUIRED', 'Checkout submission needs reconciliation; do not start another payment');
    return subscription;
  }
  await assertSwitchEnabled('PAYSTACK_PAYMENTS');
  const lockedAt = new Date();
  const claimed = await OrganizationSubscription.findOneAndUpdate({ _id: subscription._id, status: 'PENDING', providerCheckoutReference: { $exists: false }, $or: [{ checkoutRecoveryLockedAt: { $exists: false } }, { checkoutRecoveryLockedAt: { $lt: new Date(Date.now() - 120000) } }] }, { $set: { checkoutRecoveryLockedAt: lockedAt } });
  if (!claimed) throw new AppError(409, 'CHECKOUT_IN_PROGRESS', 'Checkout is being prepared; refresh shortly');
  try {
    const snapshot = contract.snapshot as CommercialSnapshot, provider = new PaystackBillingProvider();
    if (!subscription.providerCustomerId) {
      const customer = await provider.createCustomer({ organizationId, name: snapshot.legalName, email: snapshot.billingEmail });
      subscription.providerCustomerId = customer.providerCustomerId; await subscription.save();
    }
    if (!subscription.providerPlanCode) {
      subscription.providerPlanCode = await provider.createPrepaidPlan({ name: `PMCC ${snapshot.planKey} ${subscription._id}`, amount: snapshot.recurringMinor / 100, currency: snapshot.currency, interval: snapshot.billingCycle as 'MONTH' | 'QUARTER' | 'YEAR' }); await subscription.save();
    }
    // Persist the reference before the network call. Ambiguous responses can be verified, never charged again blindly.
    subscription.providerCheckoutReference = `pcc-${randomUUID()}`; await subscription.save();
    const checkout = await provider.retryCheckout(subscription.providerPlanCode, { customerReference: subscription.providerCustomerId!, email: snapshot.billingEmail, organizationId, planKey: snapshot.planKey, currency: snapshot.currency, amount: snapshot.recurringMinor / 100, interval: snapshot.billingCycle as 'MONTH' | 'QUARTER' | 'YEAR', initialAmount: snapshot.totalMinor / 100, prepaidMonths: snapshot.prepaidMonths, checkoutReference: subscription.providerCheckoutReference, callbackPath: '/onboarding' });
    if (checkout.checkoutReference !== subscription.providerCheckoutReference) throw new AppError(409, 'PROVIDER_REFERENCE_MISMATCH', 'Provider returned a different checkout reference');
    const session = await mongoose.startSession();
    try { await session.withTransaction(async () => {
      await OrganizationSubscription.updateOne({ _id: subscription._id }, { $set: { providerCheckoutUrl: checkout.checkoutUrl, updatedBy: auth.userId } }, { session });
      await Organization.updateOne({ _id: organizationId, 'onboarding.state': 'INVOICE_ISSUED' }, { $set: { 'onboarding.state': 'PAYMENT_PENDING' }, $inc: { 'onboarding.revision': 1 } }, { session });
      await AuditService.record({ organizationId: contract.organizationId, actorUserId: auth.userId, action: 'landlord.payment.pending', resourceType: 'SubscriptionInvoice', resourceId: invoice._id, metadata: { state: 'PAYMENT_PENDING', reference: subscription.providerCheckoutReference } }, session);
    }); } finally { await session.endSession(); }
  } catch (error) {
    await Organization.updateOne({ _id: organizationId }, { $set: { 'onboarding.attentionCode': 'CHECKOUT_PREPARATION_FAILED' } });
    throw error;
  } finally { await OrganizationSubscription.updateOne({ _id: subscription._id, checkoutRecoveryLockedAt: lockedAt }, { $unset: { checkoutRecoveryLockedAt: 1 } }); }
  return OrganizationSubscription.findById(subscription._id);
}

// Only provider-verified callers (signed webhook or server verification) invoke this boundary.
export async function settlePrepaidInvoice(subscriptionId: Types.ObjectId, data: Record<string, unknown>) {
  const reference = String(data.reference ?? ''), session = await mongoose.startSession();
  try { await session.withTransaction(async () => {
    const subscription = await OrganizationSubscription.findById(subscriptionId).session(session);
    const organization = subscription ? await Organization.findById(subscription.organizationId).session(session) : null;
    const contract = organization?.onboarding?.contractId ? await OrganizationContract.findOne({ _id: organization.onboarding.contractId, organizationId: organization._id, status: 'SIGNED' }).session(session) : null;
    const invoice = organization?.onboarding?.invoiceId ? await SubscriptionInvoice.findOne({ _id: organization.onboarding.invoiceId, subscriptionId, organizationId: organization._id, contractId: contract?._id }).session(session) : null;
    if (!subscription || !organization || !contract || !invoice || invoice.status === 'VOID' || subscription.status === 'CANCELLED') throw new AppError(409, 'ACTIVATION_INTEGRITY_REQUIRED', 'A signed current contract and valid matching invoice are required');
    if (!reference || data.status !== 'success' || Number(data.amount) !== invoice.totalMinor || String(data.currency).toUpperCase() !== invoice.currency || ![subscription.providerCheckoutReference, ...subscription.checkoutReferences].includes(reference)) throw new AppError(409, 'PROVIDER_AMOUNT_MISMATCH', 'Payment reference, currency and amount must match the activation invoice');
    if (invoice.status === 'PAID') {
      if (invoice.providerInvoiceId !== reference) throw new AppError(409, 'DUPLICATE_SUBSCRIPTION_CHARGE', 'A second charge requires refund review');
      return;
    }
    const snapshot = contract.snapshot as CommercialSnapshot;
    const paidAt = new Date(typeof data.paid_at === 'string' ? data.paid_at : Date.now());
    if (!Number.isFinite(paidAt.getTime())) throw new AppError(400, 'INVALID_PAYMENT_TIMESTAMP', 'Payment timestamp is invalid');
    invoice.status = 'PAID'; invoice.amountPaid = invoice.total; invoice.paidAt = paidAt; invoice.providerInvoiceId = reference;
    const receipt = await retainArtifact({ organizationId: organization._id, actorUserId: contract.createdBy, resourceId: invoice._id, kind: 'SUBSCRIPTION_RECEIPT', title: `Payment confirmation ${invoice.invoiceNumber}`, text: `${snapshot.legalName}\nOrganization: ${organization._id}\nInvoice: ${invoice.invoiceNumber}\nPlan: ${snapshot.planName}\nPaid: ${invoice.currency} ${invoice.total.toFixed(2)}\nVerified provider: PAYSTACK\nReference: ${reference}\nPaid at: ${paidAt.toISOString()}\nAccess term: ${paidAt.toISOString()} to ${addMonths(paidAt, snapshot.prepaidMonths).toISOString()}\nContract hash: ${contract.sha256}`, issuedAt: paidAt, contentHash: hash(JSON.stringify({ invoiceId: String(invoice._id), totalMinor: invoice.totalMinor, currency: invoice.currency, reference, paidAt: paidAt.toISOString() })) }, session);
    invoice.receiptDocumentId = receipt._id; await invoice.save({ session });
    subscription.status = 'ACTIVE'; subscription.currentPeriodStart = paidAt; subscription.currentPeriodEnd = addMonths(paidAt, snapshot.prepaidMonths); subscription.renewalState = 'NOT_SCHEDULED';
    const authorization = data.authorization as Record<string, unknown> | undefined, customer = data.customer as Record<string, unknown> | undefined;
    if (authorization?.reusable === true && typeof authorization.authorization_code === 'string' && customer?.customer_code === subscription.providerCustomerId) subscription.renewalAuthorizationCode = authorization.authorization_code;
    await subscription.save({ session });
    organization.onboarding!.state = 'ACTIVE'; organization.onboarding!.paymentVerifiedAt = paidAt; organization.onboarding!.activatedAt = new Date(); organization.onboarding!.attentionCode = undefined; organization.onboarding!.revision += 1;
    await organization.save({ session });
    await BillingEvent.create([{ eventId: `paystack:${reference}`, organizationId: organization._id, provider: 'PAYSTACK', type: 'INVOICE_PAID', externalReference: reference, status: 'PROCESSED', processedAt: new Date(), payload: { invoiceId: String(invoice._id), contractId: String(contract._id), totalMinor: invoice.totalMinor, currency: invoice.currency } }], { session });
    for (const state of ['PAYMENT_VERIFIED', 'ACTIVE']) await AuditService.record({ organizationId: organization._id, action: 'landlord.onboarding.transition', resourceType: 'SubscriptionInvoice', resourceId: invoice._id, metadata: { state, reference, contractHash: contract.sha256 } }, session);
    await AuditService.publish({ organizationId: organization._id, name: 'organization.activated', aggregateType: 'Organization', aggregateId: organization._id, payload: { contractId: String(contract._id), invoiceId: String(invoice._id), paymentReference: reference } }, session);
  }); } finally { await session.endSession(); }
  await schedulePrepaidRenewal(subscriptionId);
}

export async function schedulePrepaidRenewal(subscriptionId: Types.ObjectId) {
  const subscription = await OrganizationSubscription.findById(subscriptionId).select('+renewalAuthorizationCode');
  if (!subscription || subscription.status !== 'ACTIVE' || subscription.renewalState === 'SCHEDULED' || subscription.cancelAtPeriodEnd) return;
  try {
    if (!subscription.providerCustomerId || !subscription.providerPlanCode) throw new Error('RENEWAL_CONFIGURATION_REQUIRED');
    const provider = new PaystackBillingProvider();
    let result = subscription.renewalAttemptedAt ? await provider.findRenewal(subscription.providerCustomerId, subscription.providerPlanCode) : undefined;
    if (!result && subscription.renewalAttemptedAt) throw new Error('RENEWAL_SUBMISSION_AMBIGUOUS');
    if (!result) {
      if (!subscription.renewalAuthorizationCode) {
        const verified = await new PaystackProvider().query(subscription.providerCheckoutReference!);
        const raw = verified.raw as Record<string, unknown> | undefined;
        const authorization = raw?.authorization as Record<string, unknown> | undefined, customer = raw?.customer as Record<string, unknown> | undefined;
        if (verified.status !== 'CONFIRMED' || verified.providerTransactionId !== subscription.providerCheckoutReference || customer?.customer_code !== subscription.providerCustomerId || authorization?.reusable !== true || typeof authorization.authorization_code !== 'string') throw new Error('RENEWAL_AUTHORIZATION_REQUIRED');
        subscription.renewalAuthorizationCode = authorization.authorization_code; await subscription.save();
      }
      await assertSwitchEnabled('PAYSTACK_PAYMENTS');
      const claimed = await OrganizationSubscription.findOneAndUpdate({ _id: subscriptionId, renewalAttemptedAt: { $exists: false }, status: 'ACTIVE', cancelAtPeriodEnd: false }, { $set: { renewalState: 'SCHEDULING', renewalAttemptedAt: new Date() } });
      if (!claimed) return;
      result = await provider.scheduleRenewal({ customerCode: subscription.providerCustomerId, planCode: subscription.providerPlanCode, authorizationCode: subscription.renewalAuthorizationCode!, startsAt: subscription.currentPeriodEnd });
    }
    if (!result.subscription_code || !result.next_payment_date || !Number.isFinite(new Date(result.next_payment_date).getTime()) || new Date(result.next_payment_date).getTime() < subscription.currentPeriodEnd.getTime() - 1000) throw new Error('RENEWAL_SCHEDULE_REQUIRES_REVIEW');
    const session = await mongoose.startSession();
    try { await session.withTransaction(async () => {
      await OrganizationSubscription.updateOne({ _id: subscriptionId }, { $set: { providerSubscriptionId: result!.subscription_code, ...(result!.email_token ? { providerEmailToken: result!.email_token } : {}), renewalState: 'SCHEDULED' } }, { session });
      await Organization.updateOne({ _id: subscription.organizationId }, { $unset: { 'onboarding.attentionCode': 1 } }, { session });
      await AuditService.record({ organizationId: subscription.organizationId, action: 'billing.prepaid.renewal.scheduled', resourceType: 'OrganizationSubscription', resourceId: subscriptionId, metadata: { startsAt: subscription.currentPeriodEnd.toISOString(), providerSubscriptionId: result!.subscription_code } }, session);
    }); } finally { await session.endSession(); }
  } catch {
    // Provider uncertainty must not roll back an authoritative paid invoice or create a second remote subscription.
    await OrganizationSubscription.updateOne({ _id: subscriptionId }, { $set: { renewalState: 'REQUIRES_ATTENTION' } });
    await Organization.updateOne({ _id: subscription.organizationId }, { $set: { 'onboarding.attentionCode': 'RENEWAL_REQUIRES_ATTENTION' } });
  }
}

export async function reconcilePrepaidCheckouts() {
  const pending = await OrganizationSubscription.find({ provider: 'PAYSTACK', status: 'PENDING', 'metadata.contractId': { $exists: true }, providerCheckoutReference: { $exists: true } }).limit(100);
  let verified = 0;
  for (const subscription of pending) {
    try {
      const result = await new PaystackProvider().query(subscription.providerCheckoutReference!);
      if (result.providerTransactionId !== subscription.providerCheckoutReference) throw new Error('REFERENCE_MISMATCH');
      if (result.status === 'CONFIRMED') { await settlePrepaidInvoice(subscription._id, { ...(result.raw as Record<string, unknown>), status: 'success', reference: result.providerTransactionId, amount: result.amountMinorUnits, currency: result.currency, paid_at: result.paidAt?.toISOString() }); verified++; }
      else if (result.status === 'FAILED') await Organization.updateOne({ _id: subscription.organizationId }, { $set: { 'onboarding.attentionCode': 'PAYMENT_FAILED' } });
    } catch { await Organization.updateOne({ _id: subscription.organizationId }, { $set: { 'onboarding.attentionCode': 'PAYMENT_RECONCILIATION_REQUIRED' } }); }
  }
  const unscheduled = await OrganizationSubscription.find({ provider: 'PAYSTACK', status: 'ACTIVE', renewalState: { $in: ['NOT_SCHEDULED', 'SCHEDULING', 'REQUIRES_ATTENTION'] }, 'metadata.contractId': { $exists: true } }).limit(100);
  for (const subscription of unscheduled) await schedulePrepaidRenewal(subscription._id);
  return { verified, checked: pending.length };
}

export async function settlePrepaidRenewal(subscriptionId: Types.ObjectId, data: Record<string, unknown>) {
  const session = await mongoose.startSession();
  try { await session.withTransaction(async () => {
    const subscription = await OrganizationSubscription.findById(subscriptionId).session(session);
    if (!subscription || subscription.cancelAtPeriodEnd || subscription.status === 'CANCELLED') throw new AppError(409, 'RENEWAL_NOT_ALLOWED', 'This subscription is not renewing');
    const metadata = subscription.metadata as { commercialSnapshot: CommercialSnapshot; pendingCommercialSnapshot?: CommercialSnapshot; contractId: string };
    const reference = String(data.reference ?? '');
    if (!reference || data.status !== 'success') throw new AppError(400, 'INVALID_RENEWAL', 'A successful provider payment is required');
    const prior = await SubscriptionInvoice.findOne({ provider: 'PAYSTACK', providerInvoiceId: reference }).session(session);
    if (prior) { if (String(prior.subscriptionId) !== String(subscriptionId)) throw new AppError(409, 'RENEWAL_REFERENCE_CONFLICT', 'Payment belongs to a different subscription'); return; }
    const current = metadata.commercialSnapshot, pending = metadata.pendingCommercialSnapshot;
    const selected = pending && Number(data.amount) === pending.recurringMinor && String(data.currency).toUpperCase() === pending.currency ? pending : current;
    if (Number(data.amount) !== selected.recurringMinor || String(data.currency).toUpperCase() !== selected.currency) throw new AppError(409, 'PROVIDER_AMOUNT_MISMATCH', 'Renewal payment must match the contracted commercial snapshot');
    const paidAt = new Date(typeof data.paid_at === 'string' ? data.paid_at : Date.now());
    if (!Number.isFinite(paidAt.getTime()) || paidAt.getTime() < subscription.currentPeriodEnd.getTime() - 60000) throw new AppError(409, 'EARLY_RENEWAL_REQUIRES_REVIEW', 'A charge before the prepaid or paid term ends requires review');
    const start = paidAt > subscription.currentPeriodEnd ? paidAt : subscription.currentPeriodEnd, end = addMonths(start, selected.intervalMonths);
    const snapshot = { ...selected, prepaidMonths: selected.intervalMonths, subtotalMinor: selected.recurringMinor, totalMinor: selected.recurringMinor, issuedAt: paidAt.toISOString(), lineItems: selected.lineItems.map(line => ({ ...line, quantity: line.quantity / selected.prepaidMonths * selected.intervalMonths, totalMinor: line.totalMinor / selected.prepaidMonths * selected.intervalMonths })) };
    const invoice = new SubscriptionInvoice({ organizationId: subscription.organizationId, subscriptionId, invoiceNumber: `INV-PS-${reference}`, periodStart: start, periodEnd: end, issuedAt: paidAt, dueDate: start, subtotal: snapshot.totalMinor / 100, tax: 0, total: snapshot.totalMinor / 100, subtotalMinor: snapshot.totalMinor, taxMinor: 0, totalMinor: snapshot.totalMinor, amountPaid: snapshot.totalMinor / 100, currency: snapshot.currency, status: 'PAID', paidAt, provider: 'PAYSTACK', providerInvoiceId: reference, commercialSnapshot: snapshot, lineItems: snapshot.lineItems, metadata: { originContractId: metadata.contractId }, createdBy: subscription.createdBy, updatedBy: subscription.updatedBy });
    const text = `${snapshot.legalName}\nOrganization: ${subscription.organizationId}\nInvoice: ${invoice.invoiceNumber}\nPlan: ${snapshot.planName}\nPortfolio: ${snapshot.unitCount} units\nPeriod: ${start.toISOString()} to ${end.toISOString()}\n${snapshot.lineItems.map(line => `${line.description}: ${line.quantity} x ${snapshot.currency} ${(line.unitAmountMinor / 100).toFixed(2)} = ${(line.totalMinor / 100).toFixed(2)}`).join('\n')}\nSubtotal: ${snapshot.currency} ${(snapshot.totalMinor / 100).toFixed(2)}\nTax: 0.00\nTotal: ${snapshot.currency} ${(snapshot.totalMinor / 100).toFixed(2)}\nStatus: PAID\nProvider reference: ${reference}`;
    const document = await retainArtifact({ organizationId: subscription.organizationId, actorUserId: subscription.createdBy, resourceId: invoice._id, kind: 'SUBSCRIPTION_INVOICE', title: `Renewal invoice ${invoice.invoiceNumber}`, text, issuedAt: paidAt, contentHash: hash(JSON.stringify(snapshot)) }, session);
    invoice.documentId = document._id;
    const receipt = await retainArtifact({ organizationId: subscription.organizationId, actorUserId: subscription.createdBy, resourceId: invoice._id, kind: 'SUBSCRIPTION_RECEIPT', title: `Renewal payment ${invoice.invoiceNumber}`, text, issuedAt: paidAt, contentHash: hash(text) }, session);
    invoice.receiptDocumentId = receipt._id; await invoice.save({ session });
    subscription.status = 'ACTIVE'; subscription.currentPeriodStart = start; subscription.currentPeriodEnd = end;
    if (pending && selected === pending) { subscription.planId = new Types.ObjectId(pending.planId); subscription.pendingPlanId = undefined; subscription.pendingPlanEffectiveAt = undefined; subscription.set('metadata', { ...metadata, commercialSnapshot: pending, pendingCommercialSnapshot: undefined }); }
    await subscription.save({ session });
    await BillingEvent.create([{ eventId: `paystack:${reference}`, organizationId: subscription.organizationId, provider: 'PAYSTACK', type: 'INVOICE_PAID', externalReference: reference, status: 'PROCESSED', processedAt: new Date(), payload: { invoiceId: String(invoice._id), totalMinor: invoice.totalMinor, currency: invoice.currency } }], { session });
    await AuditService.record({ organizationId: subscription.organizationId, action: 'billing.prepaid.renewal.paid', resourceType: 'SubscriptionInvoice', resourceId: invoice._id, metadata: { reference, periodEnd: end.toISOString(), planChanged: selected === pending } }, session);
  }); } finally { await session.endSession(); }
}
