import crypto from 'node:crypto';
import { Types } from 'mongoose';
import { Payment } from '../../database/models/Payment.js';
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
import { OrganizationSubscription } from '../../database/models/OrganizationSubscription.js';
import { BillingEvent } from '../../database/models/BillingEvent.js';
import { integrationConfig } from '../../core/integrations/config.js';
import { verifyHmacSignature, hashPayload } from '../../core/integrations/webhook.security.js';
import { withRetry } from '../../core/integrations/retry.js';
import { toPaystackMinorUnits } from '../../core/integrations/paystack.provider.js';
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
    provider: 'MPESA' | 'PAYSTACK' | 'STRIPE',
    payload: Buffer,
    signature?: string,
  ) {
    const secret =
      provider === 'STRIPE'
        ? integrationConfig.stripe.webhookSecret
        : provider === 'PAYSTACK'
          ? integrationConfig.paystack.secretKey
          : integrationConfig.mpesa.webhookSecret;

    if (provider === 'PAYSTACK') {
      if (!secret) {
        throw new AppError(503, 'PAYSTACK_NOT_CONFIGURED', 'Paystack webhook verification is not configured');
      }
      if (!verifyHmacSignature(payload, signature, secret, 'sha512')) {
        throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid Paystack webhook signature');
      }
    } else if (provider === 'STRIPE' && secret) {
      if (!this.verifyStripe(payload, signature, secret)) {
        throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid Stripe webhook signature');
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

    // NOTE: previously this was a single expression mixing `&&` and `??`,
    // which esbuild rejects. Split into steps for clarity + correctness.
    let eventId: string;
    if (provider === 'STRIPE') {
      eventId = String(body.id ?? hashPayload(payload));
    } else if (provider === 'PAYSTACK') {
      const data = body.data as Record<string, unknown> | undefined;
      eventId = `${String(body.event ?? 'unknown')}:${String(data?.reference ?? data?.id ?? hashPayload(payload))}`;
    } else {
      const callback = (body.Body as Record<string, unknown> | undefined)?.stkCallback as
        | Record<string, unknown>
        | undefined;
      eventId = String(callback?.CheckoutRequestID ?? hashPayload(payload));
    }

    const existing = await WebhookEvent.findOne({ provider, eventId });
    if (existing) return existing;

    const event = await WebhookEvent.create({
      provider,
      eventId,
      payloadHash: hashPayload(payload),
      payload: this.sanitizedWebhookPayload(provider, body),
      status: 'RECEIVED',
    });

    try {
      if (provider === 'STRIPE') await this.processStripe(body);
      else if (provider === 'PAYSTACK') await this.processPaystack(body);
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

  private static verifyStripe(payload: Buffer, header: string | undefined, secret: string) {
    if (!header) return false;
    const parts = Object.fromEntries(header.split(',').map((x) => x.split('=')));
    const timestamp = parts.t;
    if (!timestamp || !parts.v1) return false;
    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (age > 300) return false;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${payload.toString('utf8')}`)
      .digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
    } catch {
      return false;
    }
  }

  static async processStripe(body: Record<string, unknown>) {
    const type = String(body.type ?? '');
    const obj = body.data as Record<string, unknown> | undefined;
    const object = obj?.object as Record<string, unknown> | undefined;
    const id = String(object?.id ?? '');

    if (type === 'payment_intent.succeeded' || type === 'payment_intent.payment_failed') {
      const p = await Payment.findOne({ provider: 'STRIPE', providerTransactionId: id });
      if (!p) return;
      if (type === 'payment_intent.payment_failed') {
        p.status = 'FAILED';
        await p.save();
        return;
      }
      this.assertProviderAmount(p, {
        provider: 'STRIPE',
        providerTransactionId: id,
        status: 'CONFIRMED',
        amountMinorUnits: Number(object?.amount_received),
        currency: String(object?.currency ?? '').toUpperCase(),
      });
      await this.confirmProviderPayment(p);
      return;
    }

    await this.processBillingStripeEvent(type, object ?? {}, String(body.id ?? id));
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
    if (eventType !== 'charge.success') return;

    const data = body.data as Record<string, unknown> | undefined;
    if (!data || String(data.status ?? '') !== 'success') return;
    const reference = String(data.reference ?? '');
    if (!reference) throw new AppError(400, 'PAYSTACK_REFERENCE_MISSING', 'Paystack reference is missing');

    const payment = await Payment.findOne({
      provider: 'PAYSTACK',
      providerTransactionId: reference,
    });
    if (!payment) return;

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
    if (payment.provider !== 'PAYSTACK' && payment.provider !== 'STRIPE') return;
    if (!Number.isSafeInteger(result.amountMinorUnits)) {
      throw new AppError(409, 'PROVIDER_AMOUNT_MISSING', 'Provider did not return a valid amount');
    }
    if (result.amountMinorUnits !== toPaystackMinorUnits(payment.amount)) {
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
    provider: 'MPESA' | 'PAYSTACK' | 'STRIPE',
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
            }
          : undefined,
      };
    }
    if (provider === 'STRIPE') {
      const data = body.data as Record<string, unknown> | undefined;
      const object = data?.object as Record<string, unknown> | undefined;
      return {
        id: body.id,
        type: body.type,
        data: object
          ? {
              id: object.id,
              status: object.status,
              amount_received: object.amount_received,
              currency: object.currency,
              subscription: object.subscription,
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
      status: string;
      paidAt?: Date | null;
      confirmedAt?: Date | null;
      createdBy: Types.ObjectId;
      updatedBy: Types.ObjectId;
      save(): Promise<unknown>;
    },
  ) {
    if (payment.status === 'CONFIRMED') return payment;
    if (payment.status !== 'PENDING') {
      throw new AppError(
        409,
        'INVALID_PAYMENT_STATE',
        'Provider payment must be pending before confirmation',
      );
    }

    let remaining = payment.amount;
    const charges = await RentCharge.find({
      organizationId: payment.organizationId,
      tenancyId: payment.tenancyId,
      status: { $in: ['OPEN', 'PARTIALLY_PAID', 'OVERDUE'] },
      balanceAmount: { $gt: 0 },
    }).sort({ dueDate: 1, periodStart: 1 });

    const outstanding = charges.reduce((sum, charge) => sum + charge.balanceAmount, 0);
    if (payment.amount > outstanding + 0.000001) {
      throw new AppError(
        409,
        'UNALLOCATED_PROVIDER_PAYMENT',
        'Provider payment exceeds outstanding rent charges',
      );
    }

    for (const charge of charges) {
      if (remaining <= 0.000001) break;
      const allocationAmount = Math.min(remaining, charge.balanceAmount);
      await PaymentAllocation.create({
        organizationId: payment.organizationId,
        paymentId: payment._id,
        rentChargeId: charge._id,
        amount: allocationAmount,
        allocatedBy: payment.createdBy,
      });
      charge.paidAmount += allocationAmount;
      charge.balanceAmount = Math.max(0, charge.totalAmount - charge.paidAmount);
      charge.status = charge.balanceAmount === 0 ? 'PAID' : 'PARTIALLY_PAID';
      charge.updatedBy = payment.updatedBy;
      await charge.save();
      remaining -= allocationAmount;
    }

    if (remaining > 0.000001) {
      throw new AppError(409, 'ALLOCATION_INCOMPLETE', 'Provider payment could not be fully allocated');
    }

    payment.status = 'CONFIRMED';
    payment.confirmedAt = new Date();
    payment.paidAt = payment.paidAt ?? new Date();
    await payment.save();
    await AuditService.record({
      organizationId: payment.organizationId,
      actorUserId: payment.createdBy,
      action: 'payment.provider.confirmed',
      resourceType: 'Payment',
      resourceId: payment._id,
      propertyId: payment.propertyId,
      buildingId: payment.buildingId,
      unitId: payment.unitId,
      metadata: { amount: payment.amount },
    });
    return payment;
  }

  static async processBillingStripeEvent(
    type: string,
    object: Record<string, unknown>,
    eventId: string,
  ) {
    if (
      ![
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'invoice.paid',
        'invoice.payment_failed',
      ].includes(type)
    ) {
      return;
    }

    let subscription = null as Awaited<ReturnType<typeof OrganizationSubscription.findOne>>;
    const objectId = String(object.id ?? '');
    if (type.startsWith('customer.subscription.')) {
      subscription = objectId
        ? await OrganizationSubscription.findOne({ provider: 'STRIPE', providerSubscriptionId: objectId })
        : null;
    }

    if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
      if (subscription) {
        const status = String(object.status ?? '');
        subscription.status =
          status === 'active'
            ? 'ACTIVE'
            : status === 'trialing'
              ? 'TRIALING'
              : status === 'past_due'
                ? 'PAST_DUE'
                : status === 'canceled'
                  ? 'CANCELLED'
                  : subscription.status;
        const start = Number(object.current_period_start);
        const end = Number(object.current_period_end);
        if (Number.isFinite(start)) subscription.currentPeriodStart = new Date(start * 1000);
        if (Number.isFinite(end)) subscription.currentPeriodEnd = new Date(end * 1000);
        await subscription.save();
      }
      await BillingEvent.findOneAndUpdate(
        { eventId },
        {
          organizationId: subscription?.organizationId,
          provider: 'STRIPE',
          type: type.endsWith('created') ? 'SUBSCRIPTION_CREATED' : 'SUBSCRIPTION_UPDATED',
          externalReference: objectId,
          payloadHash: hashPayload(Buffer.from(JSON.stringify(object))),
          payload: object,
          status: 'PROCESSED',
          processedAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      return;
    }

    if (type === 'customer.subscription.deleted') {
      if (subscription) {
        subscription.status = 'CANCELLED';
        subscription.cancelledAt = new Date();
        await subscription.save();
      }
      await BillingEvent.findOneAndUpdate(
        { eventId },
        {
          organizationId: subscription?.organizationId,
          provider: 'STRIPE',
          type: 'SUBSCRIPTION_CANCELLED',
          externalReference: objectId,
          payload: object,
          status: 'PROCESSED',
          processedAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      return;
    }

    const providerInvoiceId = objectId;
    const providerSubscriptionId = String(object.subscription ?? '');
    subscription = providerSubscriptionId
      ? await OrganizationSubscription.findOne({ provider: 'STRIPE', providerSubscriptionId })
      : null;

    const invoice = subscription
      ? await SubscriptionInvoice.findOne({
          organizationId: subscription.organizationId,
          provider: 'STRIPE',
          providerInvoiceId,
        })
      : null;

    if (invoice && type === 'invoice.paid') {
      invoice.amountPaid = invoice.total;
      invoice.status = 'PAID';
      invoice.paidAt = new Date();
      await invoice.save();
      subscription!.status = 'ACTIVE';
      await subscription!.save();
    }
    if (invoice && type === 'invoice.payment_failed') {
      invoice.status = 'PAST_DUE';
      await invoice.save();
      subscription!.status = 'PAST_DUE';
      await subscription!.save();
    }

    await BillingEvent.findOneAndUpdate(
      { eventId },
      {
        organizationId: subscription?.organizationId,
        provider: 'STRIPE',
        type: type === 'invoice.paid' ? 'INVOICE_PAID' : 'INVOICE_FAILED',
        externalReference: providerInvoiceId,
        payload: object,
        status: 'PROCESSED',
        processedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  static async health() {
    return {
      providers: {
        mpesa: integrationConfig.mpesa.enabled,
        paystack: integrationConfig.paystack.enabled,
        stripe: integrationConfig.stripe.enabled,
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
