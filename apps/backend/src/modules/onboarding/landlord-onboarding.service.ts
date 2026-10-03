import { assertContractIndexes } from './contract-indexes.js';
import mongoose, { Types } from 'mongoose';
import { Organization } from '../../database/models/Organization.js';
import { OrganizationContract } from '../../database/models/OrganizationContract.js';
import { ContractTemplate } from '../../database/models/ContractTemplate.js';
import { SubscriptionPlan } from '../../database/models/SubscriptionPlan.js';
import { SubscriptionInvoice } from '../../database/models/SubscriptionInvoice.js';
import { OrganizationSubscription } from '../../database/models/OrganizationSubscription.js';
import { User } from '../../database/models/User.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import { AppError } from '../../core/errors/AppError.js';
import { AuditService } from '../audit/audit.service.js';
import { retainArtifact } from '../documents/generated-document.service.js';
import { assertSwitchEnabled } from '../platform-control/platform-control.guard.js';
import { BillingService } from '../billing/billing.service.js';
import { configureLandlordSchema, generateContractSchema, signContractSchema, replaceContractSchema } from './landlord-onboarding.schemas.js';
import { addMonths, hash, interpolate, priceSnapshot, type CommercialSnapshot } from './contract-snapshot.js';

export function assertLandlordOwner(auth: AuthenticatedUser, organizationId: string) {
  AuditService.assertObjectId(organizationId, 'organizationId');
  AuthorizationService.assertCan(auth, 'billing.subscription.manage', { organizationId });
  const member = AuthorizationService.getMembership(auth, organizationId);
  if (!member.roles.includes('LANDLORD') || !member.scope.allProperties) throw new AppError(403, 'LANDLORD_SIGNATORY_REQUIRED', 'Only an organization-wide landlord can configure or sign this agreement');
}
export function invoiceText(invoice: { invoiceNumber: string; periodStart: Date; periodEnd: Date; dueDate: Date }, snapshot: CommercialSnapshot) {
  const money = (minor: number) => `${snapshot.currency} ${(minor / 100).toFixed(2)}`;
  return `${snapshot.legalName}\nOrganization: ${snapshot.organizationId}\nIdentifier: ${snapshot.legalIdentifier}\nInvoice: ${invoice.invoiceNumber}\nPlan: ${snapshot.planName}\nPortfolio: ${snapshot.unitCount} units\nService period: ${invoice.periodStart.toISOString()} to ${invoice.periodEnd.toISOString()}\nDue: ${invoice.dueDate.toISOString()}\n\n${snapshot.lineItems.map(line => `${line.description}: ${line.quantity} x ${money(line.unitAmountMinor)} = ${money(line.totalMinor)}`).join('\n')}\n\nSubtotal: ${money(snapshot.subtotalMinor)}\nTax: ${money(snapshot.taxMinor)}\nTotal due: ${money(snapshot.totalMinor)}\nInitial prepaid term: ${snapshot.prepaidMonths} months\nIssued status: OPEN\nRecurring cycle after prepaid term: ${snapshot.billingCycle}`;
}
export class LandlordOnboardingService {
  static async status(auth: AuthenticatedUser, organizationId: string) {
    AuditService.assertObjectId(organizationId, 'organizationId');
    AuthorizationService.assertCan(auth, 'billing.subscription.view', { organizationId });
    const organization = await Organization.findById(organizationId).lean();
    if (!organization) throw new AppError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found');
    const contract = organization.onboarding?.contractId ? await OrganizationContract.findOne({ _id: organization.onboarding.contractId, organizationId }).lean() : null;
    const invoice = organization.onboarding?.invoiceId ? await SubscriptionInvoice.findOne({ _id: organization.onboarding.invoiceId, organizationId }).lean() : null;
    const subscription = await OrganizationSubscription.findOne({ organizationId }).lean();
    return { organization: { _id: organization._id, name: organization.name, pilotPrepared: !!organization.guidedPilot, ...organization.onboarding },
      state: organization.onboarding?.state ?? (subscription?.status === 'ACTIVE' ? 'ACTIVE' : 'ACCOUNT_CREATED'),
      revision: organization.onboarding?.revision ?? 0, contract, invoice, subscription,
      nextStep: !organization.onboarding && subscription?.status === 'ACTIVE' ? 'COMPLETE' : !organization.onboarding?.legalIdentifier ? 'DETAILS' : !contract ? 'PLAN' : contract.status !== 'SIGNED' ? 'SIGNATURE' : subscription?.status === 'ACTIVE' && organization.onboarding?.state === 'ACTIVE' ? 'COMPLETE' : 'PAYMENT',
    };
  }
  static async quote(auth: AuthenticatedUser, organizationId: string, planKey: string, prepaidMonths: number) {
    AuthorizationService.assertCan(auth, 'billing.subscription.view', { organizationId });
    const input=generateContractSchema.parse({planKey,prepaidMonths,expectedRevision:0});
    const organization=await Organization.findById(organizationId).lean();
    if(organization?.onboarding?.unitCount == null) throw new AppError(409,'ORGANIZATION_DETAILS_REQUIRED','Save portfolio details before pricing');
    const plan=await SubscriptionPlan.findOne({key:input.planKey,active:true}).lean();
    if(!plan) throw new AppError(404,'PLAN_NOT_FOUND','Active plan not found');
    return priceSnapshot(plan,organization.onboarding.unitCount,input.prepaidMonths);
  }
  static async configure(auth: AuthenticatedUser, organizationId: string, raw: unknown) {
    assertLandlordOwner(auth, organizationId); const input = configureLandlordSchema.parse(raw);
    await assertSwitchEnabled('LANDLORD_ONBOARDING');
    await assertContractIndexes();
    const session = await mongoose.startSession();
    try { await session.withTransaction(async () => {
      const organization = await Organization.findById(organizationId).session(session);
      if (!organization) throw new AppError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found');
      if (organization.onboarding?.contractId || await OrganizationSubscription.exists({ organizationId, status: { $in: ['ACTIVE', 'TRIALING'] } }).session(session)) throw new AppError(409, 'ONBOARDING_DETAILS_LOCKED', 'Use the audited replacement workflow after contract generation');
      organization.set('onboarding', { ...organization.toObject().onboarding, ...input, state: 'ORGANIZATION_CONFIGURED', stateChangedAt:new Date(), revision: (organization.onboarding?.revision ?? 0) + 1 });
      await organization.save({ session });
      await AuditService.record({ organizationId: organization._id, actorUserId: auth.userId, action: 'landlord.organization.configured', resourceType: 'Organization', resourceId: organization._id, metadata: { state: 'ORGANIZATION_CONFIGURED', unitCount: input.unitCount } }, session);
    }); } finally { await session.endSession(); }
    return this.status(auth, organizationId);
  }
  static async generate(auth: AuthenticatedUser, organizationId: string, raw: unknown, replacement = false) {
    assertLandlordOwner(auth, organizationId);
    const input = replacement ? replaceContractSchema.parse(raw) : generateContractSchema.parse(raw);
    await assertSwitchEnabled('LANDLORD_ONBOARDING'); await assertSwitchEnabled('DOCUMENT_STORAGE');
    await assertContractIndexes();
    const session = await mongoose.startSession();
    try { await session.withTransaction(async () => {
      const organization = await Organization.findById(organizationId).session(session);
      if (!organization?.onboarding?.legalIdentifier || !organization.onboarding.legalName || !organization.onboarding.billingEmail || organization.onboarding.unitCount == null) throw new AppError(409, 'ORGANIZATION_DETAILS_REQUIRED', 'Configure legal organization details and portfolio first');
      const current = organization.onboarding.contractId ? await OrganizationContract.findOne({ _id: organization.onboarding.contractId, organizationId }).session(session) : null;
      if (current && !replacement) {
        const snapshot = current.snapshot as CommercialSnapshot;
        if (snapshot.planKey === input.planKey && snapshot.prepaidMonths === input.prepaidMonths) return;
        throw new AppError(409, 'CONTRACT_EXISTS', 'Use the audited replacement workflow to change a generated contract');
      }
      if (organization.onboarding.revision !== input.expectedRevision) throw new AppError(409, 'ONBOARDING_CONFLICT', 'Onboarding changed; refresh before continuing');
      const existingSubscription = await OrganizationSubscription.findOne({ organizationId }).session(session);
      if (replacement) {
        if (!current) throw new AppError(409, 'CONTRACT_REQUIRED', 'There is no contract to replace');
        if (existingSubscription?.providerCheckoutReference || organization.onboarding.state === 'ACTIVE') throw new AppError(409, 'REPLACEMENT_REQUIRES_SETTLEMENT_REVIEW', 'Payment has begun; resolve payment/refund and amendment requirements before replacing this agreement');
        const priorInvoice = await SubscriptionInvoice.findOne({ _id: organization.onboarding.invoiceId, organizationId }).session(session);
        if (priorInvoice?.status === 'PAID') throw new AppError(409, 'PAID_CONTRACT_IMMUTABLE', 'Paid commercial terms require an amendment and settlement review');
        if (priorInvoice) { priorInvoice.status = 'VOID'; await priorInvoice.save({ session }); }
      } else if (existingSubscription) throw new AppError(409, 'SUBSCRIPTION_EXISTS', 'An existing subscription requires billing review before contract onboarding');
      if(replacement && 'details' in input && input.details && typeof input.details === 'object') organization.set('onboarding', { ...organization.toObject().onboarding, ...configureLandlordSchema.parse(input.details) });
      const plan = await SubscriptionPlan.findOne({ key: input.planKey, active: true }).session(session);
      if (!plan) throw new AppError(404, 'PLAN_NOT_FOUND', 'Active plan not found');
      const template = await ContractTemplate.findOne({ status: 'ACTIVE', plans: input.planKey, effectiveAt: { $lte: new Date() } }).sort({ effectiveAt: -1, version: -1 }).session(session);
      if (!template) throw new AppError(503, 'CONTRACT_TEMPLATE_UNAVAILABLE', 'An administrator must publish an approved contract template for this plan');
      const user = await User.findById(auth.userId).session(session);
      if (!user) throw new AppError(401, 'SIGNATORY_NOT_FOUND', 'Signatory account not found');
      const now = new Date(), pricing = priceSnapshot(plan, organization.onboarding.unitCount, input.prepaidMonths);
      const snapshot: CommercialSnapshot = { ...pricing, organizationId, legalName: organization.onboarding.legalName, legalIdentifier: organization.onboarding.legalIdentifier, billingEmail: organization.onboarding.billingEmail, landlordName: `${user.firstName} ${user.lastName}`, effectiveAt: now.toISOString(), issuedAt: now.toISOString(), planId: String(plan._id) };
      const body = interpolate(template.body, template.variables, { legalName: snapshot.legalName, organizationId, legalIdentifier: snapshot.legalIdentifier, landlordName: snapshot.landlordName, planName: plan.name, planKey: plan.key, unitCount: String(snapshot.unitCount), currency: snapshot.currency, monthlyPrice: (snapshot.monthlyMinor / 100).toFixed(2), initialAmount: (snapshot.totalMinor / 100).toFixed(2), prepaidMonths: String(snapshot.prepaidMonths), billingCycle: snapshot.billingCycle, effectiveDate: snapshot.effectiveAt, hardwareTerms: 'Hardware and installation are excluded unless separately agreed in writing.' });
      const contractId = new Types.ObjectId(), generation = (current?.generation ?? 0) + 1, sha256 = hash(body);
      const document = await retainArtifact({ organizationId: organization._id, actorUserId: auth.userId, resourceId: contractId, kind: 'CONTRACT', title: `${template.name} — ${snapshot.legalName}`, text: body, issuedAt: now, contentHash: sha256 }, session);
      const [contract] = await OrganizationContract.create([{ _id: contractId, organizationId, generation, templateVersionId: template._id, templateId: template.templateId, templateVersion: template.version, templateName: template.name, templateHash: template.sha256, body, sha256, snapshot, documentId: document._id, ...(current ? { replacesContractId: current._id, replacementReason: 'reason' in input ? String(input.reason) : undefined } : {}), createdBy: auth.userId }], { session });
      const subscription = existingSubscription ?? new OrganizationSubscription({ organizationId, createdBy: auth.userId });
      // A prepared but unused remote plan must never carry predecessor pricing into a replacement.
      if(replacement) { subscription.providerPlanCode=undefined; subscription.providerCustomerId=undefined; }
      subscription.set({ planId: plan._id, status: 'PENDING', provider: 'PAYSTACK', currentPeriodStart: now, currentPeriodEnd: addMonths(now, input.prepaidMonths), billingEmail: snapshot.billingEmail, metadata: { prepaidMonths: input.prepaidMonths, contractId: String(contractId), commercialSnapshot: snapshot }, updatedBy: auth.userId });
      await subscription.save({ session });
      const invoice = new SubscriptionInvoice({ organizationId, subscriptionId: subscription._id, contractId, invoiceNumber: `INV-${organization._id}-${generation}`, periodStart: now, periodEnd: addMonths(now, input.prepaidMonths), dueDate: now, issuedAt: now, subtotal: snapshot.subtotalMinor / 100, tax: 0, total: snapshot.totalMinor / 100, subtotalMinor: snapshot.subtotalMinor, taxMinor: 0, totalMinor: snapshot.totalMinor, currency: snapshot.currency, provider: 'PAYSTACK', commercialSnapshot: snapshot, lineItems: snapshot.lineItems.map(line => ({ ...line, unitAmount: line.unitAmountMinor / 100, total: line.totalMinor / 100 })), createdBy: auth.userId, updatedBy: auth.userId });
      const invoiceDocument = await retainArtifact({ organizationId: organization._id, actorUserId: auth.userId, resourceId: invoice._id, kind: 'SUBSCRIPTION_INVOICE', title: `Activation invoice ${invoice.invoiceNumber}`, text: invoiceText(invoice, snapshot), issuedAt: now, contentHash: hash(JSON.stringify(snapshot)) }, session);
      invoice.documentId = invoiceDocument._id; await invoice.save({ session });
      organization.onboarding.contractId = contract!._id; organization.onboarding.invoiceId = invoice._id; organization.onboarding.state = 'CONTRACT_PENDING_SIGNATURE'; organization.onboarding.stateChangedAt=new Date(); organization.onboarding.revision += 1; organization.onboarding.attentionCode = undefined;
      await organization.save({ session });
      for (const state of ['PLAN_SELECTED', 'CONTRACT_GENERATED', 'CONTRACT_PENDING_SIGNATURE']) await AuditService.record({ organizationId: organization._id, actorUserId: auth.userId, action: 'landlord.onboarding.transition', resourceType: 'OrganizationContract', resourceId: contractId, metadata: { state, generation, sha256, ...(current ? { replacesContractId: String(current._id), reason: 'reason' in input ? input.reason : '' } : {}) } }, session);
    }); } finally { await session.endSession(); }
    return this.status(auth, organizationId);
  }
  static async sign(auth: AuthenticatedUser, organizationId: string, raw: unknown, meta: { requestId?: string; ipAddress?: string; userAgent?: string } = {}) {
    assertLandlordOwner(auth, organizationId); const input = signContractSchema.parse(raw);
    await assertSwitchEnabled('LANDLORD_ONBOARDING'); await assertSwitchEnabled('DOCUMENT_STORAGE');
    await assertContractIndexes();
    const session = await mongoose.startSession();
    try { await session.withTransaction(async () => {
      const organization = await Organization.findById(organizationId).session(session);
      const contract = await OrganizationContract.findOne({ _id: input.contractId, organizationId }).session(session);
      if (!contract || String(organization?.onboarding?.contractId) !== input.contractId) throw new AppError(404, 'CONTRACT_NOT_FOUND', 'Current organization contract not found');
      if (contract.sha256 !== input.documentHash) throw new AppError(409, 'CONTRACT_HASH_MISMATCH', 'Refresh and review the current agreement before signing');
      if (contract.status === 'SIGNED') {
        if (String(contract.signature?.userId) !== String(auth.userId) || contract.signature?.name !== input.signatoryName) throw new AppError(409, 'CONTRACT_ALREADY_SIGNED', 'This contract has already been signed');
        return;
      }
      const signedAt = new Date(), evidence = { userId: auth.userId, name: input.signatoryName, signedAt, authorityConfirmed: true, termsAccepted: true, representation: input.signatoryName, documentHash: contract.sha256, ...meta };
      const evidenceHash = hash(JSON.stringify(evidence));
      contract.set('signature', { ...evidence, evidenceHash }); contract.status = 'SIGNED';
      const document = await retainArtifact({ organizationId: contract.organizationId, actorUserId: auth.userId, resourceId: contract._id, kind: 'SIGNED_CONTRACT', title: `${contract.templateName} — signed`, text: `${contract.body}\n\nELECTRONIC SIGNATURE\nSignatory: ${input.signatoryName}\nUser: ${auth.userId}\nSigned at: ${signedAt.toISOString()}\nAuthority confirmed: yes\nTerms accepted: yes\nTemplate: ${contract.templateId} version ${contract.templateVersion}\nAgreement hash: ${contract.sha256}\nSignature evidence hash: ${evidenceHash}`, issuedAt: signedAt, contentHash: evidenceHash }, session);
      contract.signedDocumentId = document._id; await contract.save({ session });
      organization!.onboarding!.state = 'INVOICE_ISSUED'; organization?.set('onboarding.stateChangedAt',new Date()); organization!.onboarding!.revision += 1;
      await organization!.save({ session });
      for (const state of ['CONTRACT_SIGNED', 'INVOICE_ISSUED']) await AuditService.record({ organizationId: contract.organizationId, actorUserId: auth.userId, action: 'landlord.onboarding.transition', resourceType: 'OrganizationContract', resourceId: contract._id, ...meta, metadata: { state, documentHash: contract.sha256, evidenceHash, templateVersion: contract.templateVersion } }, session);
    }); } finally { await session.endSession(); }
    return this.status(auth, organizationId);
  }
  static async checkout(auth: AuthenticatedUser, organizationId: string) {
    assertLandlordOwner(auth, organizationId);
    await assertSwitchEnabled('LANDLORD_ONBOARDING'); await assertSwitchEnabled('PAYSTACK_PAYMENTS');
    await BillingService.startPrepaidCheckout(auth, organizationId);
    return this.status(auth, organizationId);
  }
  static async recover(auth: AuthenticatedUser, organizationId: string) {
    assertLandlordOwner(auth, organizationId);
    await BillingService.recoverCheckout(auth, organizationId);
    return this.status(auth, organizationId);
  }
  static async oversight(auth: AuthenticatedUser, page = 1) {
    AuthorizationService.assertPlatformAdmin(auth);
    const filter = { onboarding: { $exists: true } };
    const items = await Organization.find(filter).select('name slug onboarding updatedAt createdAt').sort({ updatedAt: -1 }).skip((page - 1) * 50).limit(50).lean();
    return { items, page, total: await Organization.countDocuments(filter) };
  }
}
