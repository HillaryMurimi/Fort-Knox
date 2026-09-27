import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Types } from 'mongoose';
import crypto from 'node:crypto';
import { IntegrationService } from '../../src/modules/integrations/integration.service.js';
import { integrationConfig } from '../../src/core/integrations/config.js';
import { Organization } from '../../src/database/models/Organization.js';
import { User } from '../../src/database/models/User.js';
import { Property } from '../../src/database/models/Property.js';
import { Building } from '../../src/database/models/Building.js';
import { Floor } from '../../src/database/models/Floor.js';
import { Unit } from '../../src/database/models/Unit.js';
import { Tenant } from '../../src/database/models/Tenant.js';
import { Tenancy } from '../../src/database/models/Tenancy.js';
import { RentCharge } from '../../src/database/models/RentCharge.js';
import { Payment } from '../../src/database/models/Payment.js';
import { PaymentAllocation } from '../../src/database/models/PaymentAllocation.js';
import { SubscriptionPlan } from '../../src/database/models/SubscriptionPlan.js';
import { OrganizationSubscription } from '../../src/database/models/OrganizationSubscription.js';
import { SubscriptionInvoice } from '../../src/database/models/SubscriptionInvoice.js';
import { EntitlementService } from '../../src/core/billing/entitlement.service.js';
import { BillingService } from '../../src/modules/billing/billing.service.js';
import { PaystackBillingProvider } from '../../src/core/billing/billing-provider.js';
import { PaystackProvider } from '../../src/core/integrations/paystack.provider.js';

describe.skipIf(!process.env.RUN_E2E)('backend release E2E certification', () => {
  let mongo: MongoMemoryServer;
  let userId: Types.ObjectId;
  let organizationId: Types.ObjectId;
  let tenancyId: Types.ObjectId;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 180_000);

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    const user = await User.create({ phone: '+254700000001', email: 'e2e@example.com', firstName: 'E2E', lastName: 'Owner', verifiedAt: new Date() });
    userId = user._id;
    const organization = await Organization.create({ name: 'E2E Organization', slug: `e2e-${Date.now()}` });
    organizationId = organization._id;
    const property = await Property.create({ organizationId, name: 'E2E Property', code: 'E2E', propertyType: 'APARTMENT', address: { addressLine1: '1 Test Street', city: 'Nairobi', country: 'Kenya' }, createdBy: userId, updatedBy: userId });
    const building = await Building.create({ organizationId, propertyId: property._id, name: 'Main', code: 'MAIN', createdBy: userId, updatedBy: userId });
    const floor = await Floor.create({ organizationId, propertyId: property._id, buildingId: building._id, name: 'Ground', level: 0, code: 'G', createdBy: userId, updatedBy: userId });
    const unit = await Unit.create({ organizationId, propertyId: property._id, buildingId: building._id, floorId: floor._id, name: 'Unit 1', code: 'U1', unitType: 'ONE_BEDROOM', status: 'OCCUPIED', monthlyRent: 30000, createdBy: userId, updatedBy: userId });
    const tenantUser = await User.create({ phone: '+254700000002', email: 'tenant@example.com', firstName: 'E2E', lastName: 'Tenant', verifiedAt: new Date() });
    const tenant = await Tenant.create({ organizationId, userId: tenantUser._id, status: 'ACTIVE', createdBy: userId, updatedBy: userId });
    const tenancy = await Tenancy.create({ organizationId, propertyId: property._id, buildingId: building._id, floorId: floor._id, unitId: unit._id, tenantId: tenant._id, status: 'ACTIVE', leaseNumber: 'E2E-001', startDate: new Date(), monthlyRent: 30000, createdBy: userId, updatedBy: userId });
    tenancyId = tenancy._id;
  });

  afterAll(async () => { await mongoose.disconnect(); if (mongo) await mongo.stop(); });

  it('confirms an M-Pesa payment and allocates it FIFO to rent', async () => {
    const tenancy = await Tenancy.findById(tenancyId).orFail();
    const rent = await RentCharge.create({ organizationId, propertyId: tenancy.propertyId, buildingId: tenancy.buildingId, floorId: tenancy.floorId, unitId: tenancy.unitId, tenantId: tenancy.tenantId, tenancyId, periodStart: new Date('2026-09-01'), periodEnd: new Date('2026-09-30'), dueDate: new Date('2026-09-05'), rentAmount: 30000, serviceChargeAmount: 0, adjustments: 0, totalAmount: 30000, balanceAmount: 30000, createdBy: userId, updatedBy: userId });
    const payment = await Payment.create({ organizationId, propertyId: tenancy.propertyId, buildingId: tenancy.buildingId, floorId: tenancy.floorId, unitId: tenancy.unitId, tenantId: tenancy.tenantId, tenancyId, amount: 30000, currency: 'KES', method: 'MPESA', status: 'PENDING', provider: 'MPESA', providerTransactionId: 'ws_CO_e2e_1', createdBy: userId, updatedBy: userId });
    const payload = Buffer.from(JSON.stringify({ Body: { stkCallback: { CheckoutRequestID: 'ws_CO_e2e_1', ResultCode: 0, CallbackMetadata: { Item: [{ Name: 'Amount', Value: 30000 }, { Name: 'MpesaReceiptNumber', Value: 'RCP123' }] } } } }));
    await IntegrationService.handleWebhook('MPESA', payload);
    const confirmed = await Payment.findById(payment._id).orFail();
    const updatedRent = await RentCharge.findById(rent._id).orFail();
    const allocation = await PaymentAllocation.findOne({ paymentId: payment._id }).orFail();
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.receiptNumber).toBe('RCP123');
    expect(allocation.amount).toBe(30000);
    expect(updatedRent.status).toBe('PAID');
    expect(updatedRent.balanceAmount).toBe(0);
  });

  it('confirms a signed Paystack payment only when amount and currency match', async () => {
    const tenancy = await Tenancy.findById(tenancyId).orFail();
    const rent = await RentCharge.create({ organizationId, propertyId: tenancy.propertyId, buildingId: tenancy.buildingId, floorId: tenancy.floorId, unitId: tenancy.unitId, tenantId: tenancy.tenantId, tenancyId, periodStart: new Date('2026-10-01'), periodEnd: new Date('2026-10-31'), dueDate: new Date('2026-10-05'), rentAmount: 30000, serviceChargeAmount: 0, adjustments: 0, totalAmount: 30000, balanceAmount: 30000, createdBy: userId, updatedBy: userId });
    const payment = await Payment.create({ organizationId, propertyId: tenancy.propertyId, buildingId: tenancy.buildingId, floorId: tenancy.floorId, unitId: tenancy.unitId, tenantId: tenancy.tenantId, tenancyId, amount: 30000, currency: 'KES', method: 'CARD', status: 'PENDING', provider: 'PAYSTACK', providerTransactionId: 'pmcc-e2e-paystack', createdBy: userId, updatedBy: userId });
    const payload = Buffer.from(JSON.stringify({ event: 'charge.success', data: { id: 4099260516, status: 'success', reference: 'pmcc-e2e-paystack', amount: 3000000, currency: 'KES', channel: 'card', paid_at: '2026-09-20T10:00:00.000Z' } }));
    integrationConfig.paystack.secretKey = 'sk_test_e2e_paystack';
    integrationConfig.paystack.enabled = true;
    const signature = crypto.createHmac('sha512', integrationConfig.paystack.secretKey).update(payload).digest('hex');

    await IntegrationService.handleWebhook('PAYSTACK', payload, signature);
    await IntegrationService.handleWebhook('PAYSTACK', payload, signature);

    expect((await Payment.findById(payment._id).orFail()).status).toBe('CONFIRMED');
    expect((await RentCharge.findById(rent._id).orFail()).balanceAmount).toBe(0);
    expect(await PaymentAllocation.countDocuments({ paymentId: payment._id })).toBe(1);
    integrationConfig.paystack.secretKey = undefined;
    integrationConfig.paystack.enabled = false;
  });

  it('activates a pending Paystack subscription only for a matching signed charge', async () => {
    const plan = await SubscriptionPlan.create({ key: 'E2E', name: 'E2E Plan', amount: 30000, currency: 'KES', billingInterval: 'MONTH', active: true, entitlements: { maxProperties: 5, maxUnits: 100, maxUsers: 5, maxTenants: 100, features: [] } });
    const now = new Date();
    const subscription = await OrganizationSubscription.create({ organizationId, planId: plan._id, status: 'PENDING', currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 30 * 86400000), provider: 'PAYSTACK', providerCustomerId: 'CUS_e2e', providerPlanCode: 'PLN_e2e', providerCheckoutReference: 'bill_e2e', createdBy: userId, updatedBy: userId });
    const invoice = await SubscriptionInvoice.create({ organizationId, subscriptionId: subscription._id, invoiceNumber: 'INV-E2E', periodStart: now, periodEnd: new Date(now.getTime() + 30 * 86400000), subtotal: 30000, tax: 0, total: 30000, amountPaid: 0, currency: 'KES', status: 'OPEN', dueDate: now, provider: 'PAYSTACK', createdBy: userId, updatedBy: userId });
    await expect(IntegrationService.processPaystack({ event: 'charge.success', data: { status: 'success', reference: 'bill_e2e', amount: 2000000, currency: 'KES' } })).rejects.toMatchObject({ code: 'PROVIDER_AMOUNT_MISMATCH' });
    expect((await OrganizationSubscription.findById(subscription._id).orFail()).status).toBe('PENDING');
    await IntegrationService.processPaystack({ event: 'charge.success', data: { status: 'success', reference: 'bill_e2e', amount: 3000000, currency: 'KES' } });
    const updatedInvoice = await SubscriptionInvoice.findById(invoice._id).orFail();
    const updatedSubscription = await OrganizationSubscription.findById(subscription._id).orFail();
    expect(updatedInvoice.status).toBe('PAID');
    expect(updatedInvoice.amountPaid).toBe(30000);
    expect(updatedSubscription.status).toBe('ACTIVE');
    const platformAdmin = { userId, isPlatformAdmin: true, memberships: [] };
    await expect(BillingService.updatePlan(platformAdmin, String(plan._id), { amount: 1 })).rejects.toMatchObject({ code: 'PLAN_PRICE_LOCKED' });
    const fetchSubscription = vi.spyOn(PaystackBillingProvider.prototype, 'fetchSubscription').mockResolvedValue({ customerCode: 'CUS_e2e', planCode: 'PLN_e2e', subscriptionCode: 'SUB_e2e', emailToken: 'private-token' });
    await IntegrationService.processPaystack({ event: 'subscription.create', data: { customer: 42, plan: 7, subscription_code: 'SUB_e2e' } });
    expect(fetchSubscription).toHaveBeenCalledWith('SUB_e2e');
    fetchSubscription.mockRestore();
    await expect(IntegrationService.processPaystack({ event: 'invoice.update', data: { paid: true, status: 'success', subscription: { subscription_code: 'SUB_e2e' }, transaction: { status: 'success', reference: 'renew_e2e', amount: 1, currency: 'KES' } } })).rejects.toMatchObject({ code: 'PROVIDER_AMOUNT_MISMATCH' });
    await IntegrationService.processPaystack({ event: 'invoice.update', data: { paid: true, status: 'success', subscription: { subscription_code: 'SUB_e2e' }, transaction: { status: 'success', reference: 'renew_e2e', amount: 3000000, currency: 'KES' } } });
    expect(await SubscriptionInvoice.countDocuments({ organizationId, provider: 'PAYSTACK', status: 'PAID' })).toBe(2);
    const upgrade = await SubscriptionPlan.create({ key: 'E2E_UPGRADE', name: 'E2E Upgrade', amount: 45000, currency: 'KES', billingInterval: 'MONTH', active: true, entitlements: { maxProperties: 10, maxUnits: 200, maxUsers: 10, maxTenants: 200, features: [] } });
    const updatePlan = vi.spyOn(PaystackBillingProvider.prototype, 'updatePlan').mockResolvedValue(undefined);
    await BillingService.changePlan(platformAdmin, String(organizationId), upgrade.key, true);
    expect(updatePlan).toHaveBeenCalledWith('PLN_e2e', { planKey: upgrade.key, amount: upgrade.amount, currency: upgrade.currency, interval: upgrade.billingInterval });
    updatePlan.mockRestore();
    expect(String((await OrganizationSubscription.findById(subscription._id).orFail()).planId)).toBe(String(plan._id));
    await expect(IntegrationService.processPaystack({ event: 'invoice.update', data: { paid: true, status: 'success', subscription: { subscription_code: 'SUB_e2e' }, transaction: { status: 'success', reference: 'upgrade_e2e', amount: 3000000, currency: 'USD' } } })).rejects.toMatchObject({ code: 'PROVIDER_AMOUNT_MISMATCH' });
    await IntegrationService.processPaystack({ event: 'invoice.update', data: { paid: true, status: 'success', subscription: { subscription_code: 'SUB_e2e' }, transaction: { status: 'success', reference: 'upgrade_e2e', amount: 4500000, currency: 'KES' } } });
    const upgraded = await OrganizationSubscription.findById(subscription._id).orFail();
    expect(String(upgraded.planId)).toBe(String(upgrade._id));
    expect(upgraded.pendingPlanId).toBeUndefined();
    await OrganizationSubscription.findByIdAndUpdate(subscription._id, { currentPeriodEnd: new Date(Date.now() - 1000) });
    await expect(EntitlementService.getPlan(String(organizationId))).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
  });

  it('rejects invalid Paystack webhook signatures', async () => {
    const payload = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: `bill_${crypto.randomUUID()}` } }));
    integrationConfig.paystack.secretKey = 'sk_test_e2e';
    await expect(IntegrationService.handleWebhook('PAYSTACK', payload, 'invalid')).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_SIGNATURE' });
    integrationConfig.paystack.secretKey = undefined;
  });

  it('recovers a provider-abandoned checkout without granting access', async () => {
    const plan = await SubscriptionPlan.create({ key: 'RECOVERY', name: 'Recovery Plan', amount: 1000, currency: 'KES', billingInterval: 'MONTH', active: true, entitlements: { maxProperties: 1, maxUnits: 10, maxUsers: 2, maxTenants: 10, features: [] } });
    const start = new Date();
    const end = new Date(Date.now() + 30 * 86400000);
    const subscription = await OrganizationSubscription.create({ organizationId, planId: plan._id, status: 'PENDING', currentPeriodStart: start, currentPeriodEnd: end, provider: 'PAYSTACK', providerCustomerId: 'CUS_recovery', providerPlanCode: 'PLN_recovery', providerCheckoutReference: 'abandoned_1', providerCheckoutUrl: 'https://checkout.paystack.com/old', billingEmail: 'owner@example.com', createdBy: userId, updatedBy: userId });
    await SubscriptionInvoice.create({ organizationId, subscriptionId: subscription._id, invoiceNumber: 'INV-RECOVERY', periodStart: start, periodEnd: end, subtotal: 1000, tax: 0, total: 1000, amountPaid: 0, currency: 'KES', status: 'OPEN', dueDate: start, provider: 'PAYSTACK', createdBy: userId, updatedBy: userId });
    const query = vi.spyOn(PaystackProvider.prototype, 'query').mockResolvedValue({ provider: 'PAYSTACK', providerTransactionId: 'abandoned_1', status: 'FAILED' });
    const retry = vi.spyOn(PaystackBillingProvider.prototype, 'retryCheckout').mockResolvedValue({ checkoutReference: 'retry_2', checkoutUrl: 'https://checkout.paystack.com/new' });
    const result = await BillingService.recoverCheckout({ userId, isPlatformAdmin: true, memberships: [] }, String(organizationId));
    expect(result?.status).toBe('PENDING');
    expect(result?.providerCheckoutReference).toBe('retry_2');
    expect(result?.checkoutReferences).toContain('abandoned_1');
    expect(result?.toObject()).not.toHaveProperty('billingEmail');
    expect(retry).toHaveBeenCalledTimes(1);
    query.mockResolvedValue({ provider: 'PAYSTACK', providerTransactionId: 'retry_2', status: 'PENDING' });
    const stillPending = await BillingService.recoverCheckout({ userId, isPlatformAdmin: true, memberships: [] }, String(organizationId));
    expect(stillPending?.providerCheckoutReference).toBe('retry_2');
    expect(retry).toHaveBeenCalledTimes(1);
    query.mockResolvedValue({ provider: 'PAYSTACK', providerTransactionId: 'retry_2', status: 'CONFIRMED', amountMinorUnits: 100000, currency: 'KES' });
    const paid = await BillingService.recoverCheckout({ userId, isPlatformAdmin: true, memberships: [] }, String(organizationId));
    expect(paid?.status).toBe('ACTIVE');
    expect((await SubscriptionInvoice.findOne({ subscriptionId: subscription._id }).orFail()).status).toBe('PAID');
    query.mockRestore(); retry.mockRestore();
  });

  it('cancels at Paystack and never returns the private email token', async () => {
    const plan = await SubscriptionPlan.create({ key: 'CANCEL', name: 'Cancellation Plan', amount: 1000, currency: 'KES', billingInterval: 'MONTH', active: true, entitlements: { maxProperties: 1, maxUnits: 10, maxUsers: 2, maxTenants: 10, features: [] } });
    await OrganizationSubscription.create({ organizationId, planId: plan._id, status: 'ACTIVE', currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 86400000), provider: 'PAYSTACK', providerCustomerId: 'CUS_cancel', providerSubscriptionId: 'SUB_cancel', providerPlanCode: 'PLN_cancel', providerEmailToken: 'private-token', createdBy: userId, updatedBy: userId });
    const disable = vi.spyOn(PaystackBillingProvider.prototype, 'cancelSubscription').mockResolvedValue(undefined);
    const result = await BillingService.cancel({ userId, isPlatformAdmin: true, memberships: [] }, String(organizationId), false);
    expect(disable).toHaveBeenCalledWith('SUB_cancel', 'private-token');
    expect(result?.status).toBe('CANCELLED');
    expect(result?.toObject()).not.toHaveProperty('providerEmailToken');
    disable.mockRestore();
  });
});
