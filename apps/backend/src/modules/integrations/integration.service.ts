import mongoose, { Types } from 'mongoose';
import { Payment, type PaymentDocument } from '../../database/models/Payment.js';
import { RefundService } from '../finance/refund.service.js';
import { PaymentDestination } from '../../database/models/PaymentDestination.js';
import { WebhookEvent } from '../../database/models/WebhookEvent.js';
import { IntegrationAttempt } from '../../database/models/IntegrationAttempt.js';
import { User } from '../../database/models/User.js';
import { AppError } from '../../core/errors/AppError.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { IntegrationDispatcher } from '../../core/integrations/dispatcher.js';
import { getStorageProvider } from '../documents/storage.providers.js';
import { SecurityCamera } from '../../database/models/SecurityCamera.js';
import { GenericCctvProvider, NvrHttpProvider } from '../../core/integrations/cctv-providers.js';
import { AuditService } from '../audit/audit.service.js';
import { Job } from '../../database/models/Job.js';
import { RentCharge } from '../../database/models/RentCharge.js';
import { PaymentAllocation } from '../../database/models/PaymentAllocation.js';
import { Tenant } from '../../database/models/Tenant.js';
import { SubscriptionInvoice } from '../../database/models/SubscriptionInvoice.js';
import { SubscriptionPlan } from '../../database/models/SubscriptionPlan.js';
import { OrganizationSubscription } from '../../database/models/OrganizationSubscription.js';
import { BillingEvent } from '../../database/models/BillingEvent.js';
import { integrationConfig } from '../../core/integrations/config.js';
import { verifyHmacSignature, hashPayload } from '../../core/integrations/webhook.security.js';
import { withRetry } from '../../core/integrations/retry.js';
import { toPaystackMinorUnits } from '../../core/integrations/paystack.provider.js';
import { addMinorUnits, legacyMajorUnits, legacyMinorUnits } from '../../core/money/legacy-finance.js';
import { choosePaidRenewalPlan } from '../../core/billing/renewal-plan.js';
import { PaystackBillingProvider } from '../../core/billing/billing-provider.js';
import type { PaymentInitiationResult, PaymentProviderKey, PaystackChannel } from '../../core/integrations/provider.types.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';

export class IntegrationService {
  static async initiatePayment(
    auth: AuthenticatedUser,
    paymentId: string,
    providerKey: PaymentProviderKey,
    phone?: string,
    email?: string,
    paystackChannels?: PaystackChannel[],
  ) {
    const p = await Payment.findOne({ _id: paymentId });
    if (!p) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
    AuthorizationService.assertCan(auth, 'payment.create', {
      organizationId: p.organizationId,
      propertyId: p.propertyId,
      buildingId: p.buildingId,
      unitId: p.unitId,
    });
    if (p.status !== 'PENDING') {
      throw new AppError(409, 'INVALID_PAYMENT_STATE', 'Only pending payments can be initiated');
    }
    if (p.providerTransactionId) {
      throw new AppError(409, 'PAYMENT_ALREADY_INITIATED', 'Payment has already been initiated');
    }
    const openCharges = await RentCharge.find({
      organizationId: p.organizationId,
      tenancyId: p.tenancyId,
      currency: p.currency,
      status: { $in: ['OPEN', 'PARTIALLY_PAID', 'OVERDUE'] },
      balanceAmount: { $gt: 0 },
    }).select('balanceAmount').lean();
    const outstanding = openCharges.reduce((sum, charge) => sum + charge.balanceAmount, 0);
    if (p.amount > outstanding + 0.000001) {
      throw new AppError(
        409,
        'PAYMENT_EXCEEDS_OUTSTANDING_RENT',
        'Payment amount exceeds the tenancy outstanding balance',
      );
    }

    const tenant = await Tenant.findById(p.tenantId).select('userId').lean();
    const payer = tenant
      ? await User.findById(tenant.userId).select('phone email').lean()
      : null;
    const payerPhone = phone ?? payer?.phone ?? undefined;
    const payerEmail = email ?? payer?.email ?? undefined;
    if (providerKey === 'MPESA' && !payerPhone) {
      throw new AppError(400, 'MPESA_PHONE_REQUIRED', 'A payer phone number is required');
    }
    if (providerKey === 'PAYSTACK' && !payerEmail) {
      throw new AppError(400, 'PAYSTACK_EMAIL_REQUIRED', 'A payer email address is required');
    }

    const attempt = await IntegrationAttempt.create({
      organizationId: p.organizationId,
      provider: providerKey,
      operation: 'payment.initiate',
      status: 'STARTED',
      attempt: 1,
      maxAttempts: 3,
    });

    try {
      const destination = providerKey === 'PAYSTACK' || providerKey === 'MPESA'
        ? await PaymentDestination.findOne({
            organizationId: p.organizationId,
            provider: providerKey,
            status: 'ACTIVE',
            isDefault: true,
          }).lean()
        : null;
      const result = await IntegrationDispatcher.payment(providerKey).initiate({
        organizationId: String(p.organizationId),
        paymentId: String(p._id),
        amount: p.amount,
        currency: p.currency,
        phone: payerPhone,
        email: payerEmail,
        reference:
          providerKey === 'PAYSTACK'
            ? `pmcc-${p._id}`
            : providerKey === 'MPESA'
              ? `PMCC${String(p._id).slice(-8)}`
              : p.receiptNumber ?? String(p._id),
        description: p.notes ?? 'Property Command Center payment',
        paystackChannels,
        ...(providerKey === 'PAYSTACK' && destination?.paystackSubaccountCode
          ? { paystackSubaccountCode: destination.paystackSubaccountCode }
          : {}),
        metadata: destination ? { paymentDestinationId: String(destination._id) } : undefined,
      });

      p.provider = providerKey;
      p.providerTransactionId = result.providerTransactionId;
      p.status = result.status === 'FAILED' ? 'FAILED' : 'PENDING';
      p.metadata.set('providerInitiation', {
        checkoutRequestId: result.checkoutRequestId,
        customerMessage: result.customerMessage,
      });
      await p.save();

      if (result.status === 'CONFIRMED') {
        this.assertProviderAmount(p, result);
        if (result.paidAt) p.paidAt = result.paidAt;
        await this.confirmProviderPayment(p);
      }

      if (result.status === 'PENDING') {
        await Job.findOneAndUpdate(
          { dedupeKey: `payment-reconcile:${p._id}` },
          {
            organizationId: p.organizationId,
            type: 'payment.provider-reconcile',
            payload: { paymentId: String(p._id) },
            status: 'QUEUED',
            availableAt: new Date(Date.now() + 60_000),
            priority: 5,
            maxAttempts: 8,
          },
          { upsert: true, setDefaultsOnInsert: true, new: true },
        );
      }

      attempt.status = 'SUCCEEDED';
      attempt.externalReference = result.providerTransactionId;
      attempt.durationMs = Date.now() - attempt.createdAt.getTime();
      await attempt.save();

      await AuditService.record({
        organizationId: p.organizationId,
        actorUserId: new Types.ObjectId(auth.userId),
        action: 'payment.provider.initiated',
        resourceType: 'Payment',
        resourceId: p._id,
        propertyId: p.propertyId,
        buildingId: p.buildingId,
        unitId: p.unitId,
        metadata: { provider: providerKey, providerTransactionId: result.providerTransactionId, paymentDestinationId: destination?._id },
      });

      return this.publicPaymentResult(result);
    } catch (error) {
      attempt.status = 'FAILED';
      attempt.error = error instanceof Error ? error.message : 'Provider failure';
      attempt.durationMs = Date.now() - attempt.createdAt.getTime();
      await attempt.save();
      throw error;
    }
  }

  static async reconcilePaymentSystem(paymentId: string) {
    return this.reconcileProviderPayment(paymentId);
  }

  static async reconcilePayment(auth: AuthenticatedUser, paymentId: string) {
    const p = await Payment.findById(paymentId);
    if (!p) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
    AuthorizationService.assertCan(auth, 'payment.view', {
      organizationId: p.organizationId,
      propertyId: p.propertyId,
      buildingId: p.buildingId,
      unitId: p.unitId,
    });
    return this.reconcileProviderPayment(paymentId);
  }

  private static async reconcileProviderPayment(paymentId: string) {
    const payment = await Payment.findById(paymentId);
    if (!payment?.provider || !payment.providerTransactionId) return null;
    const providerKey = payment.provider as PaymentProviderKey;
    const result = await withRetry(
      () => IntegrationDispatcher.payment(providerKey).query(payment.providerTransactionId!),
      { maxAttempts: 3 },
    );

    if (result.status === 'CONFIRMED') {
      this.assertProviderAmount(payment, result);
      if (result.paidAt) payment.paidAt = result.paidAt;
      await this.confirmProviderPayment(payment);
    } else if (result.status === 'FAILED' && payment.status === 'PENDING') {
      payment.status = 'FAILED';
      await payment.save();
    }
    return this.publicPaymentResult(result);
  }

  static async upload(
    auth: AuthenticatedUser,
    organizationId: string,
    key: string,
    body: Buffer,
    contentType: string,
    provider: 'CLOUDINARY' | 'S3' | 'OTHER',
  ) {
    AuthorizationService.assertCan(auth, 'document.manage', { organizationId });
    const result = await getStorageProvider(provider).put({ key, body, contentType });
    await AuditService.record({
      organizationId: new Types.ObjectId(organizationId),
      actorUserId: auth.userId,
      action: 'storage.object.uploaded',
      resourceType: 'StorageObject',
      metadata: { provider, key: result.storageKey },
    });
    return result;
  }

  static async signedUrl(
    auth: AuthenticatedUser,
    organizationId: string,
    key: string,
    provider: 'CLOUDINARY' | 'S3' | 'OTHER',
    expiresInSeconds = 900,
  ) {
    AuthorizationService.assertCan(auth, 'document.view', { organizationId });
    return getStorageProvider(provider).getSignedUrl({ key, expiresInSeconds });
  }

  static async cctvHealth(auth: AuthenticatedUser, organizationId: string, cameraId: string) {
    const c = await SecurityCamera.findOne({ _id: cameraId, organizationId });
    if (!c) throw new AppError(404, 'CAMERA_NOT_FOUND', 'Camera not found');
    AuthorizationService.assertCan(auth, 'cctv.view', {
      organizationId: c.organizationId,
      propertyId: c.propertyId,
      buildingId: c.buildingId ?? undefined,
      unitId: c.unitId ?? undefined,
    });
    const provider = c.provider === 'NVR' ? new NvrHttpProvider() : new GenericCctvProvider();
    return provider.health(c.streamRef ?? c.cameraCode);
  }

  static async handleWebhook(
    provider: 'MPESA' | 'PAYSTACK',
    payload: Buffer,
    signature?: string,
  ) {
    const secret = provider === 'PAYSTACK' ? integrationConfig.paystack.secretKey : integrationConfig.mpesa.webhookSecret;

    if (provider === 'PAYSTACK') {
      if (!secret) {
        throw new AppError(503, 'PAYSTACK_NOT_CONFIGURED', 'Paystack webhook verification is not configured');
      }
      if (!verifyHmacSignature(payload, signature, secret, 'sha512')) {
        throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid Paystack webhook signature');
      }
    } else if (provider === 'MPESA' && secret && !verifyHmacSignature(payload, signature, secret)) {
      throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid M-Pesa webhook signature');
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(payload.toString('utf8')) as Record<string, unknown>;
    } catch {
      throw new AppError(400, 'INVALID_WEBHOOK_PAYLOAD', 'Webhook body must be valid JSON');
    }

    let eventId: string;
    if (provider === 'PAYSTACK') {
      const data = body.data as Record<string, unknown> | undefined;
      const eventType = String(body.event ?? 'unknown');
      eventId = `${eventType}:${String(data?.reference ?? data?.id ?? 'event')}:${eventType === 'charge.success' ? '' : hashPayload(payload)}`;
    } else {
      const callback = (body.Body as Record<string, unknown> | undefined)?.stkCallback as
        | Record<string, unknown>
        | undefined;
      eventId = String(callback?.CheckoutRequestID ?? hashPayload(payload));
    }

    const existing = await WebhookEvent.findOne({ provider, eventId });
    if (existing && existing.payloadHash !== hashPayload(payload)) throw new AppError(409, 'WEBHOOK_EVENT_COLLISION', 'Webhook event identifier has a different payload');
    if (existing && existing.status !== 'FAILED') return existing;

    const event = existing ?? await WebhookEvent.create({
      provider,
      eventId,
      payloadHash: hashPayload(payload),
      payload: this.sanitizedWebhookPayload(provider, body),
      status: 'RECEIVED',
    });
    if (existing) { event.status = 'RECEIVED'; event.error = undefined; await event.save(); }

    try {
      if (provider === 'PAYSTACK') await this.processPaystack(body);
      else await this.processMpesa(body);
      event.status = 'PROCESSED';
      event.processedAt = new Date();
      await event.save();
      return event;
    } catch (error) {
      event.status = 'FAILED';
      event.error = error instanceof Error ? error.message : 'Webhook processing failed';
      await event.save();
      throw error;
    }
  }

  static async processMpesa(body: Record<string, unknown>) {
    const callback = (body.Body as Record<string, unknown> | undefined)?.stkCallback as
      | Record<string, unknown>
      | undefined;
    if (!callback) return;

    const checkout = String(callback.CheckoutRequestID ?? '');
    const p = await Payment.findOne({ provider: 'MPESA', providerTransactionId: checkout });
    if (!p) return;

    const code = Number(callback.ResultCode ?? -1);
    if (code !== 0) {
      return;
    }

    // Daraja callbacks are not natively signed. Treat the callback only as a
    // reconciliation trigger and confirm against Safaricom's authenticated
    // STK query endpoint before changing financial state.
    const providerResult = await IntegrationDispatcher.payment('MPESA').query(checkout);
    if (providerResult.status !== 'CONFIRMED') return;

    const items =
      (callback.CallbackMetadata as { Item?: Array<{ Name: string; Value?: unknown }> } | undefined)
        ?.Item ?? [];
    const receipt = items.find((x) => x.Name === 'MpesaReceiptNumber')?.Value;
    const amount = Number(items.find((x) => x.Name === 'Amount')?.Value);
    if (!Number.isFinite(amount) || Math.abs(amount - p.amount) > 0.000001) {
      throw new AppError(409, 'PROVIDER_AMOUNT_MISMATCH', 'M-Pesa amount does not match payment');
    }
    if (p.currency !== 'KES') {
      throw new AppError(409, 'PROVIDER_CURRENCY_MISMATCH', 'M-Pesa payment currency must be KES');
    }
    if (receipt) p.receiptNumber = String(receipt);

    await this.confirmProviderPayment(p);
  }

  static async processPaystack(body: Record<string, unknown>) {
    const eventType = String(body.event ?? '');
    const eventData = body.data as Record<string, unknown> | undefined;
    if (['refund.pending', 'refund.processing', 'refund.needs-attention', 'refund.failed', 'refund.processed'].includes(eventType)) {
      if (!eventData) throw new AppError(400, 'INVALID_REFUND_EVENT', 'Refund event is missing data');
      const reference = String(eventData.transaction_reference ?? '');
      const amountMinorUnits = Number(eventData.amount);
      const currency = String(eventData.currency ?? '').toUpperCase();
      if (!reference || !Number.isSafeInteger(amountMinorUnits) || amountMinorUnits <= 0 || !/^[A-Z]{3}$/.test(currency)) throw new AppError(400, 'INVALID_REFUND_EVENT', 'Refund event is missing payment details');
      const status = eventType.slice('refund.'.length).replace('-', '_').toUpperCase() as 'PENDING' | 'PROCESSING' | 'NEEDS_ATTENTION' | 'FAILED' | 'PROCESSED';
      const providerRefundId = Number(eventData.id);
      await RefundService.recordWebhookStatus(reference, { amountMinorUnits, currency, status, ...(Number.isSafeInteger(providerRefundId) && providerRefundId > 0 ? { providerRefundId } : {}) });
      return;
    }
    if (eventType === 'subscription.create' && eventData) {
      const customer = eventData.customer as Record<string, unknown> | undefined;
      const plan = eventData.plan as Record<string, unknown> | undefined;
      const code = String(eventData.subscription_code ?? '');
      if (!code) return;
      const details = customer?.customer_code && plan?.plan_code && typeof eventData.email_token === 'string'
        ? { customerCode: String(customer.customer_code), planCode: String(plan.plan_code), subscriptionCode: code, emailToken: eventData.email_token }
        : await new PaystackBillingProvider().fetchSubscription(code);
      const subscription = await OrganizationSubscription.findOne({ provider: 'PAYSTACK', providerCustomerId: details.customerCode, providerPlanCode: details.planCode });
      if (subscription) {
        subscription.providerSubscriptionId = details.subscriptionCode;
        if (details.emailToken) subscription.providerEmailToken = details.emailToken;
        await subscription.save();
      }
      return;
    }
    if (eventType === 'invoice.payment_failed' && eventData) {
      const reference = eventData.subscription as Record<string, unknown> | undefined;
      const subscription = await OrganizationSubscription.findOne({ provider: 'PAYSTACK', providerSubscriptionId: String(reference?.subscription_code ?? eventData.subscription_code ?? '') });
      if (subscription && subscription.status === 'ACTIVE') { subscription.status = 'PAST_DUE'; await subscription.save(); }
      return;
    }
    if (eventType === 'subscription.disable' && eventData) {
      const subscription = await OrganizationSubscription.findOne({ provider: 'PAYSTACK', providerSubscriptionId: String(eventData.subscription_code ?? '') });
      if (subscription && !subscription.cancelAtPeriodEnd) { subscription.status = 'CANCELLED'; subscription.cancelledAt = new Date(); await subscription.save(); }
      return;
    }
    if (eventType === 'subscription.not_renew' && eventData) {
      const subscription = await OrganizationSubscription.findOne({ provider: 'PAYSTACK', providerSubscriptionId: String(eventData.subscription_code ?? '') });
      if (subscription) { subscription.cancelAtPeriodEnd = true; await subscription.save(); }
      return;
    }
    if (eventType === 'invoice.update' && eventData?.paid === true && eventData.status === 'success') {
      const recurring = eventData.subscription as Record<string, unknown> | undefined;
      const transaction = eventData.transaction as Record<string, unknown> | undefined;
      if (recurring?.subscription_code && transaction?.status === 'success' && transaction.reference) {
        const initial = await OrganizationSubscription.findOne({ provider: 'PAYSTACK', $or: [{ providerCheckoutReference: String(transaction.reference) }, { checkoutReferences: String(transaction.reference) }] });
        if (initial) {
          initial.providerSubscriptionId = String(recurring.subscription_code);
          if (typeof recurring.email_token === 'string') initial.providerEmailToken = recurring.email_token;
          await initial.save();
        }
        await this.processPaystack({ event: 'charge.success', data: { ...transaction, subscription: { subscription_code: recurring.subscription_code }, paid_at: eventData.paid_at } });
      }
      return;
    }
    if (eventType !== 'charge.success') return;

    const data = body.data as Record<string, unknown> | undefined;
    if (!data || String(data.status ?? '') !== 'success') return;
    const reference = String(data.reference ?? '');
    if (!reference) throw new AppError(400, 'PAYSTACK_REFERENCE_MISSING', 'Paystack reference is missing');

    const payment = await Payment.findOne({
      provider: 'PAYSTACK',
      providerTransactionId: reference,
    });
    if (!payment) {
      const subscription = await OrganizationSubscription.findOne({ provider: 'PAYSTACK', $or: [{ providerCheckoutReference: reference }, { checkoutReferences: reference }] });
      if (!subscription) {
        const recurring = data.subscription as Record<string, unknown> | string | undefined;
        const recurringCode = typeof recurring === 'string' ? recurring : String(recurring?.subscription_code ?? '');
        const active = recurringCode ? await OrganizationSubscription.findOne({ provider: 'PAYSTACK', providerSubscriptionId: recurringCode, status: { $in: ['ACTIVE', 'PAST_DUE'] } }) : null;
        if (!active) return;
        const currentPlan = await SubscriptionPlan.findById(active.planId);
        const pendingPlan = active.pendingPlanId ? await SubscriptionPlan.findById(active.pendingPlanId) : null;
        if (!currentPlan) throw new AppError(409, 'BILLING_PLAN_MISSING', 'Subscription plan is missing');
        const { plan, applyPending } = choosePaidRenewalPlan(currentPlan, pendingPlan, Number(data.amount), String(data.currency ?? ''));
        const prior = await SubscriptionInvoice.findOne({ provider: 'PAYSTACK', providerInvoiceId: reference });
        if (prior) return;
        const paidAt = this.validDate(data.paid_at) ?? new Date();
        const periodEnd = new Date(paidAt);
        if (plan.billingInterval === 'YEAR') periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
        else periodEnd.setUTCMonth(periodEnd.getUTCMonth() + (plan.billingInterval === 'QUARTER' ? 3 : 1));
        await SubscriptionInvoice.create({ organizationId: active.organizationId, subscriptionId: active._id, invoiceNumber: `INV-PS-${reference}`, periodStart: paidAt, periodEnd, subtotal: plan.amount, tax: 0, total: plan.amount, amountPaid: plan.amount, currency: plan.currency, status: 'PAID', dueDate: paidAt, paidAt, provider: 'PAYSTACK', providerInvoiceId: reference, createdBy: active.createdBy, updatedBy: active.updatedBy, lineItems: [{ description: plan.name, quantity: 1, unitAmount: plan.amount }] });
        active.status = 'ACTIVE'; active.currentPeriodStart = paidAt; active.currentPeriodEnd = periodEnd;
        if (pendingPlan && applyPending) { active.planId = pendingPlan._id; active.pendingPlanId = undefined; active.pendingPlanEffectiveAt = undefined; }
        await active.save();
        if (pendingPlan && applyPending) await AuditService.record({ organizationId: active.organizationId, action: 'BILLING_PLAN_CHANGE_APPLIED', resourceType: 'OrganizationSubscription', resourceId: active._id, metadata: { planId: String(plan._id), chargeReference: reference } });
        return;
      }
      if (subscription.status === 'CANCELLED') throw new AppError(409, 'CHARGE_AFTER_CANCELLATION', 'Paystack reported a charge after cancellation; refund review is required');
      const invoice = await SubscriptionInvoice.findOne({ subscriptionId: subscription._id, provider: 'PAYSTACK' }).sort({ createdAt: -1 });
      if (!invoice) throw new AppError(409, 'BILLING_INVOICE_MISSING', 'Subscription invoice is missing');
      if (Number(data.amount) !== toPaystackMinorUnits(invoice.total, invoice.currency) || String(data.currency ?? '').toUpperCase() !== invoice.currency.toUpperCase()) {
        throw new AppError(409, 'PROVIDER_AMOUNT_MISMATCH', 'Subscription charge does not match its invoice');
      }
      if (invoice.status === 'PAID' && invoice.providerInvoiceId && invoice.providerInvoiceId !== reference) throw new AppError(409, 'DUPLICATE_SUBSCRIPTION_CHARGE', 'A second subscription charge requires refund review');
      if (invoice.status === 'PAID' && subscription.status === 'ACTIVE') return;
      if (invoice.status !== 'PAID') {
        invoice.status = 'PAID';
        invoice.amountPaid = invoice.total;
        invoice.paidAt = this.validDate(data.paid_at) ?? new Date();
        invoice.providerInvoiceId = reference;
        await invoice.save();
      }
      subscription.status = 'ACTIVE';
      subscription.currentPeriodStart = invoice.paidAt ?? new Date();
      subscription.currentPeriodEnd = new Date(subscription.currentPeriodStart.getTime() + (invoice.periodEnd.getTime() - invoice.periodStart.getTime()));
      await subscription.save();
      await BillingEvent.findOneAndUpdate({ eventId: `paystack:${reference}` }, { organizationId: subscription.organizationId, provider: 'PAYSTACK', type: 'INVOICE_PAID', externalReference: reference, status: 'PROCESSED', processedAt: new Date() }, { upsert: true, new: true, setDefaultsOnInsert: true });
      return;
    }

    const result: PaymentInitiationResult = {
      provider: 'PAYSTACK',
      providerTransactionId: reference,
      status: 'CONFIRMED',
      amountMinorUnits: Number(data.amount),
      currency: String(data.currency ?? '').toUpperCase(),
      paidAt: this.validDate(data.paid_at),
    };
    this.assertProviderAmount(payment, result);

    const channel = String(data.channel ?? '');
    if (channel === 'card') payment.method = 'CARD';
    else if (channel === 'bank' || channel === 'bank_transfer') payment.method = 'BANK_TRANSFER';
    else payment.method = 'OTHER';
    payment.paidAt = result.paidAt ?? payment.paidAt;
    payment.receiptNumber = String(data.receipt_number ?? reference);
    await this.confirmProviderPayment(payment);
  }

  private static assertProviderAmount(
    payment: { amount: number; currency: string; provider?: string | null },
    result: PaymentInitiationResult,
  ) {
    if (payment.provider !== 'PAYSTACK') return;
    if (!Number.isSafeInteger(result.amountMinorUnits)) {
      throw new AppError(409, 'PROVIDER_AMOUNT_MISSING', 'Provider did not return a valid amount');
    }
    if (result.amountMinorUnits !== toPaystackMinorUnits(payment.amount, payment.currency)) {
      throw new AppError(409, 'PROVIDER_AMOUNT_MISMATCH', 'Provider amount does not match payment');
    }
    if (result.currency?.toUpperCase() !== payment.currency.toUpperCase()) {
      throw new AppError(409, 'PROVIDER_CURRENCY_MISMATCH', 'Provider currency does not match payment');
    }
  }

  private static publicPaymentResult(result: PaymentInitiationResult): PaymentInitiationResult {
    const publicResult = { ...result };
    delete publicResult.raw;
    return publicResult;
  }

  private static validDate(value: unknown): Date | undefined {
    if (typeof value !== 'string') return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private static sanitizedWebhookPayload(
    provider: 'MPESA' | 'PAYSTACK',
    body: Record<string, unknown>,
  ) {
    if (provider === 'PAYSTACK') {
      const data = body.data as Record<string, unknown> | undefined;
      return {
        event: body.event,
        data: data
          ? {
              id: data.id,
              status: data.status,
              reference: data.reference,
              amount: data.amount,
              currency: data.currency,
              paid_at: data.paid_at,
              channel: data.channel,
              receipt_number: data.receipt_number,
              transaction_reference: data.transaction_reference,
              refund_reference: data.refund_reference,
            }
          : undefined,
      };
    }
    const callback = (body.Body as Record<string, unknown> | undefined)?.stkCallback as
      | Record<string, unknown>
      | undefined;
    return {
      Body: callback
        ? {
            stkCallback: {
              MerchantRequestID: callback.MerchantRequestID,
              CheckoutRequestID: callback.CheckoutRequestID,
              ResultCode: callback.ResultCode,
              ResultDesc: callback.ResultDesc,
            },
          }
        : undefined,
    };
  }

  static async confirmProviderPayment(
    payment: {
      _id: Types.ObjectId;
      organizationId: Types.ObjectId;
      propertyId: Types.ObjectId;
      buildingId: Types.ObjectId;
      unitId: Types.ObjectId;
      tenancyId: Types.ObjectId;
      amount: number;
      currency: string;
      method: PaymentDocument['method'];
      status: string;
      paidAt?: Date | null;
      confirmedAt?: Date | null;
      receiptNumber?: string | null;
      createdBy: Types.ObjectId;
      updatedBy: Types.ObjectId;
    },
  ) {
    const session=await mongoose.startSession();
    try {
      const confirmed=await session.withTransaction(async()=>{
        const current=await Payment.findOne({_id:payment._id,organizationId:payment.organizationId}).session(session);
        if(!current)throw new AppError(404,'PAYMENT_NOT_FOUND','Payment not found');
        if(current.status==='CONFIRMED')return current;
        if(current.status!=='PENDING')throw new AppError(409,'INVALID_PAYMENT_STATE','Provider payment must be pending before confirmation');
        if(current.amount!==payment.amount||current.currency!==payment.currency)throw new AppError(409,'PAYMENT_CHANGED','Payment amount or currency changed during provider confirmation');

        let remaining=legacyMinorUnits(current.amount,current.currency);
        let allocationCount=0;
        const charges=await RentCharge.find({
          organizationId:current.organizationId,
          tenancyId:current.tenancyId,
          currency:current.currency,
          status:{$in:['OPEN','PARTIALLY_PAID','OVERDUE']},
          balanceAmount:{$gt:0},
        }).sort({dueDate:1,periodStart:1}).session(session);
        const outstanding=charges.reduce((sum,charge)=>addMinorUnits(sum,legacyMinorUnits(charge.balanceAmount,current.currency)),0);
        if(remaining>outstanding)throw new AppError(409,'UNALLOCATED_PROVIDER_PAYMENT','Provider payment exceeds outstanding rent charges');

        for(const charge of charges){
          if(remaining===0)break;
          const allocationMinor=Math.min(remaining,legacyMinorUnits(charge.balanceAmount,current.currency));
          await PaymentAllocation.create([{organizationId:current.organizationId,paymentId:current._id,rentChargeId:charge._id,amount:legacyMajorUnits(allocationMinor,current.currency),allocatedBy:current.createdBy}],{session});
          allocationCount+=1;
          const paidMinor=addMinorUnits(legacyMinorUnits(charge.paidAmount,current.currency),allocationMinor);
          const totalMinor=legacyMinorUnits(charge.totalAmount,current.currency);
          if(paidMinor>totalMinor)throw new AppError(409,'OVER_ALLOCATION','Provider allocation exceeds rent charge total');
          charge.paidAmount=legacyMajorUnits(paidMinor,current.currency);
          charge.balanceAmount=legacyMajorUnits(totalMinor-paidMinor,current.currency);
          charge.status=charge.balanceAmount===0?'PAID':'PARTIALLY_PAID';
          charge.updatedBy=current.updatedBy;
          await charge.save({session});
          remaining-=allocationMinor;
        }
        if(remaining!==0)throw new AppError(409,'ALLOCATION_INCOMPLETE','Provider payment could not be fully allocated');

        current.status='CONFIRMED';
        current.confirmedAt=new Date();
        current.paidAt=payment.paidAt??current.paidAt??new Date();
        if(payment.receiptNumber)current.receiptNumber=payment.receiptNumber;
        current.method=payment.method;
        await current.save({session});
        await AuditService.record({organizationId:current.organizationId,actorUserId:current.createdBy,action:'payment.provider.confirmed',resourceType:'Payment',resourceId:current._id,propertyId:current.propertyId,buildingId:current.buildingId,unitId:current.unitId,metadata:{amount:current.amount,currency:current.currency}},session);
        await AuditService.publish({organizationId:current.organizationId,name:'payment.confirmed',aggregateType:'Payment',aggregateId:current._id,source:'PROVIDER',payload:{propertyId:String(current.propertyId),buildingId:String(current.buildingId),unitId:String(current.unitId),amountMajorUnits:current.amount,currency:current.currency,provider:current.provider,allocationCount}},session);
        return current;
      });
      if(!confirmed)throw new AppError(500,'PAYMENT_CONFIRMATION_FAILED','Provider payment confirmation did not complete');
      return confirmed;
    } finally {
      await session.endSession();
    }
  }

  static async health() {
    return {
      providers: {
        mpesa: integrationConfig.mpesa.enabled,
        paystack: integrationConfig.paystack.enabled,
        email: Boolean(integrationConfig.sendgrid.apiKey),
        sms: Boolean(integrationConfig.twilio.accountSid),
        whatsapp: Boolean(integrationConfig.whatsapp.accessToken),
        cloudinary: Boolean(integrationConfig.cloudinary.cloudName),
        s3: Boolean(integrationConfig.s3.bucket),
        cctv: Boolean(integrationConfig.cctv.baseUrl),
        nvr: Boolean(integrationConfig.nvr.baseUrl),
      },
    };
  }

  static async userDestination(userId: string, channel: string) {
    const u = await User.findById(userId).lean();
    if (!u) throw new AppError(404, 'USER_NOT_FOUND', 'Notification user not found');
    if (channel === 'SMS' || channel === 'WHATSAPP') return u.phone;
    if (channel === 'EMAIL') return u.email;
    return undefined;
  }
}
