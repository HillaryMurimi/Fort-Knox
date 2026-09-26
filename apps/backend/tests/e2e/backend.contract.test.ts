import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
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

describe.skipIf(!process.env.RUN_E2E)('backend release E2E certification', () => {
  let mongo: MongoMemoryServer;
  let userId: Types.ObjectId;
  let organizationId: Types.ObjectId;
  let tenancyId: Types.ObjectId;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  });

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

  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

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

  it('reconciles Stripe subscription and invoice webhooks into billing state', async () => {
    const plan = await SubscriptionPlan.create({ key: 'E2E', name: 'E2E Plan', amount: 30000, currency: 'KES', billingInterval: 'MONTH', active: true, entitlements: { maxProperties: 5, maxUnits: 100, maxUsers: 5, maxTenants: 100, features: [] } });
    const now = new Date();
    const subscription = await OrganizationSubscription.create({ organizationId, planId: plan._id, status: 'PAST_DUE', currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 30 * 86400000), provider: 'STRIPE', providerCustomerId: 'cus_e2e', providerSubscriptionId: 'sub_e2e', createdBy: userId, updatedBy: userId });
    const invoice = await SubscriptionInvoice.create({ organizationId, subscriptionId: subscription._id, invoiceNumber: 'INV-E2E', periodStart: now, periodEnd: new Date(now.getTime() + 30 * 86400000), subtotal: 30000, tax: 0, total: 30000, amountPaid: 0, currency: 'KES', status: 'OPEN', dueDate: now, provider: 'STRIPE', providerInvoiceId: 'in_e2e', createdBy: userId, updatedBy: userId });
    await IntegrationService.processBillingStripeEvent('invoice.paid', { id: 'in_e2e', subscription: 'sub_e2e' }, 'evt_invoice_e2e');
    const updatedInvoice = await SubscriptionInvoice.findById(invoice._id).orFail();
    const updatedSubscription = await OrganizationSubscription.findById(subscription._id).orFail();
    expect(updatedInvoice.status).toBe('PAID');
    expect(updatedInvoice.amountPaid).toBe(30000);
    expect(updatedSubscription.status).toBe('ACTIVE');
  });

  it('rejects stale Stripe signatures at the webhook boundary', async () => {
    const payload = Buffer.from(JSON.stringify({ id: `evt_${crypto.randomUUID()}`, type: 'payment_intent.succeeded', data: { object: { id: 'pi_missing' } } }));
    integrationConfig.stripe.webhookSecret = 'e2e_secret';
    const stale = Math.floor(Date.now() / 1000) - 301;
    const signature = crypto.createHmac('sha256', 'e2e_secret').update(`${stale}.${payload.toString('utf8')}`).digest('hex');
    await expect(IntegrationService.handleWebhook('STRIPE', payload, `t=${stale},v1=${signature}`)).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_SIGNATURE' });
    integrationConfig.stripe.webhookSecret = undefined;
  });
});
