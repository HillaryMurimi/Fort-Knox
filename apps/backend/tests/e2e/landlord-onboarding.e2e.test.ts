import { completedAdminFixture } from '../helpers/admin-assurance.js';
import { RefreshSession } from '../../src/database/models/RefreshSession.js';
import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createHmac } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { integrationConfig } from '../../src/core/integrations/config.js';
import { PaystackBillingProvider } from '../../src/core/billing/billing-provider.js';
import { PaystackProvider } from '../../src/core/integrations/paystack.provider.js';
import { Organization } from '../../src/database/models/Organization.js';
import { OrganizationContract } from '../../src/database/models/OrganizationContract.js';
import { ContractTemplate } from '../../src/database/models/ContractTemplate.js';
import { OrganizationSubscription } from '../../src/database/models/OrganizationSubscription.js';
import { SubscriptionInvoice } from '../../src/database/models/SubscriptionInvoice.js';
import { Document } from '../../src/database/models/Document.js';
import { Evidence } from '../../src/database/models/Evidence.js';
import { BillingEvent } from '../../src/database/models/BillingEvent.js';
import { Role } from '../../src/database/models/Role.js';
import { User } from '../../src/database/models/User.js';
import { PlatformSwitch } from '../../src/database/models/PlatformSwitch.js';
import { AuditLog } from '../../src/database/models/AuditLog.js';
import { SubscriptionPlan } from '../../src/database/models/SubscriptionPlan.js';
import { OrganizationMembership } from '../../src/database/models/OrganizationMembership.js';
import { ContractTemplateService } from '../../src/modules/onboarding/contract-template.service.js';
import { defaultContractDraft } from '../../src/modules/onboarding/contract-default.js';
import { contractVariables, addMonths, hash } from '../../src/modules/onboarding/contract-snapshot.js';
import { LandlordOnboardingService } from '../../src/modules/onboarding/landlord-onboarding.service.js';
import { IntegrationService } from '../../src/modules/integrations/integration.service.js';
import { BillingService } from '../../src/modules/billing/billing.service.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import type { AuthenticatedUser } from '../../src/core/types/auth.js';

const permissions = ['billing.subscription.view', 'billing.subscription.manage', 'billing.invoice.view', 'billing.invoice.manage', 'document.view', 'document.manage', 'property.view', 'property.create'];
describe.skipIf(!process.env.RUN_E2E)('landlord onboarding replica-set / HTTP end-to-end certification', () => {
  let mongo: MongoMemoryReplSet;
  let org: string, token: string, owner: AuthenticatedUser, admin: AuthenticatedUser, adminToken: string;
  const app = createApp(), originalPaystack = { ...integrationConfig.paystack };
  const path = (suffix = '') => `/api/v1/organizations/${org}/landlord-onboarding${suffix}`;
  const call = (suffix: string, data?: unknown) => request(app).post(path(suffix)).auth(token, { type: 'bearer' }).send(data ?? {});
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : {} });
    await mongoose.connect(mongo.getUri(), {autoIndex:false});
    for (const model of [RefreshSession, Organization, ContractTemplate, OrganizationContract, OrganizationSubscription, SubscriptionInvoice, Document, Evidence, BillingEvent, Role, User, OrganizationMembership, AuditLog, mongoose.models.DomainEvent!, mongoose.models.EventCounter!, mongoose.models.EventOutbox!].filter(Boolean)) { await model.createCollection(); await model.createIndexes(); }
  }, 180000);
  beforeEach(async () => {
    for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
    const role = await Role.create({ name: 'Landlord', key: 'LANDLORD', system: true, organizationId: null, permissions });
    const signup = await request(app).post('/api/v1/auth/bootstrap-landlord').send({ firstName: 'Jane', lastName: 'Landlord', phone: '+254700009001', email: 'owner@example.com', password: 'Secure-test-password-2026!', organization: { name: 'Acacia Portfolio', slug: 'acacia-test' } });
    expect(signup.status, JSON.stringify(signup.body)).toBe(201);
    org = String(signup.body.data.organizationId);
    const userId = new Types.ObjectId(signup.body.data.userId);
    owner = { userId, isPlatformAdmin: false, memberships: [{ organizationId: new Types.ObjectId(org), roleIds: [role._id], roles: ['LANDLORD'], permissions, scope: { allProperties: true, propertyIds: [], buildingIds: [], unitIds: [] } }] };
    token = jwt.sign({ sub: String(userId), type: 'access' }, env.JWT_ACCESS_SECRET);
    const administrator = await User.create({ phone: '+254700009002', email: 'admin@example.com', firstName: 'Platform', lastName: 'Admin', isPlatformAdmin: true });
    admin = { userId: administrator._id, isPlatformAdmin: true, memberships: [] };
    adminToken = await completedAdminFixture(admin.userId);
    await SubscriptionPlan.create({ key: 'CONTROL', name: 'Control', currency: 'KES', amount: 10000, billingInterval: 'MONTH', trialDays: 14, metadata: { pricingModel: 'BASE_PLUS_ACTIVE_UNITS', includedUnits: 50, additionalUnitAmount: 200 }, entitlements: { maxProperties: -1, maxUnits: -1, maxUsers: -1, maxTenants: -1, features: ['documents'] } });
    for (const key of ['LANDLORD_ONBOARDING', 'PAYSTACK_PAYMENTS', 'DOCUMENT_STORAGE']) await PlatformSwitch.create({ key, name: key, description: 'Test fixture', kind: 'SERVICE', enabled: true, mode: 'ON' });
    const template = await ContractTemplateService.create(admin, { ...defaultContractDraft, variables: [...contractVariables], effectiveAt: new Date('2026-01-01') });
    await ContractTemplateService.status(admin, String(template!._id), 'ACTIVE');
    integrationConfig.paystack.secretKey = 'sk_test_contract_fixture'; integrationConfig.paystack.enabled = true;
    vi.spyOn(PaystackBillingProvider.prototype, 'createCustomer').mockResolvedValue({ providerCustomerId: 'CUS_contract' });
    vi.spyOn(PaystackBillingProvider.prototype, 'createPrepaidPlan').mockResolvedValue('PLN_contract');
    vi.spyOn(PaystackBillingProvider.prototype, 'retryCheckout').mockImplementation(async (_plan, input) => ({ checkoutReference: input.checkoutReference ?? 'recovered-checkout', checkoutUrl: 'https://checkout.paystack.com/contract' }));
    vi.spyOn(PaystackBillingProvider.prototype, 'scheduleRenewal').mockImplementation(async input => ({ subscription_code: 'SUB_contract', email_token: 'test-private-token', next_payment_date: input.startsAt.toISOString() }));
  });
  afterEach(() => { vi.restoreAllMocks(); Object.assign(integrationConfig.paystack, originalPaystack); });
  afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
  async function generate() {
    const configured = await request(app).put(path('/details')).auth(token, { type: 'bearer' }).send({ legalName: 'Acacia Holdings Limited', legalIdentifier: 'REG-2026-001', billingEmail: 'owner@example.com', unitCount: 55 });
    expect(configured.status, JSON.stringify(configured.body)).toBe(200);
    const generated = await call('/contract', { planKey: 'CONTROL', prepaidMonths: 3, expectedRevision: configured.body.data.revision });
    expect(generated.status, JSON.stringify(generated.body)).toBe(200); return generated.body.data;
  }
  async function sign() {
    const state = await generate();
    const signed = await call('/signature', { contractId: state.contract._id, documentHash: state.contract.sha256, signatoryName: 'Jane Landlord', authorityConfirmed: true, termsAccepted: true });
    expect(signed.status, JSON.stringify(signed.body)).toBe(200); return signed.body.data;
  }
  async function checkout() { await sign(); const response = await call('/checkout'); expect(response.status, JSON.stringify(response.body)).toBe(200); return response.body.data; }
  function charge(state: { subscription: { providerCheckoutReference: string }; invoice: { totalMinor: number } }, amount?: number) {
    return { event: 'charge.success', data: { status: 'success', reference: state.subscription.providerCheckoutReference, amount: amount ?? state.invoice.totalMinor, currency: 'KES', paid_at: new Date().toISOString(), customer: { customer_code: 'CUS_contract' }, authorization: { authorization_code: 'AUTH_test_fixture', reusable: true } } };
  }
  async function signedWebhook(body: unknown) {
    const raw = Buffer.from(JSON.stringify(body)), signature = createHmac('sha512', integrationConfig.paystack.secretKey!).update(raw).digest('hex');
    await IntegrationService.handleWebhook('PAYSTACK', raw, signature);
  }
  it('completes new signup, owner step-up, pricing, contract, signature, invoice, verified payment and property access', async () => {
    expect((await request(app).get(path()).auth(token, { type: 'bearer' })).body.data.state).toBe('ACCOUNT_CREATED');
    const login = await request(app).post('/api/v1/auth/login').send({ method: 'email', email: 'owner@example.com', password: 'Secure-test-password-2026!' });
    expect(login.body.data.stepUpRequired).toBe(true);
    const verification = await request(app).post('/api/v1/auth/verify-step-up').send({ email: 'owner@example.com', code: '123456' });
    expect(verification.status).toBe(200); token = verification.body.data.accessToken;
    const propertyInput = { name: 'First Property', code: 'FIRST', propertyType: 'APARTMENT', address: { addressLine1: 'Test Road', city: 'Nairobi', country: 'Kenya' } };
    expect((await request(app).post(`/api/v1/organizations/${org}/properties`).auth(token, { type: 'bearer' }).send(propertyInput)).status).toBe(402);
    const state = await checkout();
    expect(state.state).toBe('PAYMENT_PENDING'); expect(state.invoice.total).toBe(33000); expect(state.contract.body).toContain('Acacia Holdings Limited'); expect(state.contract.body).toContain('33000.00');
    expect(PaystackBillingProvider.prototype.retryCheckout).toHaveBeenCalledWith('PLN_contract', expect.objectContaining({ initialAmount: 33000, amount: 11000, prepaidMonths: 3 }));
    await signedWebhook(charge(state));
    const activated = (await request(app).get(path()).auth(token, { type: 'bearer' })).body.data;
    expect(activated.state).toBe('ACTIVE'); expect(activated.nextStep).toBe('COMPLETE'); expect(activated.invoice.status).toBe('PAID'); expect(activated.subscription.renewalState).toBe('SCHEDULED');
    expect(PaystackBillingProvider.prototype.scheduleRenewal).toHaveBeenCalledWith(expect.objectContaining({ startsAt: new Date(activated.subscription.currentPeriodEnd) }));
    expect((await request(app).post(`/api/v1/organizations/${org}/properties`).auth(token, { type: 'bearer' }).send(propertyInput)).status).toBe(201);
    expect(await AuditLog.countDocuments({ organizationId: org, 'metadata.state': 'ACTIVE' })).toBe(1);
    for (const [name, id] of [['contract', activated.contract.documentId], ['signed-contract', activated.contract.signedDocumentId], ['invoice', activated.invoice.documentId], ['receipt', activated.invoice.receiptDocumentId]]) {
      const doc = await Document.findById(id).select('+artifactBody').orFail();
      expect(hash(Buffer.from(doc.artifactBody!))).toBe(doc.sha256); expect(doc.immutableArtifact).toBe(true);
      if (process.env.PCC_PDF_QA_DIR) await writeFile(`${process.env.PCC_PDF_QA_DIR}/${name}.pdf`, Buffer.from(doc.artifactBody!));
      const downloaded = await request(app).get(`/api/v1/documents/${id}/pdf`).auth(token, { type: 'bearer' }); expect(downloaded.status).toBe(200); expect(downloaded.headers['content-type']).toContain('application/pdf');
    }
    expect(await Evidence.countDocuments({ organizationId: org })).toBe(4);
  });
  it('persists resume state and makes generation, signing, checkout and duplicate provider events idempotent', async () => {
    const state = await checkout();
    await call('/contract', { planKey: 'CONTROL', prepaidMonths: 3, expectedRevision: 0 });
    const repeat = await call('/signature', { contractId: state.contract._id, documentHash: state.contract.sha256, signatoryName: 'Jane Landlord', authorityConfirmed: true, termsAccepted: true }); expect(repeat.status).toBe(200);
    await call('/checkout'); expect(PaystackBillingProvider.prototype.retryCheckout).toHaveBeenCalledTimes(1);
    const event = charge(state); await signedWebhook(event); await signedWebhook(event);
    expect(await OrganizationContract.countDocuments({ organizationId: org })).toBe(1); expect(await SubscriptionInvoice.countDocuments({ organizationId: org })).toBe(1);
    expect(await BillingEvent.countDocuments({ organizationId: org })).toBe(1); expect(PaystackBillingProvider.prototype.scheduleRenewal).toHaveBeenCalledTimes(1);
  });
  it('rejects unsigned checkout, bad hashes, missing authority and frontend activation claims', async () => {
    const state = await generate();
    expect((await call('/checkout')).status).toBe(409);
    const valid = { contractId: state.contract._id, documentHash: state.contract.sha256, signatoryName: 'Jane Landlord', authorityConfirmed: true, termsAccepted: true };
    expect((await call('/signature', { ...valid, documentHash: '0'.repeat(64) })).status).toBe(409);
    expect((await call('/signature', { ...valid, authorityConfirmed: false })).status).toBe(400);
    expect((await call('/signature', { ...valid, state: 'ACTIVE' })).status).toBe(400);
    expect((await Organization.findById(org).orFail()).onboarding!.state).toBe('CONTRACT_PENDING_SIGNATURE');
  });
  it('prevents cross-organization reads, invoice access, signatures, onboarding edits, activation and PDFs', async () => {
    const state = await sign(), other = await Organization.create({ name: 'Other organization', slug: 'other-org', onboarding: { state: 'ACCOUNT_CREATED' } });
    const otherOwner = await User.create({ phone: '+254700009003', firstName: 'Other', lastName: 'Owner' });
    const role = await Role.findOne({ key: 'LANDLORD' }).orFail();
    await OrganizationMembership.create({ organizationId: other._id, userId: otherOwner._id, roleIds: [role._id], scope: { allProperties: true } });
    const otherToken = jwt.sign({ sub: String(otherOwner._id), type: 'access' }, env.JWT_ACCESS_SECRET);
    for (const suffix of ['', '/quote?planKey=CONTROL&prepaidMonths=3']) expect((await request(app).get(path(suffix)).auth(otherToken, { type: 'bearer' })).status).toBe(403);
    for (const suffix of ['/contract', '/signature', '/checkout', '/reconcile']) expect((await request(app).post(path(suffix)).auth(otherToken, { type: 'bearer' }).send({})).status).toBe(403);
    expect((await request(app).put(path('/details')).auth(otherToken, { type: 'bearer' }).send({})).status).toBe(403);
    expect((await request(app).get(`/api/v1/billing/organizations/${org}/invoices`).auth(otherToken, { type: 'bearer' })).status).toBe(403);
    for (const id of [state.contract.documentId, state.contract.signedDocumentId, state.invoice.documentId]) expect((await request(app).get(`/api/v1/documents/${id}/pdf`).auth(otherToken, { type: 'bearer' })).status).toBe(403);
    const injected = await request(app).post(`/api/v1/organizations/${other._id}/landlord-onboarding/signature`).auth(otherToken, { type: 'bearer' }).send({ contractId: state.contract._id, documentHash: state.contract.sha256, signatoryName: 'Other Owner', authorityConfirmed: true, termsAccepted: true }); expect(injected.status).toBe(404);
    expect((await Organization.findById(other._id).orFail()).onboarding!.state).toBe('ACCOUNT_CREATED');
  });
  it('keeps signed contracts, template versions, invoice amounts and retained PDFs immutable, including for Super Admin', async () => {
    const state = await sign(); const contract = await OrganizationContract.findById(state.contract._id).orFail();
    contract.body = 'changed'; await expect(contract.save()).rejects.toThrow('SIGNED_CONTRACT_IMMUTABLE');
    await expect(OrganizationContract.findByIdAndUpdate(contract._id, { body: 'changed' })).rejects.toThrow('CONTRACT_SNAPSHOT_IMMUTABLE');
    const invoice = await SubscriptionInvoice.findById(state.invoice._id).orFail(); invoice.total += 1; await expect(invoice.save()).rejects.toThrow('INVOICE_SNAPSHOT_IMMUTABLE');
    const edit = await request(app).patch(`/api/v1/documents/${state.contract.signedDocumentId}`).auth(adminToken, { type: 'bearer' }).send({ title: 'Rewritten' }); expect(edit.status).toBe(409);
    await expect(Document.updateMany({}, { status: 'ARCHIVED' })).rejects.toThrow('DOCUMENT_ARTIFACT_IMMUTABLE');
    const template = await ContractTemplate.findOne({ status: 'ACTIVE' }).orFail(); template.body = 'changed'; await expect(template.save()).rejects.toThrow('CONTRACT_TEMPLATE_VERSION_IMMUTABLE');
    const impersonate = await request(app).post(path('/signature')).auth(adminToken, { type: 'bearer' }).send({ contractId: state.contract._id, documentHash: state.contract.sha256, signatoryName: 'Admin', authorityConfirmed: true, termsAccepted: true }); expect(impersonate.status).toBe(403);
  });
  it('retains historical bytes and prices after a new template is published and the catalog changes', async () => {
    const state = await sign(), before = await Document.findById(state.contract.signedDocumentId).select('+artifactBody').orFail();
    const newer = await ContractTemplateService.create(admin, { ...defaultContractDraft, version: 2, body: defaultContractDraft.body + '\nNew commercial review clause.', effectiveAt: new Date('2026-01-02'), variables: [...contractVariables] });
    await ContractTemplateService.status(admin, String(newer!._id), 'ACTIVE');
    await SubscriptionPlan.updateOne({ key: 'CONTROL' }, { amount: 20000 });
    const after = await Document.findById(state.contract.signedDocumentId).select('+artifactBody').orFail(); expect(Buffer.from(after.artifactBody!).equals(Buffer.from(before.artifactBody!))).toBe(true);
    expect((await OrganizationContract.findById(state.contract._id).orFail()).templateVersion).toBe(1); expect((await SubscriptionInvoice.findById(state.invoice._id).orFail()).total).toBe(33000);
    expect((await ContractTemplate.findOne({ version: 1 }).orFail()).status).toBe('RETIRED');
  });
  it('allows only an explicit audited pre-payment replacement and retains the signed predecessor and void invoice', async () => {
    const state = await sign();
    await OrganizationSubscription.updateOne({organizationId:org},{providerPlanCode:'PLN_unused_predecessor',providerCustomerId:'CUS_unused_predecessor'});
    const replacement = await call('/replacement', { planKey: 'CONTROL', prepaidMonths: 6, expectedRevision: state.revision, reason: 'Owner requested six prepaid months.', details: { legalName: 'Corrected Acacia Holdings', legalIdentifier: 'REG-CORRECTED', billingEmail: 'owner@example.com', unitCount: 55 } }); expect(replacement.status, JSON.stringify(replacement.body)).toBe(200);
    expect(replacement.body.data.subscription.providerPlanCode).toBeUndefined();
    expect(replacement.body.data.contract.body).toContain('Corrected Acacia Holdings');
    expect(replacement.body.data.contract.replacesContractId).toBe(state.contract._id); expect(replacement.body.data.contract.status).toBe('PENDING_SIGNATURE'); expect(replacement.body.data.invoice.total).toBe(66000);
    expect((await OrganizationContract.findById(state.contract._id).orFail()).status).toBe('SIGNED'); expect((await SubscriptionInvoice.findById(state.invoice._id).orFail()).status).toBe('VOID');
    expect(await AuditLog.countDocuments({ 'metadata.replacesContractId': state.contract._id })).toBeGreaterThan(0);
  });
  it('rejects wrong amount, invalid webhook signatures and manual payment bypass without activating', async () => {
    const state = await checkout();
    await expect(signedWebhook(charge(state, 1))).rejects.toMatchObject({ code: 'PROVIDER_AMOUNT_MISMATCH' });
    await expect(IntegrationService.handleWebhook('PAYSTACK', Buffer.from(JSON.stringify(charge(state))), 'invalid')).rejects.toThrow();
    const manual = await request(app).post(`/api/v1/billing/organizations/${org}/invoices/${state.invoice._id}/mark-paid`).auth(adminToken, { type: 'bearer' }).send({ amount: 33000 }); expect(manual.status).toBe(409);
    expect((await Organization.findById(org).orFail()).onboarding!.state).toBe('PAYMENT_PENDING'); expect((await SubscriptionInvoice.findById(state.invoice._id).orFail()).status).toBe('OPEN');
  });
  it('rolls back invoice, receipt, activation and events when the atomic audit fails, then recovers via webhook retry', async () => {
    const state = await checkout(), event = charge(state), record = vi.spyOn(AuditService, 'record').mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(signedWebhook(event)).rejects.toThrow('audit unavailable'); record.mockRestore();
    expect((await SubscriptionInvoice.findById(state.invoice._id).orFail()).status).toBe('OPEN'); expect((await Organization.findById(org).orFail()).onboarding!.state).toBe('PAYMENT_PENDING'); expect(await Document.countDocuments({ organizationId: org })).toBe(3);
    await signedWebhook(event); expect((await Organization.findById(org).orFail()).onboarding!.state).toBe('ACTIVE');
  });
  it('verifies payment on server reconciliation when a webhook is delayed', async () => {
    const state = await checkout(), body = charge(state);
    vi.spyOn(PaystackProvider.prototype, 'query').mockResolvedValue({ provider: 'PAYSTACK', providerTransactionId: body.data.reference, status: 'CONFIRMED', amountMinorUnits: body.data.amount, currency: 'KES', paidAt: new Date(body.data.paid_at), raw: body.data });
    const result = await BillingService.reconcile(); expect(result.prepaid.verified).toBe(1); expect((await Organization.findById(org).orFail()).onboarding!.state).toBe('ACTIVE');
  });
  it('preserves failed payment progress, safely creates a replacement checkout, and never duplicates invoices', async () => {
    const state = await checkout();
    vi.spyOn(PaystackProvider.prototype, 'query').mockResolvedValue({ provider: 'PAYSTACK', providerTransactionId: state.subscription.providerCheckoutReference, status: 'FAILED' });
    await BillingService.reconcile(); expect((await Organization.findById(org).orFail()).onboarding!.attentionCode).toBe('PAYMENT_FAILED');
    const recovered = await call('/reconcile'); expect(recovered.status, JSON.stringify(recovered.body)).toBe(200); expect(recovered.body.data.subscription.providerCheckoutReference).toBe('recovered-checkout');
    expect(await SubscriptionInvoice.countDocuments({ organizationId: org })).toBe(1); expect((await Organization.findById(org).orFail()).onboarding!.state).toBe('PAYMENT_PENDING');
  });
  it('shows admin progress and evidence while denying non-admin oversight and scoped staff signing', async () => {
    const state = await sign();
    const oversight = await request(app).get('/api/v1/platform-control/landlord-onboarding').auth(adminToken, { type: 'bearer' }); expect(oversight.status).toBe(200); expect(oversight.body.data.items[0].onboarding.state).toBe('INVOICE_ISSUED');
    expect((await request(app).get('/api/v1/platform-control/landlord-onboarding').auth(token, { type: 'bearer' })).status).toBe(403);
    const role = await Role.create({ name: 'Manager', key: 'PROPERTY_MANAGER', system: true, permissions });
    await OrganizationMembership.updateOne({ organizationId: org, userId: owner.userId }, { roleIds: [role._id], scope: { allProperties: true } });
    expect((await call('/signature', { contractId: state.contract._id, documentHash: state.contract.sha256, signatoryName: 'Jane Manager', authorityConfirmed: true, termsAccepted: true })).status).toBe(403);
  });
  it('collects correctly priced monthly renewals only after the prepaid term and retains renewal PDFs', async () => {
    const state = await checkout(); await signedWebhook(charge(state));
    const subscription = await OrganizationSubscription.findOne({ organizationId: org }).orFail();
    const renewal = { event: 'charge.success', data: { status: 'success', reference: 'renewal-test-1', subscription: { subscription_code: 'SUB_contract' }, amount: 1100000, currency: 'KES', paid_at: subscription.currentPeriodEnd.toISOString() } };
    await signedWebhook(renewal); await signedWebhook(renewal);
    const invoice = await SubscriptionInvoice.findOne({ providerInvoiceId: 'renewal-test-1' }).orFail(); expect(invoice.total).toBe(11000); expect(invoice.documentId).toBeTruthy(); expect(invoice.receiptDocumentId).toBeTruthy();
    expect((await OrganizationSubscription.findById(subscription._id).orFail()).currentPeriodEnd.toISOString()).toBe(addMonths(subscription.currentPeriodEnd, 1).toISOString());
    expect(await SubscriptionInvoice.countDocuments({ organizationId: org })).toBe(2);
  });
  it('flags ambiguous remote renewal submission without repeating the debit schedule', async () => {
    const state = await checkout(); vi.mocked(PaystackBillingProvider.prototype.scheduleRenewal).mockRejectedValue(new Error('network timeout'));
    await signedWebhook(charge(state));
    expect((await OrganizationSubscription.findOne({ organizationId: org }).orFail()).renewalState).toBe('REQUIRES_ATTENTION');
    vi.spyOn(PaystackBillingProvider.prototype, 'findRenewal').mockResolvedValue(undefined);
    await BillingService.reconcile(); expect(PaystackBillingProvider.prototype.scheduleRenewal).toHaveBeenCalledTimes(1);
    expect((await Organization.findById(org).orFail()).onboarding!.state).toBe('ACTIVE');
  });
  it('supports concurrent duplicate generation and multiple unpaid organizations without provider index collisions', async () => {
    await request(app).put(path('/details')).auth(token, { type: 'bearer' }).send({ legalName: 'Acacia Holdings', legalIdentifier: 'REG-A', billingEmail: 'owner@example.com', unitCount: 50 });
    const input = { planKey: 'CONTROL', prepaidMonths: 3, expectedRevision: 1 };
    const responses = await Promise.all([call('/contract', input), call('/contract', input)]); expect(responses.map(response => response.status)).toEqual([200, 200]); expect(await OrganizationContract.countDocuments({ organizationId: org })).toBe(1);
    const second = await Organization.create({ name: 'Second', slug: 'second', onboarding: { state: 'ORGANIZATION_CONFIGURED', revision: 1, legalName: 'Second Legal', legalIdentifier: 'REG-B', billingEmail: 'second@example.com', unitCount: 50 } });
    const secondOwner = { ...owner, memberships: [{ ...owner.memberships[0]!, organizationId: second._id }] };
    await LandlordOnboardingService.generate(secondOwner, String(second._id), input); expect(await SubscriptionInvoice.countDocuments({ status: 'OPEN' })).toBe(2);
  });
});
